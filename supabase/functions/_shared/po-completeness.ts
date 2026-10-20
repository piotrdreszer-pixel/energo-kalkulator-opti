export const INCOMPLETE_PO_MESSAGE = 'Nie można wyznaczyć oszczędności — uzupełnij wariant PO';

/** Empty/default zero differs from an explicitly entered or confirmed zero. */
export function missingPoFields(row: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const sources = (row.value_sources ?? {}) as Record<string, { source?: string }>;
  const excluded = (row.report_excluded_components ?? []) as string[];
  const blank = (f: string) => row[f] == null || row[f] === '' || !Number.isFinite(Number(row[f]));
  const known = (f: string) => !blank(f) && (Number(row[f]) !== 0 || ['manual', 'document', 'ai', 'rate_base'].includes(sources[f]?.source ?? ''));
  const require = (f: string, label: string) => { if (!known(f)) missing.push(label); };
  const zones = Number(row.zones_count_after) || 1;
  const usesConsumption = Boolean(row.tariff_code_after || row.consumption_before_zone1_mwh != null) && (!excluded.includes('activeEnergy') || !excluded.includes('distribution'));
  for (let z = 1; z <= zones; z++) {
    const consumption = `consumption_after_zone${z}_mwh`;
    if (usesConsumption) require(consumption, `zużycie PO S${z}`);
    if (usesConsumption && Number(row[consumption]) > 0) {
      if (!excluded.includes('activeEnergy')) require(`active_energy_price_after_zone${z}`, `cena energii PO S${z}`);
      if (!excluded.includes('distribution') && Number(row[`variable_distribution_before_zone${z}_rate`]) > 0)
        require(`variable_distribution_after_zone${z}_rate`, `stawka sieciowa PO S${z}`);
    }
  }
  const pairs = [
    ['handling', 'handling_fee_before', 'handling_fee_after', 'opłata handlowa'],
    ['capacity', 'capacity_charge_before', 'capacity_charge_after', 'opłata mocowa'],
    ['fixedDistribution', 'fixed_distribution_before_total', 'fixed_distribution_after_total', 'suma pozostałych opłat'],
    ['contractedPower', 'contracted_power_before_kw', 'contracted_power_after_kw', 'moc umowna PO'],
    ['contractedPower', 'contracted_power_charge_rate_before', 'contracted_power_charge_rate_after', 'stawka mocy umownej PO'],
  ];
  for (const [key, before, after, label] of pairs) {
    if (!excluded.includes(key) && Number(row[before]) > 0) require(after, label);
  }
  if (!excluded.includes('reactive')) {
    const before = row.reactive_monthly_mode_before
      ? Array.from({ length: 12 }, (_, i) => Number(row[`reactive_energy_before_month_${i + 1}`]) || 0).reduce((a, b) => a + b, 0)
      : Number(row.reactive_energy_cost_before) || 0;
    if (before > 0) {
      if (row.reactive_monthly_mode_after) {
        if (!Array.from({ length: 12 }, (_, i) => known(`reactive_energy_after_month_${i + 1}`)).some(Boolean)) missing.push('energia bierna PO');
      } else require('reactive_energy_cost_after', 'energia bierna');
    }
  }
  return [...new Set(missing)];
}