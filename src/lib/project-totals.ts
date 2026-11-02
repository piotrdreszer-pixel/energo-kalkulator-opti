import type { EnergyAnalysis } from '@/types/database';
import { calculateEnergyCosts, type CalculationResult } from './calculation-utils';

export interface PpeEntry {
  analysis: Partial<EnergyAnalysis> & { id: string; name: string };
  result: CalculationResult;
  missing: string[];
}

export interface ProjectTotals {
  entries: PpeEntry[];
  invalid: PpeEntry[];
  duplicatePpe: string[];
  withoutPpeNumber: number;
  samePeriod: boolean;
  periodFrom: string | null;
  periodTo: string | null;
  sameExclusions: boolean;
  totalBefore: number;
  totalAfter: number;
  savingsValue: number;
  /** null when total before is zero — show "nie dotyczy" */
  savingsPercent: number | null;
  /** true when the totals can be presented as one combined result */
  canAggregate: boolean;
}

export const normalizePpe = (v: string | null | undefined) => (v || '').replace(/\s+/g, '').toUpperCase();

/** Missing inputs never disqualify a PPE from calculation or reporting. */
export function findMissingFields(_a: Partial<EnergyAnalysis>): string[] {
  return [];
}

const exclusionKey = (a: Partial<EnergyAnalysis>) =>
  [...((a.report_excluded_components as string[]) || [])].sort().join(',');

export function calculateProjectTotals(analyses: (Partial<EnergyAnalysis> & { id: string; name: string })[]): ProjectTotals {
  const all: PpeEntry[] = analyses.map((analysis) => ({
    analysis,
    result: calculateEnergyCosts(analysis),
    missing: findMissingFields(analysis),
  }));
  const entries = all;
  const invalid = all.filter((e) => e.missing.length > 0);

  const counts = new Map<string, number>();
  for (const e of all) {
    const k = normalizePpe(e.analysis.ppe_number);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const duplicatePpe = [...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k);
  const withoutPpeNumber = all.filter((e) => !normalizePpe(e.analysis.ppe_number)).length;

  const periods = new Set(all.map((e) => `${e.analysis.period_from || ''}|${e.analysis.period_to || ''}`));
  const samePeriod = periods.size <= 1;
  const sameExclusions = new Set(entries.map((e) => exclusionKey(e.analysis))).size <= 1;

  const totalBefore = entries.reduce((s, e) => s + e.result.totalCostBefore, 0);
  const totalAfter = entries.reduce((s, e) => s + e.result.totalCostAfter, 0);
  const savingsValue = totalBefore - totalAfter;
  const savingsPercent = totalBefore !== 0 ? (savingsValue / totalBefore) * 100 : null;

  return {
    entries,
    invalid,
    duplicatePpe,
    withoutPpeNumber,
    samePeriod,
    periodFrom: samePeriod ? all[0]?.analysis.period_from ?? null : null,
    periodTo: samePeriod ? all[0]?.analysis.period_to ?? null : null,
    sameExclusions,
    totalBefore,
    totalAfter,
    savingsValue,
    savingsPercent,
    canAggregate: all.length > 0 && samePeriod && duplicatePpe.length === 0 && invalid.length === 0,
  };
}

export type GroupCardSummary =
  | { kind: 'result'; label: string; totals: ProjectTotals }
  | { kind: 'message'; message: string };

/** Card summary for one analysis group. Never sums across groups. */
export function summarizeGroupCard(items: (Partial<EnergyAnalysis> & { id: string; name: string })[]): GroupCardSummary {
  if (items.length === 0) return { kind: 'message', message: 'Dodaj PPE' };
  const chosen = items.filter((a) => a.include_in_project_report);
  // Legacy / single-PPE analyses: show the only point regardless of selection.
  const set = items.length === 1 ? items : chosen;
  if (set.length === 0) return { kind: 'message', message: 'Wybierz PPE do zestawienia' };
  const t = calculateProjectTotals(set);
  if (!t.samePeriod) return { kind: 'message', message: 'Różne okresy — brak wspólnego wyniku' };
  if (t.duplicatePpe.length > 0) return { kind: 'message', message: 'Ten sam numer PPE wybrany kilka razy' };
  const label = items.length === 1 ? 'Wynik 1 PPE' : `Wynik ${set.length} z ${items.length} PPE wybranych do raportu`;
  return { kind: 'result', label, totals: t };
}
