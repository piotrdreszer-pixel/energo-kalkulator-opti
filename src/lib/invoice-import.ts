// Etap 2: import faktur — dopasowanie PPE, różnice i mapowanie pól PRZED.
// Czyste funkcje pomocnicze (testowalne jednostkowo).

import { normalizePpe } from './project-totals';
import type { EnergyAnalysis } from '@/types/database';
import { TARIFF_CODES, getZonesCount } from './tariff-utils';

export interface InvoiceLineItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  net_value: number | null;
  vat_rate: number | null;
  gross_value: number | null;
  category: string | null;
  page: number | null;
}

export interface ConsumptionEntry {
  zone_name: string;
  value: number;
  unit: string;
}

export interface InvoicePpeRecord {
  id: string;
  document_id: string;
  ppe_number: string | null;
  ppe_address: string | null;
  tariff_code: string | null;
  osd_name: string | null;
  period_from: string | null;
  period_to: string | null;
  contracted_power_kw: number | null;
  max_power_kw: number | null;
  consumption: ConsumptionEntry[] | null;
  reactive: unknown;
  other_charges: unknown;
  source_pages: number[] | null;
  matched_analysis_id: string | null;
  match_status: 'matched' | 'new' | 'ambiguous' | 'unmatched';
  applied_fields: string[];
  applied_at: string | null;
  review_state?: unknown;
}

/** Pola PRZED, które import może zaproponować. Nigdy pola PO. */
export const IMPORTABLE_FIELDS = [
  'ppe_number',
  'ppe_address',
  'tariff_code_before',
  'contracted_power_before_kw',
  'period_from',
  'period_to',
  'consumption_before_zone1_mwh',
  'consumption_before_zone2_mwh',
  'consumption_before_zone3_mwh',
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportableField, string> = {
  ppe_number: 'Numer PPE',
  ppe_address: 'Adres PPE',
  tariff_code_before: 'Taryfa PRZED',
  contracted_power_before_kw: 'Moc umowna PRZED (kW)',
  period_from: 'Okres od',
  period_to: 'Okres do',
  consumption_before_zone1_mwh: 'Zużycie PRZED strefa 1 (MWh)',
  consumption_before_zone2_mwh: 'Zużycie PRZED strefa 2 (MWh)',
  consumption_before_zone3_mwh: 'Zużycie PRZED strefa 3 (MWh)',
};

/** Propozycja dopasowania rekordu do punktu analizy po numerze PPE (bez spacji, zera wiodące zachowane). */
export function proposeMatch(
  record: Pick<InvoicePpeRecord, 'ppe_number'>,
  analyses: Pick<EnergyAnalysis, 'id' | 'ppe_number'>[]
): { analysisId: string | null; status: InvoicePpeRecord['match_status'] } {
  const num = normalizePpe(record.ppe_number);
  if (!num) return { analysisId: null, status: 'unmatched' };
  const matches = analyses.filter((a) => normalizePpe(a.ppe_number) === num);
  if (matches.length === 1) return { analysisId: matches[0].id, status: 'matched' };
  if (matches.length > 1) return { analysisId: null, status: 'ambiguous' };
  return { analysisId: null, status: 'new' };
}

// ---------- Taryfa ----------

export interface TariffMatch {
  /** Kod ze słownika kalkulatora albo null, gdy brak jednoznacznego dopasowania. */
  code: string | null;
  original: string | null;
}

/** Dopasowuje kod taryfy z faktury do słownika kalkulatora. Normalizuje wielkość liter i spacje, nie usuwa oznaczeń (a/b/w). */
export function normalizeTariffCode(raw: string | null | undefined): TariffMatch {
  const original = raw == null ? null : String(raw);
  if (!original || !original.trim()) return { code: null, original };
  const cleaned = original
    .trim()
    .replace(/^(grupa\s+taryfowa|taryfa|grupa)\s*[:-]?\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
  const hit = TARIFF_CODES.find((t) => t.code.toUpperCase() === cleaned);
  return { code: hit ? hit.code : null, original };
}

/** Różne taryfy tego samego PPE na różnych fakturach analizy — konflikt zamiast wyboru ostatniej. */
export function tariffConflict(
  ppeNumber: string | null,
  records: Pick<InvoicePpeRecord, 'ppe_number' | 'tariff_code' | 'period_from' | 'period_to'>[]
): { code: string; period_from: string | null; period_to: string | null }[] | null {
  const num = normalizePpe(ppeNumber);
  if (!num) return null;
  const seen = new Map<string, { code: string; period_from: string | null; period_to: string | null }>();
  for (const r of records) {
    if (normalizePpe(r.ppe_number) !== num) continue;
    const t = normalizeTariffCode(r.tariff_code);
    const key = t.code ?? (t.original || '').trim().toUpperCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { code: t.code ?? t.original!, period_from: r.period_from, period_to: r.period_to });
  }
  return seen.size > 1 ? Array.from(seen.values()) : null;
}

// ---------- Zużycie wg stref ----------

const plain = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim();

const TOTAL_RE = /\b(suma|razem|lacznie|ogolem|total|calkowite)\b/;

/** Strefa kalkulatora (1..3) wynikająca ze znaczenia nazwy — nie z kolejności. 'total' = zużycie łączne. */
export function zoneFromName(name: string, zones: number): number | 'total' | null {
  const n = plain(name);
  if (!n) return null;
  if (TOTAL_RE.test(n)) return 'total';
  if (zones === 1) return 1;
  if (zones === 2) {
    if (/poza ?szczyt|pozaszczyt|nocn|\bnoc\b|weekend|strefa (ii|2)\b|\bs2\b|\bt2\b|niska/.test(n)) return 2;
    if (/szczyt|dzien|dzienn|strefa (i|1)\b|\bs1\b|\bt1\b|wysoka/.test(n)) return 1;
    return null;
  }
  if (zones === 3) {
    if (/pozostal|reszta|poza ?szczyt|strefa (iii|3)\b|\bs3\b|\bt3\b/.test(n)) return 3;
    if (/popoludn|wieczor|strefa (ii|2)\b|\bs2\b|\bt2\b/.test(n)) return 2;
    if (/przedpoludn|poranny|ranny|strefa (i|1)\b|\bs1\b|\bt1\b/.test(n)) return 1;
    return null;
  }
  return null;
}

export interface ConsumptionRow {
  zone_name: string;
  value: number | null;
  unit: string;
  mwh: number | null;
  zone: number | 'total' | null;
  note: string | null;
}

export interface ConsumptionPlan {
  zones: number;
  rows: ConsumptionRow[];
  /** MWh na strefę; brak klucza = brak danych (nigdy zero). */
  values: Partial<Record<1 | 2 | 3, number>>;
  missing: number[];
  conflicts: number[];
  totalMwh: number | null;
  /** Suma stref różni się od zużycia łącznego z faktury. */
  mismatch: boolean;
  unresolved: string[];
}

const toMwh = (value: number, unit: string): number | null => {
  const u = plain(unit).replace(/\s/g, '');
  if (u === 'kwh') return value / 1000;
  if (u === 'mwh') return value;
  return null;
};

/**
 * Zużycie energii czynnej z faktury → strefy PRZED. Strefa wynika z nazwy i liczby stref taryfy.
 * Identyczne powtórzenia (ta sama strefa, wartość, okres) liczone raz; różne wartości tej samej strefy
 * w tym samym okresie = konflikt (nie sumujemy, nie zgadujemy). Różne okresy rozliczeń sumowane.
 */
export function mapConsumptionZones(
  entries: (ConsumptionEntry & { period_from?: string | null; period_to?: string | null })[] | null | undefined,
  zones: number
): ConsumptionPlan {
  const rows: ConsumptionRow[] = [];
  const perZone = new Map<number, { key: string; mwh: number; period: string }[]>();
  let total: number | null = null;
  const unresolved: string[] = [];
  const nonTotal = (entries || []).filter((e) => zoneFromName(e.zone_name, 3) !== 'total');
  for (const e of entries || []) {
    const mwh = e.value == null ? null : toMwh(Number(e.value), e.unit || '');
    let zone = zoneFromName(e.zone_name, zones);
    if (zones === 1 && zone === 1 && nonTotal.length > 1 && !/calodob|caly dzien|jednostref/.test(plain(e.zone_name))) zone = null;
    let note: string | null = null;
    if (e.value == null) note = 'Brak odczytu — brak danych.';
    else if (mwh == null) note = `Nieznana jednostka „${e.unit || '?'}” — nie przeliczono.`;
    else if (zone == null) note = 'Nie da się ustalić strefy z nazwy — nie zastosowano.';
    rows.push({ zone_name: e.zone_name, value: e.value ?? null, unit: e.unit, mwh, zone, note });
    if (mwh == null) continue;
    if (zone === 'total') { total = (total ?? 0) + mwh; continue; }
    if (zone == null || zone > zones) { unresolved.push(e.zone_name); continue; }
    const period = `${e.period_from ?? ''}|${e.period_to ?? ''}`;
    const list = perZone.get(zone) || [];
    const key = `${period}|${mwh}`;
    if (!list.some((x) => x.key === key)) list.push({ key, mwh, period });
    perZone.set(zone, list);
  }
  const values: ConsumptionPlan['values'] = {};
  const conflicts: number[] = [];
  for (const [z, list] of perZone) {
    const periods = new Set(list.map((x) => x.period));
    if (periods.size !== list.length) { conflicts.push(z); continue; }
    values[z as 1 | 2 | 3] = list.reduce((s, x) => s + x.mwh, 0);
  }
  const missing = [1, 2, 3].slice(0, zones).filter((z) => values[z as 1 | 2 | 3] == null && !conflicts.includes(z));
  const sum = Object.values(values).reduce((s, v) => s + (v || 0), 0);
  const mismatch = total != null && missing.length === 0 && conflicts.length === 0 && Math.abs(sum - total) > Math.max(1e-9, total * 1e-6);
  if (zones === 1 && values[1] == null && total != null && conflicts.length === 0 && unresolved.length === 0) {
    values[1] = total;
    missing.splice(0, missing.length);
  }
  return { zones, rows, values, missing, conflicts, totalMwh: total, mismatch, unresolved };
}

/** Wartości z faktury przeliczone na pola PRZED kalkulatora (zużycie kWh → MWh, strefy wg znaczenia). */
export function recordToBeforeFields(
  record: InvoicePpeRecord,
  tariffOverride?: string | null
): Partial<Record<ImportableField, string | number>> {
  const out: Partial<Record<ImportableField, string | number>> = {};
  if (record.ppe_number) out.ppe_number = record.ppe_number;
  if (record.ppe_address) out.ppe_address = record.ppe_address;
  const tariff = tariffOverride ?? normalizeTariffCode(record.tariff_code).code;
  if (tariff) out.tariff_code_before = tariff;
  if (record.contracted_power_kw != null) out.contracted_power_before_kw = record.contracted_power_kw;
  if (record.period_from) out.period_from = record.period_from;
  if (record.period_to) out.period_to = record.period_to;
  if (tariff) {
    const plan = mapConsumptionZones(record.consumption, getZonesCount(tariff));
    for (const z of [1, 2, 3] as const) {
      const v = plan.values[z];
      if (v != null) out[`consumption_before_zone${z}_mwh` as ImportableField] = v;
    }
  }
  return out;
}

export interface FieldDiff {
  field: ImportableField;
  label: string;
  current: string | number | null;
  incoming: string | number;
  changed: boolean;
}

/** Różnice względem istniejącego punktu — do podglądu przed zatwierdzeniem. */
export function diffAgainstAnalysis(
  record: InvoicePpeRecord,
  analysis: EnergyAnalysis | null,
  tariffOverride?: string | null
): FieldDiff[] {
  const incoming = recordToBeforeFields(record, tariffOverride);
  const diffs: FieldDiff[] = [];
  for (const field of IMPORTABLE_FIELDS) {
    const inc = incoming[field];
    if (inc == null) continue;
    const cur = analysis ? (analysis as unknown as Record<string, unknown>)[field] as string | number | null : null;
    const changed =
      cur == null ||
      (typeof inc === 'number' && typeof cur === 'number'
        ? Math.abs(inc - cur) > 1e-9
        : String(cur) !== String(inc));
    diffs.push({ field, label: IMPORT_FIELD_LABELS[field], current: cur, incoming: inc, changed });
  }
  return diffs;
}

/** Zatwierdzenie jest idempotentne: ponowne kliknięcie nie dodaje danych. */
export function canApplyRecord(record: Pick<InvoicePpeRecord, 'applied_at'>): boolean {
  return !record.applied_at;
}
