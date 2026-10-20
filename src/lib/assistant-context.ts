import type { CalculationResult } from './calculation-utils';
import { incompletePo } from './invoice-gaps';

export const AI_MAX_MESSAGE = 2000;

const IGNORED = new Set(['updated_at', 'created_at']);

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

/** Calculator output handed to the assistant — same numbers as the UI (calculateEnergyCosts), never recomputed by the model. */
export function assistantResultSummary(a: Record<string, unknown>, r: CalculationResult, source: 'zapisane' | 'robocze') {
  const excluded = (a.report_excluded_components as string[] | null) ?? [];
  return {
    zrodlo_danych: source === 'robocze' ? 'niezapisany formularz (wersja robocza)' : 'zapisane dane PPE',
    okres: { od: a.period_from ?? null, do: a.period_to ?? null, miesiecy: r.periodMonths },
    koszt_przed_zl: r2(r.totalCostBefore),
    koszt_po_zl: r2(r.totalCostAfter),
    oszczednosc_zl: r2(r.savingsValue),
    oszczednosc_proc: r.totalCostBefore ? r2(r.savingsPercent) : null,
    skladniki_wylaczone_z_wyliczen: excluded,
    po_niepelne: incompletePo(a),
    rozbicie_zl: {
      energia_czynna: { przed: r2(r.activeEnergyCostBefore), po: r2(r.activeEnergyCostAfter) },
      dystrybucja: { przed: r2(r.distributionCostBefore), po: r2(r.distributionCostAfter) },
      w_tym_oplata_za_moc_umowna: { przed: r2(r.contractedPowerChargeBefore), po: r2(r.contractedPowerChargeAfter) },
      oplata_handlowa: { przed: r2(r.handlingFeeBefore), po: r2(r.handlingFeeAfter) },
      oplata_mocowa: { przed: r2(r.capacityChargeBefore), po: r2(r.capacityChargeAfter) },
      energia_bierna: { przed: r2(r.reactiveEnergyCostBefore), po: r2(r.reactiveEnergyCostAfter) },
    },
  };
}

/** Fields whose draft value differs from the saved row (unsaved changes). */
export function assistantDraftDiff(saved?: Record<string, unknown> | null, draft?: Record<string, unknown> | null): string[] {
  if (!saved || !draft) return [];
  const norm = (k: string, v: unknown) => (k.startsWith('tariff_code_') && typeof v === 'string' ? v.toUpperCase() : v ?? null);
  return Object.keys(draft).filter(k => !IGNORED.has(k) && k in saved && JSON.stringify(norm(k, draft[k])) !== JSON.stringify(norm(k, saved[k])));
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
