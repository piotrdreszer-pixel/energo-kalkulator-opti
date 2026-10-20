export const AI_MAX_MESSAGE = 2000;

const IGNORED = new Set(['updated_at', 'created_at']);

/** Fields whose draft value differs from the saved row (unsaved changes). */
export function assistantDraftDiff(saved?: Record<string, unknown> | null, draft?: Record<string, unknown> | null): string[] {
  if (!saved || !draft) return [];
  return Object.keys(draft).filter(k => !IGNORED.has(k) && k in saved && JSON.stringify(draft[k] ?? null) !== JSON.stringify(saved[k] ?? null));
}

/** Gaps the assistant should know about; a missing value is never treated as zero. */
export function assistantIssues(a: Record<string, unknown>): string[] {
  const out: string[] = [];
  const empty = (v: unknown) => v === null || v === undefined || v === '' ;
  if (empty(a.period_from) || empty(a.period_to)) out.push('Brak okresu analizy');
  if (empty(a.osd_id)) out.push('Brak wybranego OSD');
  const zb = Number(a.zones_count_before) || 1, za = Number(a.zones_count_after) || 1;
  for (let z = 1; z <= zb; z++) if (empty(a[`consumption_before_zone${z}_mwh`]) || Number(a[`consumption_before_zone${z}_mwh`]) === 0) out.push(`PRZED: brak zużycia w strefie ${z}`);
  for (let z = 1; z <= za; z++) if (!Number(a[`active_energy_price_after_zone${z}`])) out.push(`PO: brak ceny energii w strefie ${z}`);
  const pairs: [string, string, string][] = [
    ['handling_fee_before', 'handling_fee_after', 'opłata handlowa'],
    ['capacity_charge_before', 'capacity_charge_after', 'opłata mocowa'],
    ['fixed_distribution_before_total', 'fixed_distribution_after_total', 'suma pozostałych opłat'],
    ['reactive_energy_cost_before', 'reactive_energy_cost_after', 'energia bierna'],
  ];
  for (const [b, af, label] of pairs) if (Number(a[b]) > 0 && !Number(a[af])) out.push(`Koszt „${label}” występuje w PRZED, a w PO jest pusty`);
  return out;
}
