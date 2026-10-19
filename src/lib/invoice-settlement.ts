// Etap 3: zbiorcze rozliczenie wielu faktur dla jednego PPE w obrębie analizy.
// Czyste funkcje: zestawienie liczone zawsze od nowa z zatwierdzonych rekordów i zaznaczonych pozycji
// (brak przyrostowego dodawania do poprzedniej sumy => ponowny zapis nie tworzy duplikatów).

import { normalizePpe } from './project-totals';
import { mapConsumptionZones, normalizeTariffCode, zoneFromName, type InvoicePpeRecord } from './invoice-import';
import { classifyItem, fullMonths, type LineKind } from './invoice-line-mapping';
import { getZonesCount } from './tariff-utils';

export interface SettlementDoc {
  id: string;
  file_name: string;
  status: string;
  doc_type: string | null;
  issuer: string | null;
  document_number: string | null;
  corrected_document_number: string | null;
  file_hash: string | null;
}

export interface SettlementItem {
  id: string;
  document_id: string;
  ppe_record_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  net_value: number | null;
  category: string | null;
  page: number | null;
}

export type Stream = 'sales' | 'distribution' | 'both';

export interface Component {
  docId: string;
  docName: string;
  recordId: string;
  period_from: string | null;
  period_to: string | null;
  label: string;
  value: number | null;
  unit: string;
}

export interface SettlementEntry {
  record: InvoicePpeRecord;
  doc: SettlementDoc;
  stream: Stream;
  included: boolean;
  /** Zużycie z tego rekordu liczone do sumy (false np. gdy pokrywa je faktura dystrybucyjna). */
  consumptionCounted: boolean;
  notes: string[];
}

export interface ZoneSummary {
  zone: number;
  mwh: number | null;
  /** Część rozliczeń bez odczytu tej strefy — suma niepełna. */
  incomplete: boolean;
  activeCost: number | null;
  /** zł/MWh = koszt energii czynnej strefy / zużycie strefy; null gdy brak pełnego pokrycia. */
  price: number | null;
  priceNote: string | null;
  components: Component[];
  costComponents: Component[];
}

export interface CostSummary {
  kind: LineKind;
  label: string;
  total: number;
  missingAmounts: number;
  components: Component[];
}

export interface Interval { from: string; to: string }

export interface Settlement {
  ppeNumber: string;
  entries: SettlementEntry[];
  pending: { doc: SettlementDoc; record: InvoicePpeRecord }[];
  tariffs: { code: string; period_from: string | null; period_to: string | null }[];
  zones: number | null;
  zoneSummaries: ZoneSummary[];
  costs: CostSummary[];
  totalNet: number;
  contractedPower: { kw: number; period_from: string | null; period_to: string | null }[];
  pmax: { kw: number; period_from: string | null; period_to: string | null } | null;
  pmaxMissing: number;
  handling: { totalNet: number; months: number | null; monthly: number | null; rates: number[]; note: string | null } | null;
  proposedPeriod: Interval | null;
  gaps: Interval[];
  issues: string[];
  /** Pola, których nie można zapisać jednym zestawem (zmiana taryfy, stref, mocy). */
  blocked: string[];
}

export const KIND_LABELS: Record<LineKind, string> = {
  active: 'Energia czynna',
  variable_network: 'Składnik zmienny stawki sieciowej',
  fixed_network: 'Składnik stały stawki sieciowej',
  handling: 'Opłata handlowa',
  capacity: 'Opłata mocowa',
  subscription: 'Abonament',
  reactive: 'Energia bierna',
  quality_oze_chp: 'Opłaty jakościowa / OZE / kogeneracyjna / przejściowa',
  other: 'Pozostałe opłaty',
  balance: 'Saldo / do zapłaty (pomijane)',
};

const COST_ORDER: LineKind[] = ['active', 'variable_network', 'fixed_network', 'quality_oze_chp', 'capacity', 'subscription', 'handling', 'reactive', 'other'];

export function streamOf(docType: string | null | undefined): Stream {
  const t = (docType || '').toLowerCase();
  if (t.startsWith('sprzed')) return 'sales';
  if (t.startsWith('dystryb')) return 'distribution';
  return 'both';
}

const dayMs = 86400000;
const toDay = (s: string) => Math.round(Date.parse(s.slice(0, 10) + 'T00:00:00Z') / dayMs);
const fromDay = (d: number) => new Date(d * dayMs).toISOString().slice(0, 10);

export const overlaps = (a: Interval, b: Interval) => toDay(a.from) <= toDay(b.to) && toDay(b.from) <= toDay(a.to);

/** Luki między rozliczeniami (dni nieobjęte żadnym okresem) w obrębie [min, max]. */
export function coverageGaps(intervals: Interval[]): Interval[] {
  const s = intervals.filter((i) => i.from && i.to).map((i) => [toDay(i.from), toDay(i.to)] as [number, number]).sort((a, b) => a[0] - b[0]);
  const gaps: Interval[] = [];
  let end: number | null = null;
  for (const [f, t] of s) {
    if (end != null && f > end + 1) gaps.push({ from: fromDay(end + 1), to: fromDay(f - 1) });
    end = end == null ? t : Math.max(end, t);
  }
  return gaps;
}

const docKey = (d: SettlementDoc) =>
  d.document_number ? `${(d.issuer || '').trim().toLowerCase()}|${d.document_number.replace(/\s+/g, '').toUpperCase()}` : null;

function selectedItemIds(record: InvoicePpeRecord): Set<string> | null {
  const st = record.review_state as { lineSelected?: string[] } | null | undefined;
  return st && Array.isArray(st.lineSelected) ? new Set(st.lineSelected) : null;
}

/**
 * Buduje zestawienie dla PPE. Do sum wchodzą wyłącznie rekordy zatwierdzonych dokumentów,
 * bez powtórzonych dokumentów, korekt bez rozstrzygnięcia i nakładających się okresów tego samego strumienia.
 */
export function buildSettlement(args: {
  ppeNumber: string;
  analysisId?: string | null;
  docs: SettlementDoc[];
  records: InvoicePpeRecord[];
  items: SettlementItem[];
}): Settlement {
  const num = normalizePpe(args.ppeNumber);
  const docById = new Map(args.docs.map((d) => [d.id, d]));
  const mine = args.records.filter((r) => (num && normalizePpe(r.ppe_number) === num) || (args.analysisId && r.matched_analysis_id === args.analysisId));
  const issues: string[] = [];
  const pending: Settlement['pending'] = [];
  const entries: SettlementEntry[] = [];

  const sorted = [...mine].sort((a, b) => String(a.period_from || '').localeCompare(String(b.period_from || '')));
  const seenHash = new Map<string, string>();
  const seenNum = new Map<string, string>();
  for (const record of sorted) {
    const doc = docById.get(record.document_id);
    if (!doc) continue;
    if (doc.status !== 'approved') { pending.push({ doc, record }); continue; }
    const e: SettlementEntry = { record, doc, stream: streamOf(doc.doc_type), included: true, consumptionCounted: true, notes: [] };
    const dupOf = (doc.file_hash && seenHash.get(doc.file_hash)) || (docKey(doc) && seenNum.get(docKey(doc)!));
    if (dupOf && dupOf !== doc.id) {
      e.included = false;
      e.notes.push(`Powtórny dokument (taki sam jak „${docById.get(dupOf)?.file_name}”) — pominięty.`);
    }
    if (e.included && (doc.doc_type || '').toLowerCase().startsWith('korekt')) {
      e.included = false;
      const orig = args.docs.find((d) => d.document_number && doc.corrected_document_number && d.document_number.replace(/\s+/g, '') === doc.corrected_document_number.replace(/\s+/g, ''));
      e.notes.push(orig
        ? `Korekta dokumentu „${orig.file_name}” — wymaga rozstrzygnięcia (różnicowa czy przed/po); nie wliczono automatycznie.`
        : `Korekta${doc.corrected_document_number ? ` faktury ${doc.corrected_document_number}` : ''} — dokument pierwotny nie jest wgrany; nie wliczono automatycznie.`);
    }
    if (e.included && (doc.doc_type || '').toLowerCase().startsWith('prognoz')) {
      e.included = false;
      e.notes.push('Faktura prognozowa — nie jest rozliczeniem rzeczywistym; pominięta.');
    }
    if (e.included && (!record.period_from || !record.period_to)) {
      e.notes.push('Brak okresu rozliczenia — nie można ocenić pokrycia.');
    }
    if (e.included) {
      if (doc.file_hash) seenHash.set(doc.file_hash, doc.id);
      if (docKey(doc)) seenNum.set(docKey(doc)!, doc.id);
    }
    entries.push(e);
  }

  // Nakładanie okresów w tym samym strumieniu (lub z fakturą kompleksową) = konflikt.
  const inc = () => entries.filter((e) => e.included && e.record.period_from && e.record.period_to);
  for (const e of inc()) {
    const iv = { from: e.record.period_from!, to: e.record.period_to! };
    const clash = inc().find((o) => o !== e && entries.indexOf(o) < entries.indexOf(e) && o.included &&
      (o.stream === e.stream || o.stream === 'both' || e.stream === 'both') && overlaps(iv, { from: o.record.period_from!, to: o.record.period_to! }));
    if (clash) {
      e.included = false;
      e.notes.push(`Okres nakłada się z „${clash.doc.file_name}” (${clash.record.period_from} – ${clash.record.period_to}) — nie wliczono, wymaga decyzji.`);
    }
  }

  // Sprzedaż + dystrybucja za ten sam okres: zużycie liczone raz (z dystrybucji — odczyt licznika OSD).
  for (const e of entries.filter((x) => x.included && x.stream === 'sales')) {
    const iv = e.record.period_from && e.record.period_to ? { from: e.record.period_from, to: e.record.period_to } : null;
    const dist = iv && entries.find((o) => o.included && o.stream === 'distribution' && o.record.period_from && o.record.period_to &&
      overlaps(iv, { from: o.record.period_from, to: o.record.period_to }) && (o.record.consumption || []).length > 0);
    if (dist) {
      e.consumptionCounted = false;
      e.notes.push(`Zużycie pominięte — ten okres pokrywa faktura dystrybucyjna „${dist.doc.file_name}” (bez podwójnego liczenia).`);
    }
  }

  const used = entries.filter((e) => e.included);

  // Taryfy i strefy
  const tariffs: Settlement['tariffs'] = [];
  for (const e of used) {
    const t = normalizeTariffCode(e.record.tariff_code);
    const code = t.code ?? (t.original || '').trim();
    if (!code) continue;
    const last = tariffs[tariffs.length - 1];
    if (last && last.code === code) last.period_to = e.record.period_to;
    else tariffs.push({ code, period_from: e.record.period_from, period_to: e.record.period_to });
  }
  const distinctTariffs = Array.from(new Set(tariffs.map((t) => t.code)));
  const zoneCounts = new Set(distinctTariffs.map((c) => getZonesCount(c)).filter(Boolean));
  const zones = zoneCounts.size === 1 ? Array.from(zoneCounts)[0] : null;
  const blocked: string[] = [];
  if (distinctTariffs.length > 1) {
    blocked.push(`Zmiana taryfy w okresie (${tariffs.map((t) => `${t.code}: ${t.period_from ?? '?'} – ${t.period_to ?? '?'}`).join('; ')}) — taryfa nie jest ustawiana automatycznie.`);
  }
  if (distinctTariffs.length > 0 && zones == null) blocked.push('Rozliczenia mają różną liczbę stref — zużycia i cen stref nie można zapisać jednym zestawem pól.');
  if (distinctTariffs.length === 0) issues.push('Brak rozpoznanej taryfy — nie można ustalić stref.');

  // Pozycje: przypisanie do rekordu (pozycje bez rekordu tylko gdy dokument ma jeden PPE).
  const recsPerDoc = new Map<string, number>();
  for (const r of args.records) recsPerDoc.set(r.document_id, (recsPerDoc.get(r.document_id) || 0) + 1);
  const itemsOf = (e: SettlementEntry) => {
    const sel = selectedItemIds(e.record);
    return args.items.filter((i) =>
      (i.ppe_record_id === e.record.id || (i.ppe_record_id == null && i.document_id === e.doc.id && recsPerDoc.get(e.doc.id) === 1)) &&
      (sel ? sel.has(i.id) : true));
  };

  const comp = (e: SettlementEntry, label: string, value: number | null, unit: string): Component => ({
    docId: e.doc.id, docName: e.doc.file_name, recordId: e.record.id, period_from: e.record.period_from, period_to: e.record.period_to, label, value, unit,
  });

  // Zużycie
  const zoneSummaries: ZoneSummary[] = [];
  if (zones) {
    const cons = used.filter((e) => e.consumptionCounted);
    for (let z = 1; z <= zones; z++) {
      let mwh: number | null = null;
      let incomplete = false;
      const components: Component[] = [];
      for (const e of cons) {
        if (!(e.record.consumption || []).length) { if (e.stream !== 'sales' || !used.some((o) => o.stream === 'distribution')) incomplete = true; continue; }
        const plan = mapConsumptionZones(e.record.consumption, zones);
        const v = plan.values[z as 1 | 2 | 3];
        if (v == null) { incomplete = true; continue; }
        mwh = (mwh ?? 0) + v;
        components.push(comp(e, plan.rows.filter((r) => r.zone === z).map((r) => `${r.zone_name}: ${r.value} ${r.unit}`).join(', '), v, 'MWh'));
      }
      zoneSummaries.push({ zone: z, mwh, incomplete, activeCost: null, price: null, priceNote: null, components, costComponents: [] });
    }
  }

  // Koszty wg składników (kwoty netto; saldo pomijane; brak kwoty ≠ 0)
  const costMap = new Map<LineKind, CostSummary>();
  const activeByZone = new Map<number, { cost: number; comps: Component[]; recs: Set<string> }>();
  const handlingRates: number[] = [];
  let handlingTotal = 0;
  let handlingAny = false;
  for (const e of used) {
    for (const it of itemsOf(e)) {
      const kind = classifyItem(it);
      if (kind === 'balance') continue;
      const cs = costMap.get(kind) || { kind, label: KIND_LABELS[kind], total: 0, missingAmounts: 0, components: [] };
      const label = `${it.name}${it.quantity != null ? ` — ${it.quantity} ${it.unit || ''}` : ''}${it.rate != null ? ` × ${it.rate}` : ''}`;
      cs.components.push(comp(e, label, it.net_value, 'zł netto'));
      if (it.net_value == null) cs.missingAmounts++; else cs.total += Number(it.net_value);
      costMap.set(kind, cs);
      if (kind === 'active' && zones && it.net_value != null) {
        const z = zoneFromName(it.name, zones);
        if (typeof z === 'number') {
          const a = activeByZone.get(z) || { cost: 0, comps: [], recs: new Set<string>() };
          a.cost += Number(it.net_value); a.comps.push(comp(e, label, it.net_value, 'zł netto')); a.recs.add(e.record.id);
          activeByZone.set(z, a);
        }
      }
      if (kind === 'subscription' || kind === 'handling') {
        handlingAny = true;
        if (it.net_value != null) handlingTotal += Number(it.net_value);
        if (it.rate != null && !handlingRates.some((r) => Math.abs(r - Number(it.rate)) < 1e-9)) handlingRates.push(Number(it.rate));
      }
    }
  }
  const costs = COST_ORDER.map((k) => costMap.get(k)).filter(Boolean) as CostSummary[];
  const totalNet = costs.reduce((s, c) => s + c.total, 0);
  if (costs.some((c) => c.missingAmounts > 0)) issues.push('Część pozycji nie ma kwoty netto — sumy kosztów są niepełne.');

  // Cena zbiorcza strefy = koszt energii czynnej strefy / zużycie strefy (ważona, nie średnia arytmetyczna)
  const salesRecs = used.filter((e) => e.stream !== 'distribution');
  for (const zs of zoneSummaries) {
    const a = activeByZone.get(zs.zone);
    zs.activeCost = a ? a.cost : null;
    zs.costComponents = a ? a.comps : [];
    if (!a) { zs.priceNote = 'Brak pozycji energii czynnej dla tej strefy.'; continue; }
    const uncovered = salesRecs.filter((e) => !a.recs.has(e.record.id));
    if (uncovered.length) { zs.priceNote = `Ceny nie obejmują ${uncovered.length} rozliczeń — brak ceny dla całego okresu.`; continue; }
    if (zs.incomplete || zs.mwh == null) { zs.priceNote = 'Niepełne zużycie strefy — nie wyliczono ceny.'; continue; }
    if (zs.mwh <= 0) { zs.priceNote = 'Zerowe zużycie — cena nieokreślona.'; continue; }
    zs.price = a.cost / zs.mwh;
  }

  // Moc umowna — historia, bez sumowania/uśredniania
  const contractedPower: Settlement['contractedPower'] = [];
  for (const e of used) {
    const kw = e.record.contracted_power_kw;
    if (kw == null) continue;
    const last = contractedPower[contractedPower.length - 1];
    if (last && Math.abs(last.kw - Number(kw)) < 1e-9) last.period_to = e.record.period_to;
    else contractedPower.push({ kw: Number(kw), period_from: e.record.period_from, period_to: e.record.period_to });
  }
  if (new Set(contractedPower.map((c) => c.kw)).size > 1) blocked.push('Zmiana mocy umownej w okresie — moc nie jest ustawiana automatycznie.');

  // Pmax — najwyższa dostępna wartość, brak ≠ 0
  let pmax: Settlement['pmax'] = null;
  let pmaxMissing = 0;
  for (const e of used.filter((x) => x.stream !== 'sales')) {
    const v = e.record.max_power_kw;
    if (v == null) { pmaxMissing++; continue; }
    if (!pmax || Number(v) > pmax.kw) pmax = { kw: Number(v), period_from: e.record.period_from, period_to: e.record.period_to };
  }

  // Okres i pokrycie
  const ivs = used.filter((e) => e.record.period_from && e.record.period_to).map((e) => ({ from: e.record.period_from!, to: e.record.period_to! }));
  const proposedPeriod = ivs.length
    ? { from: ivs.map((i) => i.from).sort()[0], to: ivs.map((i) => i.to).sort().slice(-1)[0] }
    : null;
  const gaps = coverageGaps(ivs);
  const salesIv = used.filter((e) => e.stream !== 'distribution' && e.record.period_from && e.record.period_to).map((e) => ({ from: e.record.period_from!, to: e.record.period_to! }));
  const distIv = used.filter((e) => e.stream !== 'sales' && e.record.period_from && e.record.period_to).map((e) => ({ from: e.record.period_from!, to: e.record.period_to! }));
  if (proposedPeriod) {
    const covers = (list: Interval[]) => list.length > 0 && coverageGaps(list).length === 0 &&
      list.map((i) => i.from).sort()[0] === proposedPeriod.from && list.map((i) => i.to).sort().slice(-1)[0] === proposedPeriod.to;
    if (!salesIv.length) issues.push('Brak faktur sprzedażowych — koszty energii czynnej niepełne.');
    else if (!covers(salesIv)) issues.push('Faktury sprzedażowe nie pokrywają całego okresu.');
    if (!distIv.length) issues.push('Brak faktur dystrybucyjnych — koszty sieciowe niepełne.');
    else if (!covers(distIv)) issues.push('Faktury dystrybucyjne nie pokrywają całego okresu.');
  }
  if (gaps.length) issues.push(`Luki w rozliczeniach: ${gaps.map((g) => `${g.from} – ${g.to}`).join('; ')}.`);
  for (const e of entries) for (const n of e.notes) if (!e.included) issues.push(`${e.doc.file_name}: ${n}`);
  if (pending.length) issues.push(`${pending.length} rozliczeń z niezatwierdzonych dokumentów — nie wliczono.`);

  // Abonament / opłata handlowa: koszt za okres + stawka miesięczna osobno
  let handling: Settlement['handling'] = null;
  if (handlingAny) {
    const months = proposedPeriod ? fullMonths(proposedPeriod.from, proposedPeriod.to) : null;
    const monthly = months && months > 0 && gaps.length === 0 ? handlingTotal / months : null;
    handling = {
      totalNet: handlingTotal, months, monthly, rates: handlingRates,
      note: monthly == null
        ? 'Nie wyznaczono stawki miesięcznej (okres niepełny lub nie obejmuje pełnych miesięcy).'
        : handlingRates.length > 1
          ? `Stawki zmieniały się (${handlingRates.join(' / ')}); wartość miesięczna = koszt za okres / ${months} mies.`
          : `Wartość miesięczna = koszt za okres / ${months} mies.`,
    };
  }

  return {
    ppeNumber: args.ppeNumber, entries, pending, tariffs, zones, zoneSummaries, costs, totalNet,
    contractedPower, pmax, pmaxMissing, handling, proposedPeriod, gaps, issues, blocked,
  };
}

/** Propozycja zapisu do pól PRZED (tylko pola obsługiwane przez kalkulator; nigdy PO). */
export interface SettlementProposal {
  field: string;
  label: string;
  value: number;
  note?: string;
}

export function settlementProposals(s: Settlement): SettlementProposal[] {
  const out: SettlementProposal[] = [];
  const zonesOk = s.zones != null && !s.blocked.some((b) => b.includes('taryf') || b.includes('stref'));
  if (zonesOk) {
    for (const z of s.zoneSummaries) {
      if (z.mwh != null && !z.incomplete) out.push({ field: `consumption_before_zone${z.zone}_mwh`, label: `Zużycie PRZED strefa ${z.zone} (MWh)`, value: z.mwh });
      if (z.price != null) out.push({ field: `active_energy_price_before_zone${z.zone}`, label: `Cena energii czynnej PRZED strefa ${z.zone} (zł/MWh)`, value: z.price, note: 'koszt strefy / zużycie strefy' });
    }
  }
  const cap = s.costs.find((c) => c.kind === 'capacity');
  if (cap && cap.missingAmounts === 0 && cap.components.length) out.push({ field: 'capacity_charge_before', label: 'Opłata mocowa PRZED (kwota za okres)', value: cap.total });
  const rea = s.costs.find((c) => c.kind === 'reactive');
  if (rea && rea.missingAmounts === 0 && rea.components.length) out.push({ field: 'reactive_energy_cost_before', label: 'Energia bierna PRZED (kwota za okres)', value: rea.total });
  if (s.handling?.monthly != null) out.push({ field: 'handling_fee_before', label: 'Opłata handlowa PRZED (zł/mies.)', value: s.handling.monthly, note: s.handling.note || undefined });
  return out;
}
