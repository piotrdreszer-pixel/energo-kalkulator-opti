import { calculateEnergyCosts } from './calculation-utils';
import { assistantIssues } from './assistant-context';
import { PROPOSAL_FIELDS, type ProposalField } from '../../supabase/functions/ai-assistant/proposal';
import type { ValueSources } from './value-sources';
import { ESTIMATE_FIELD_LABELS } from './invoice-gaps';

export { PROPOSAL_FIELDS, PROPOSAL_SOURCE_LABELS, validateProposal } from '../../supabase/functions/ai-assistant/proposal';

export interface ProposalChange { field: string; value: number | string }

const HIDDEN = /^(rate_card_id_|rates_source_|rates_overridden_)/;
const EXTRA_LABELS: Record<string, [string, string]> = {
  tariff_code_after: ['Taryfa PO', ''], tariff_code_before: ['Taryfa PRZED', ''], zones_count_after: ['Liczba stref PO', ''], zones_count_before: ['Liczba stref PRZED', ''],
  rates_year_after: ['Rok stawek PO', ''], rates_year_before: ['Rok stawek PRZED', ''], season_after: ['Sezon PO', ''],
  contracted_power_charge_rate_after: ['Stawka opłaty za moc umowną PO', 'zł/kW/mies.'],
  variable_distribution_after_zone1_rate: ['Stawka zmienna dystrybucji PO – strefa 1', ''], variable_distribution_after_zone2_rate: ['Stawka zmienna dystrybucji PO – strefa 2', ''], variable_distribution_after_zone3_rate: ['Stawka zmienna dystrybucji PO – strefa 3', ''],
  consumption_after_zone1_mwh: ['Zużycie PO – strefa 1', 'MWh'], consumption_after_zone2_mwh: ['Zużycie PO – strefa 2', 'MWh'], consumption_after_zone3_mwh: ['Zużycie PO – strefa 3', 'MWh'],
  include_in_project_report: ['W zestawieniu', ''], contracted_power_before_kw: ['Moc umowna PRZED', 'kW'], handling_fee_before: ['Opłata handlowa PRZED', 'zł/miesiąc'],
  active_energy_price_before_zone1: ['Cena energii czynnej PRZED – strefa 1', 'zł/MWh'], active_energy_price_before_zone2: ['Cena energii czynnej PRZED – strefa 2', 'zł/MWh'], active_energy_price_before_zone3: ['Cena energii czynnej PRZED – strefa 3', 'zł/MWh'],
};
/** Preview of a proposal on a copy of the saved row — the same engine as the UI, nothing is saved. */
export function buildProposalPreview(row: Record<string, unknown>, changes: ProposalChange[]) {
  const copy: Record<string, unknown> = { ...row, ...Object.fromEntries(changes.map(c => [c.field, c.value])), value_sources: { ...(row.value_sources as object ?? {}), ...Object.fromEntries(changes.map(c => [c.field, { source: 'ai' }])) } };
  const cur = calculateEnergyCosts(row as never);
  const next = calculateEnergyCosts(copy as never);
  const sources = (row.value_sources ?? {}) as ValueSources;
  const fields = changes.filter(c => !HIDDEN.test(c.field)).map(c => {
    const meta = PROPOSAL_FIELDS[c.field as ProposalField];
    const src = sources[c.field]?.source;
    return { field: c.field, label: meta?.label ?? EXTRA_LABELS[c.field]?.[0] ?? ESTIMATE_FIELD_LABELS[c.field] ?? c.field, unit: meta?.unit ?? EXTRA_LABELS[c.field]?.[1] ?? (/_mwh$/.test(c.field) ? 'MWh' : /^period_/.test(c.field) ? '' : 'zł'), current: row[c.field] ?? null, proposed: c.value,
      replaces: src === 'manual' ? 'ręczną korektę' : src === 'document' ? 'wartość z faktury' : src === 'ai' ? 'wcześniejszą zmianę asystenta' : null };
  });
  // Gaps that remain after the change; a missing value is never shown as an exact result.
  const issues = assistantIssues(copy);
  if (changes.some(c => c.field === 'contracted_power_after_kw') && !Number(row.contracted_power_charge_rate_after))
    issues.push('PO: brak stawki opłaty za moc umowną — zmiana mocy nie wpływa na wynik');
  return {
    fields, periodMonths: next.periodMonths, periodFrom: copy.period_from ?? null, periodTo: copy.period_to ?? null,
    costBefore: next.totalCostBefore,
    currentAfter: cur.totalCostAfter, proposedAfter: next.totalCostAfter,
    extraBenefit: cur.totalCostAfter - next.totalCostAfter,
    savingsAfterChange: next.savingsValue, savingsPercentAfterChange: next.totalCostBefore ? next.savingsPercent : null,
    issues, savingsAvailable: next.savingsAvailable,
  };
}

/** A proposal is stale when the PPE was saved after it was prepared. */
export function isProposalStale(rowUpdatedAt: string | null | undefined, baseUpdatedAt: string | null | undefined) {
  if (!rowUpdatedAt || !baseUpdatedAt) return true;
  return new Date(rowUpdatedAt).getTime() !== new Date(baseUpdatedAt).getTime();
}
