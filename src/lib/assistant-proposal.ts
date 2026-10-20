import { calculateEnergyCosts } from './calculation-utils';
import { assistantIssues } from './assistant-context';
import { PROPOSAL_FIELDS, type ProposalField } from '../../supabase/functions/ai-assistant/proposal';
import type { ValueSources } from './value-sources';
import { ESTIMATE_FIELD_LABELS } from './invoice-gaps';

export { PROPOSAL_FIELDS, PROPOSAL_SOURCE_LABELS, validateProposal } from '../../supabase/functions/ai-assistant/proposal';

export interface ProposalChange { field: string; value: number | string }

/** Preview of a proposal on a copy of the saved row — the same engine as the UI, nothing is saved. */
export function buildProposalPreview(row: Record<string, unknown>, changes: ProposalChange[]) {
  const copy = { ...row, ...Object.fromEntries(changes.map(c => [c.field, c.value])) };
  const cur = calculateEnergyCosts(row as never);
  const next = calculateEnergyCosts(copy as never);
  const sources = (row.value_sources ?? {}) as ValueSources;
  const fields = changes.map(c => {
    const meta = PROPOSAL_FIELDS[c.field as ProposalField];
    const src = sources[c.field]?.source;
    return { field: c.field, label: meta?.label ?? ESTIMATE_FIELD_LABELS[c.field] ?? c.field, unit: meta?.unit ?? (/_mwh$/.test(c.field) ? 'MWh' : /^period_/.test(c.field) ? '' : 'zł'), current: row[c.field] ?? null, proposed: c.value,
      replaces: src === 'manual' ? 'ręczną korektę' : src === 'document' ? 'wartość z faktury' : src === 'ai' ? 'wcześniejszą zmianę asystenta' : null };
  });
  // Gaps that remain after the change; a missing value is never shown as an exact result.
  const issues = assistantIssues(copy);
  if (changes.some(c => c.field === 'contracted_power_after_kw') && !Number(row.contracted_power_charge_rate_after))
    issues.push('PO: brak stawki opłaty za moc umowną — zmiana mocy nie wpływa na wynik');
  return {
    fields, periodMonths: next.periodMonths, periodFrom: row.period_from ?? null, periodTo: row.period_to ?? null,
    costBefore: next.totalCostBefore,
    currentAfter: cur.totalCostAfter, proposedAfter: next.totalCostAfter,
    extraBenefit: cur.totalCostAfter - next.totalCostAfter,
    savingsAfterChange: next.savingsValue, savingsPercentAfterChange: next.totalCostBefore ? next.savingsPercent : null,
    issues,
  };
}

/** A proposal is stale when the PPE was saved after it was prepared. */
export function isProposalStale(rowUpdatedAt: string | null | undefined, baseUpdatedAt: string | null | undefined) {
  if (!rowUpdatedAt || !baseUpdatedAt) return true;
  return new Date(rowUpdatedAt).getTime() !== new Date(baseUpdatedAt).getTime();
}
