// Etap 2b: mapowanie pozycji kosztowych faktury na pola PRZED kalkulatora.
// Jawne reguły po kategorii + jednostce + podstawie naliczenia (nie po samej nazwie).
// Jednostki zapisu odpowiadają silnikowi calculateEnergyCosts:
//  - active_energy_price_before_zoneN: zł/MWh
//  - variable_distribution_before_zoneN_rate: C/G → zł/kWh (silnik ×1000), B/A → zł/MWh
//  - contracted_power_charge_rate_before: zł/kW/mies (silnik × moc × miesiące okresu)
//  - handling_fee_before: zł/mies (silnik × miesiące okresu)
//  - capacity_charge_before, fixed_distribution_before_total, reactive_energy_cost_before: kwota zł za cały okres analizy

import type { EnergyAnalysis } from '@/types/database';
import { getZonesCount, isRatesInMWh } from './tariff-utils';
import { zoneFromName, type InvoicePpeRecord } from './invoice-import';

export interface LineItemInput {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  net_value: number | null;
  category: string | null;
  page: number | null;
}

export type LineTarget =
  | 'active_energy_price_before_zone1' | 'active_energy_price_before_zone2' | 'active_energy_price_before_zone3'
  | 'variable_distribution_before_zone1_rate' | 'variable_distribution_before_zone2_rate' | 'variable_distribution_before_zone3_rate'
  | 'contracted_power_charge_rate_before'
  | 'handling_fee_before'
  | 'capacity_charge_before'
  | 'fixed_distribution_before_total'
  | 'reactive_energy_cost_before';

export const LINE_TARGET_LABELS: Record<LineTarget, string> = {
  active_energy_price_before_zone1: 'Cena energii czynnej PRZED — strefa 1',
  active_energy_price_before_zone2: 'Cena energii czynnej PRZED — strefa 2',
  active_energy_price_before_zone3: 'Cena energii czynnej PRZED — strefa 3',
  variable_distribution_before_zone1_rate: 'Składnik zmienny stawki sieciowej PRZED — strefa 1',
  variable_distribution_before_zone2_rate: 'Składnik zmienny stawki sieciowej PRZED — strefa 2',
  variable_distribution_before_zone3_rate: 'Składnik zmienny stawki sieciowej PRZED — strefa 3',
  contracted_power_charge_rate_before: 'Składnik stały stawki sieciowej PRZED',
  handling_fee_before: 'Opłata handlowa PRZED (miesięcznie)',
  capacity_charge_before: 'Opłata mocowa PRZED (kwota za okres)',
  fixed_distribution_before_total: 'Suma pozostałych opłat PRZED (kwota za okres)',
  reactive_energy_cost_before: 'Energia bierna PRZED (kwota za okres)',
};

export type LineKind =
  | 'active' | 'variable_network' | 'fixed_network' | 'handling'
  | 'capacity' | 'subscription' | 'reactive' | 'quality_oze_chp' | 'other' | 'balance';

/** Pole zbiorcze: kwoty netto pozycji są sumowane (nie stawki). */
export const OTHER_SUM_TARGET: LineTarget = 'fixed_distribution_before_total';
export const CAPACITY_TARGET: LineTarget = 'capacity_charge_before';
/** Pola, do których kwoty netto kilku pozycji są sumowane (bez konfliktu). */
export const SUMMED_TARGETS: LineTarget[] = [OTHER_SUM_TARGET, CAPACITY_TARGET];
export const PO_ONLY_WARNING = 'Ujęcie tego kosztu tylko w PRZED może zawyżyć oszczędność, jeśli ten koszt pozostaje także w PO.';

export interface LineMapping {
  item: LineItemInput;
  kind: LineKind;
  /** Pola zgodne znaczeniowo — tylko z nich można wybrać ręcznie. */
  allowedTargets: LineTarget[];
  target: LineTarget | null;
  status: 'mapped' | 'needs_assignment' | 'unsupported';
  /** Wartość po przeliczeniu do jednostki pola (pełna precyzja). */
  converted: number | null;
  convertedUnit: string | null;
  /** Ostrzeżenia: konflikty, różnice w sposobie naliczenia. */
  warnings: string[];
  /** Informacje bez konfliktu (np. różnica sposobu naliczenia). */
  info: string[];
  reason: string | null;
}

const lc = (s: string | null | undefined) => (s || '').toLowerCase();

export function classifyItem(item: LineItemInput): LineKind {
  const n = lc(item.name);
  const c = lc(item.category);
  if (/saldo|zaległ|zaleg|nadpłat|nadplat|do zapłaty|do zaplaty|podsumow|razem|ogółem|ogolem|wartość faktury|należność|naleznosc/.test(n)) return 'balance';
  if (c === 'energia_czynna') return 'active';
  if (c === 'handlowa') return 'handling';
  if (c === 'mocowa' || n.includes('mocow')) return 'capacity';
  if (c === 'abonament' || n.includes('abonament')) return 'subscription';
  if (c === 'energia_bierna' || n.includes('biern')) return 'reactive';
  if (n.includes('jakościow') || n.includes('jakosciow') || n.includes('oze') || n.includes('kogener') || n.includes('przejściow')) {
    return 'quality_oze_chp';
  }
  if (n.includes('sieciow') && (n.includes('zmienn'))) return 'variable_network';
  if (n.includes('sieciow') && (n.includes('stał') || n.includes('stal'))) return 'fixed_network';
  return 'other';
}

/** Jednostka ilości: 'kwh' | 'mwh' | 'kw' | 'month' | 'kvarh' | null */
export function quantityUnit(unit: string | null): 'kwh' | 'mwh' | 'kw' | 'month' | 'kvarh' | null {
  const u = lc(unit).replace(/\s/g, '');
  if (u.includes('kvarh') || u.includes('kvar')) return 'kvarh';
  if (u.includes('mwh')) return 'mwh';
  if (u.includes('kwh')) return 'kwh';
  if (u === 'kw' || u.endsWith('/kw') || u.startsWith('kw')) return 'kw';
  if (u.includes('mc') || u.includes('mies') || u.includes('m-c')) return 'month';
  return null;
}

/** zł/kWh → zł/MWh (×1000). */
export const perKwhToPerMwh = (v: number) => v * 1000;
/** kWh → MWh (/1000). */
export const kwhToMwh = (v: number) => v / 1000;

function zonesFor(kind: 'active' | 'variable'): LineTarget[] {
  return kind === 'active'
    ? ['active_energy_price_before_zone1', 'active_energy_price_before_zone2', 'active_energy_price_before_zone3']
    : ['variable_distribution_before_zone1_rate', 'variable_distribution_before_zone2_rate', 'variable_distribution_before_zone3_rate'];
}

const ALLOWED: Record<LineKind, LineTarget[]> = {
  active: zonesFor('active'),
  variable_network: zonesFor('variable'),
  fixed_network: ['contracted_power_charge_rate_before'],
  handling: ['handling_fee_before'],
  capacity: ['capacity_charge_before', 'fixed_distribution_before_total'],
  subscription: ['fixed_distribution_before_total'],
  reactive: ['reactive_energy_cost_before', 'fixed_distribution_before_total'],
  quality_oze_chp: ['fixed_distribution_before_total'],
  other: ['fixed_distribution_before_total'],
  balance: [],
};

/** Przeliczenie wartości pozycji do jednostki pola docelowego. null = niemożliwe. */
export function convertForTarget(
  item: LineItemInput,
  target: LineTarget,
  tariffCode: string
): { value: number; unit: string } | null {
  const qu = quantityUnit(item.unit);
  if (target.startsWith('active_energy_price')) {
    if (item.rate == null) return null;
    if (qu === 'kwh') return { value: perKwhToPerMwh(item.rate), unit: 'zł/MWh' };
    if (qu === 'mwh') return { value: item.rate, unit: 'zł/MWh' };
    return null;
  }
  if (target.startsWith('variable_distribution')) {
    if (item.rate == null) return null;
    const inMwh = isRatesInMWh(tariffCode);
    if (qu === 'kwh') return inMwh ? { value: perKwhToPerMwh(item.rate), unit: 'zł/MWh' } : { value: item.rate, unit: 'zł/kWh' };
    if (qu === 'mwh') return inMwh ? { value: item.rate, unit: 'zł/MWh' } : { value: item.rate / 1000, unit: 'zł/kWh' };
    return null;
  }
  if (target === 'contracted_power_charge_rate_before') {
    if (item.rate == null || qu !== 'kw') return null;
    return { value: item.rate, unit: 'zł/kW/mies' };
  }
  if (target === 'handling_fee_before') {
    if (item.rate == null || qu !== 'month') return null;
    return { value: item.rate, unit: 'zł/mies' };
  }
  // Pola kwotowe — kwota netto pozycji za okres faktury
  if (item.net_value == null) return null;
  return { value: item.net_value, unit: 'zł (kwota za okres faktury)' };
}

function zoneIndexFromName(name: string, zoneNames: string[]): number | null {
  const n = lc(name);
  const hits = zoneNames.map((z, i) => (z && n.includes(lc(z)) ? i : -1)).filter((i) => i >= 0);
  return hits.length === 1 ? hits[0] : null;
}

function daysInclusive(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const d = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : null;
}

/** Główna funkcja: propozycja mapowania wszystkich pozycji jednego PPE. */
export function mapLineItems(
  items: LineItemInput[],
  record: Pick<InvoicePpeRecord, 'tariff_code' | 'consumption' | 'period_from' | 'period_to' | 'contracted_power_kw'>,
  analysis: Partial<EnergyAnalysis> | null,
  overrides: Record<string, LineTarget | null> = {}
): LineMapping[] {
  const tariff = record.tariff_code || analysis?.tariff_code_before || 'C11';
  const zones = getZonesCount(tariff) || 1;
  const zoneNames = (record.consumption || []).map((c) => c.zone_name);
  const samePeriod =
    !!analysis && analysis.period_from === record.period_from && analysis.period_to === record.period_to;

  const draft: LineMapping[] = items.map((item) => {
    const kind = classifyItem(item);
    const allowed = ALLOWED[kind].filter((t) => {
      const m = t.match(/zone(\d)/);
      return !m || Number(m[1]) <= zones;
    });
    const warnings: string[] = [];
    const info: string[] = [];
    let target: LineTarget | null = null;
    let reason: string | null = null;
    let status: LineMapping['status'] = 'needs_assignment';

    if (kind === 'balance') {
      status = 'unsupported';
      reason = 'Saldo, zaległość, nadpłata lub podsumowanie — nie jest kosztem do analizy.';
    } else if (kind === 'quality_oze_chp' || kind === 'other' || kind === 'subscription') {
      // Sugestia: „Suma pozostałych opłat” (kwota netto za okres). Zastosowanie tylko po zaznaczeniu.
      target = OTHER_SUM_TARGET;
      status = 'mapped';
      reason = 'Brak dedykowanego pola — sugerowane „Suma pozostałych opłat PRZED” (kwota netto za okres).';
      warnings.push(PO_ONLY_WARNING);
    } else if (kind === 'active' || kind === 'variable_network') {
      const same = items.filter((i) => classifyItem(i) === kind);
      if (same.length === 1 && zones === 1) target = allowed[0];
      else {
        let zi = zoneIndexFromName(item.name, zoneNames);
        if (zi == null && zones > 1) {
          const z = zoneFromName(item.name.replace(/^.*?(sieciow\w*|energi\w*)\s+(zmienn\w*|czynn\w*)?/i, ''), zones);
          if (typeof z === 'number') zi = z - 1;
        }
        if (zi != null && zi < zones) target = allowed[zi];
        else reason = 'Nie da się jednoznacznie ustalić strefy — wybierz pole ręcznie.';
      }
      if (target) status = 'mapped';
    } else if (kind === 'fixed_network') {
      target = allowed[0];
      status = 'mapped';
      if (item.quantity != null && item.rate != null && item.net_value != null) {
        const full = item.quantity * item.rate;
        if (Math.abs(full - item.net_value) > 0.01) {
          const share = item.net_value / full;
          const days = daysInclusive(record.period_from, record.period_to);
          info.push(
            `Na fakturze naliczono ${(share * 100).toFixed(1).replace('.', ',')}% pełnego miesiąca` +
              (days ? ` (okres ${days} dni)` : '') +
              '. Kalkulator stosuje stawkę miesięczną × moc umowna × liczba miesięcy okresu analizy — kwota faktury nie zostanie odtworzona 1:1.'
          );
        }
      }
      if (record.contracted_power_kw != null && item.quantity != null && item.quantity !== record.contracted_power_kw) {
        warnings.push(`Podstawa naliczenia (${item.quantity} kW) różni się od mocy umownej (${record.contracted_power_kw} kW).`);
      }
    } else if (kind === 'handling') {
      if (quantityUnit(item.unit) === 'month') {
        target = allowed[0];
        status = 'mapped';
      } else reason = 'Jednostka opłaty handlowej nie jest miesięczna — wymaga przypisania.';
    } else {
      // capacity / subscription / reactive → pola kwotowe za cały okres analizy
      reason =
        kind === 'capacity'
          ? 'W kalkulatorze opłata mocowa to kwota za cały okres analizy. Faktura podaje stawkę z własną podstawą naliczenia' +
            (item.quantity != null ? ` (${item.quantity} ${item.unit || ''})` : '') +
            ' — nie stosuję jej do całego zużycia. Możesz przenieść kwotę tylko, jeśli okres faktury = okres analizy.'
          : 'W kalkulatorze energia bierna to kwota za okres analizy.';
    }

    return { item, kind, allowedTargets: allowed, target, status, converted: null, convertedUnit: null, warnings, info, reason };
  });

  // Ręczne wybory użytkownika
  for (const m of draft) {
    if (!(m.item.id in overrides)) continue;
    const o = overrides[m.item.id];
    if (o === null) { m.target = null; m.status = m.status === 'unsupported' ? 'unsupported' : 'needs_assignment'; continue; }
    if (m.allowedTargets.includes(o)) {
      m.target = o; m.status = 'mapped';
      if (o === OTHER_SUM_TARGET && !m.warnings.includes(PO_ONLY_WARNING)) m.warnings.push(PO_ONLY_WARNING);
      if (o !== OTHER_SUM_TARGET) m.warnings = m.warnings.filter((w) => w !== PO_ONLY_WARNING);
    }
  }

  // Kilka pozycji na to samo pole → nie sumuję ani nie wybieram arbitralnie
  const counts = new Map<LineTarget, number>();
  for (const m of draft) if (m.target && !SUMMED_TARGETS.includes(m.target)) counts.set(m.target, (counts.get(m.target) || 0) + 1);
  for (const m of draft) {
    if (m.target && (counts.get(m.target) || 0) > 1) {
      m.warnings.push('Kilka pozycji wskazuje to samo pole (np. różne okresy stawek). Nie sumuję stawek — zostaw jedną pozycję.');
      m.status = 'needs_assignment';
    }
  }

  for (const m of draft) {
    if (!m.target) continue;
    const conv = convertForTarget(m.item, m.target, tariff);
    if (!conv) {
      m.status = 'needs_assignment';
      m.warnings.push('Jednostka pozycji nie pasuje do pola — brak przeliczenia.');
      continue;
    }
    m.converted = conv.value;
    m.convertedUnit = conv.unit;
    const isAmount = ['capacity_charge_before', 'fixed_distribution_before_total', 'reactive_energy_cost_before'].includes(m.target);
    if (isAmount && !samePeriod && m.target !== OTHER_SUM_TARGET) {
      m.warnings.push('Okres faktury różni się od okresu analizy — kwota z faktury nie odpowiada kwocie za cały okres analizy.');
    }
    if (m.target === 'reactive_energy_cost_before' && analysis?.reactive_monthly_mode_before) {
      m.warnings.push('Energia bierna PRZED jest w trybie miesięcznym — pole roczne nie będzie użyte w obliczeniach.');
    }
    const cur = analysis ? Number((analysis as unknown as Record<string, unknown>)[m.target]) || 0 : 0;
    if (!SUMMED_TARGETS.includes(m.target) && cur && Math.abs(cur - conv.value) > 1e-9 && (analysis?.value_sources as Record<string, { source?: string }> | undefined)?.[m.target]?.source === 'manual') {
      m.warnings.push('Pole ma ręczną korektę — zostanie zastąpione wartością z faktury.');
    }
  }
  return draft;
}

/** Pozycje „poprawnie przypisane” — bez ostrzeżeń, do „Zaznacz wszystkie”. */
export const isCleanMapping = (m: LineMapping) =>
  m.status === 'mapped' && m.converted != null && m.warnings.length === 0;

/** Wkład jednej pozycji faktury do „Sumy pozostałych opłat” — zapisywany w value_sources. */
export interface OtherContribution {
  document_id: string;
  item_ref: string;
  name: string;
  net_value: number;
  page: number | null;
  period_from: string | null;
  period_to: string | null;
}
export type OtherSumMode = 'replace' | 'add';

export interface OtherSumPlan {
  items: OtherContribution[];
  total: number;
  current: number;
  /** Wkład tego samego dokumentu zastosowany wcześniej (odejmowany przy dodawaniu). */
  previousSameDoc: number;
  /** Czy użytkownik musi wybrać „Zastąp” / „Dodaj”. */
  needsMode: boolean;
  /** Wartość pola po zastosowaniu; null = brak decyzji. */
  result: number | null;
  breakdown: OtherContribution[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Sumuje kwoty netto zaznaczonych pozycji przypisanych do „Sumy pozostałych opłat” jednego PPE. */
export function planOtherCharges(args: {
  maps: LineMapping[];
  selected: Set<string>;
  documentId: string;
  period: { from: string | null; to: string | null };
  current: number | null | undefined;
  previous: OtherContribution[] | null | undefined;
  mode: OtherSumMode | null;
  target?: LineTarget;
}): OtherSumPlan {
  const tgt = args.target ?? OTHER_SUM_TARGET;
  const items: OtherContribution[] = args.maps
    .filter((m) => m.target === tgt && m.status === 'mapped' && args.selected.has(m.item.id) && m.item.net_value != null)
    .map((m) => ({
      document_id: args.documentId, item_ref: m.item.id, name: m.item.name, net_value: m.item.net_value!,
      page: m.item.page, period_from: args.period.from, period_to: args.period.to,
    }));
  const total = round2(items.reduce((s, i) => s + i.net_value, 0));
  const current = Number(args.current) || 0;
  const prev = args.previous || [];
  const prevSame = prev.filter((p) => p.document_id === args.documentId);
  const previousSameDoc = round2(prevSame.reduce((s, i) => s + i.net_value, 0));
  // Ponowna edycja: wkład tego dokumentu jest przeliczany (domyślnie „Dodaj” = podmiana własnego wkładu).
  const mode = args.mode ?? (previousSameDoc > 0 ? 'add' : null);
  const needsMode = items.length > 0 && current !== 0 && previousSameDoc === 0;
  let result: number | null = null;
  let breakdown: OtherContribution[] = items;
  if (items.length) {
    if ((!needsMode && previousSameDoc === 0) || mode === 'replace') result = total;
    else if (mode === 'add') {
      result = round2(current - previousSameDoc + total);
      breakdown = [...prev.filter((p) => p.document_id !== args.documentId), ...items];
    }
  } else if (previousSameDoc > 0) {
    // Wszystkie pozycje odznaczone — dokument przestaje zasilać pole, wkład innych faktur zostaje.
    result = round2(current - previousSameDoc);
    breakdown = prev.filter((p) => p.document_id !== args.documentId);
  }
  return { items, total, current, previousSameDoc, needsMode, result, breakdown };
}

/** Pozycje opłaty mocowej jednego PPE (grupa do zaznaczania zbiorczego). */
export const capacityGroup = (maps: LineMapping[]) => maps.filter((m) => m.kind === 'capacity');
/** Czy pozycję grupy da się zastosować; null = tak, inaczej przyczyna blokady. */
export function capacityBlockReason(m: LineMapping): string | null {
  if (m.item.net_value == null) return 'Brak kwoty netto na fakturze.';
  if (m.target === CAPACITY_TARGET && m.converted == null) return m.warnings[0] || 'Brak przeliczenia.';
  return null;
}
