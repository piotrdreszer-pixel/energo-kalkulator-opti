// Provenance of input values and rates-year selection rules.
// Pure helpers so the behaviour is unit-testable and shared by the form.

export type ValueSourceKind = 'manual' | 'rate_base' | 'document' | 'derived';

export interface ValueSource {
  source: ValueSourceKind;
  rate_card_id?: string | null;
  // Reserved for document import (stage 2)
  document_id?: string | null;
  page?: number | null;
  item_ref?: string | null;
}

export type ValueSources = Record<string, ValueSource>;

export interface RatesSourceSnapshot {
  rate_card_id: string;
  rate_card_name: string;
  valid_from: string;
  valid_to: string | null;
  year: number;
  applied_at: string;
}

export type CostModeBefore = 'rates' | 'invoice_actual';

export const VALUE_SOURCE_LABELS: Record<ValueSourceKind, string> = {
  manual: 'wprowadzona ręcznie',
  rate_base: 'pobrana z bazy stawek',
  document: 'odczytana z dokumentu',
  derived: 'wyliczona lub oszacowana',
};

/** Fields filled from the rates base for a scenario. */
export const rateBaseFields = (prefix: 'before' | 'after'): string[] => [
  `contracted_power_charge_rate_${prefix}`,
  `variable_distribution_${prefix}_zone1_rate`,
  `variable_distribution_${prefix}_zone2_rate`,
  `variable_distribution_${prefix}_zone3_rate`,
  `capacity_charge_${prefix}`,
];

export function markSources(
  current: ValueSources,
  fields: string[],
  src: ValueSource
): ValueSources {
  const next = { ...current };
  for (const f of fields) next[f] = { ...src };
  return next;
}

/**
 * Existing (legacy) rule: when the analysis period lies within one calendar
 * year, both PRZED and PO default to that year. Otherwise: no automatic
 * choice (null) — the user selects the year manually.
 */
export function autoYearsFromPeriod(
  from: string | null | undefined,
  to: string | null | undefined
): { before: string; after: string } | null {
  if (!from || !to) return null;
  const fy = String(from).slice(0, 4);
  const ty = String(to).slice(0, 4);
  if (fy !== ty) return null;
  return { before: fy, after: fy };
}

/**
 * Rates year to show when a saved analysis is opened. A saved per-scenario
 * year wins; legacy rows fall back to the year of rates_date, then the
 * current year (unchanged legacy behaviour).
 */
export function initialRatesYear(
  savedYear: number | null | undefined,
  ratesDate: string | null | undefined,
  now: Date = new Date()
): { year: string; fromSaved: boolean } {
  if (savedYear) return { year: String(savedYear), fromSaved: true };
  const y = String(ratesDate || '').slice(0, 4);
  return { year: y || String(now.getFullYear()), fromSaved: false };
}

/**
 * Whether rates may be applied automatically after OSD/tariff/season/year
 * changed. Never silently overwrite manual corrections or document values.
 */
export function canAutoApplyRates(opts: {
  manualMode: boolean;
  overriddenCount: number;
  sources: ValueSources;
  prefix: 'before' | 'after';
}): boolean {
  if (opts.manualMode) return false;
  if (opts.overriddenCount > 0) return false;
  const protectedField = rateBaseFields(opts.prefix).some((f) => {
    const s = opts.sources[f]?.source;
    return s === 'manual' || s === 'document';
  });
  return !protectedField;
}
