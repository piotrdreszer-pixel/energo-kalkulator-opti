// Etap 2: import faktur — dopasowanie PPE, różnice i mapowanie pól PRZED.
// Czyste funkcje pomocnicze (testowalne jednostkowo).

import { normalizePpe } from './project-totals';
import type { EnergyAnalysis } from '@/types/database';

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

/** Wartości z faktury przeliczone na pola PRZED kalkulatora (zużycie kWh → MWh). */
export function recordToBeforeFields(
  record: InvoicePpeRecord
): Partial<Record<ImportableField, string | number>> {
  const out: Partial<Record<ImportableField, string | number>> = {};
  if (record.ppe_number) out.ppe_number = record.ppe_number;
  if (record.ppe_address) out.ppe_address = record.ppe_address;
  if (record.tariff_code) out.tariff_code_before = record.tariff_code;
  if (record.contracted_power_kw != null) out.contracted_power_before_kw = record.contracted_power_kw;
  if (record.period_from) out.period_from = record.period_from;
  if (record.period_to) out.period_to = record.period_to;
  (record.consumption || []).forEach((c, i) => {
    if (i > 2 || c.value == null) return;
    const mwh = (c.unit || '').toLowerCase().includes('kwh') ? c.value / 1000 : c.value;
    out[`consumption_before_zone${i + 1}_mwh` as ImportableField] = mwh;
  });
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
  analysis: EnergyAnalysis | null
): FieldDiff[] {
  const incoming = recordToBeforeFields(record);
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
