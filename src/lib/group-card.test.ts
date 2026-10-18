import { describe, it, expect } from 'vitest';
import { summarizeGroupCard, calculateProjectTotals } from './project-totals';

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, period_from: '2026-01-01', period_to: '2026-12-31',
  tariff_code_before: 'C21', tariff_code_after: 'C21', zones_count_before: 1, zones_count_after: 1,
  consumption_before_zone1_mwh: 10, consumption_after_zone1_mwh: 10, consumption_zone1_mwh: 10,
  active_energy_price_before_zone1: 600, active_energy_price_after_zone1: 550,
  handling_fee_before: 0, handling_fee_after: 0, include_in_project_report: true, ...extra,
}) as any;

describe('summarizeGroupCard', () => {
  it('no PPE → Dodaj PPE', () => expect(summarizeGroupCard([])).toEqual({ kind: 'message', message: 'Dodaj PPE' }));
  it('single PPE shows result even when not selected', () => {
    const s = summarizeGroupCard([base('a', { include_in_project_report: false })]);
    expect(s.kind).toBe('result');
    if (s.kind === 'result') expect(s.label).toBe('Wynik 1 PPE');
  });
  it('multi PPE sums selected only, same as calculateProjectTotals', () => {
    const items = [base('a'), base('b', { consumption_before_zone1_mwh: 20, consumption_after_zone1_mwh: 20 }), base('c', { include_in_project_report: false })];
    const s = summarizeGroupCard(items);
    const ref = calculateProjectTotals(items.slice(0, 2));
    expect(s.kind).toBe('result');
    if (s.kind === 'result') {
      expect(s.totals.totalBefore).toBeCloseTo(ref.totalBefore);
      expect(s.totals.savingsValue).toBeCloseTo(ref.totalBefore - ref.totalAfter);
      expect(s.totals.savingsPercent).toBeCloseTo((ref.savingsValue / ref.totalBefore) * 100);
    }
  });
  it('none selected', () => expect(summarizeGroupCard([base('a', { include_in_project_report: false }), base('b', { include_in_project_report: false })])).toEqual({ kind: 'message', message: 'Wybierz PPE do zestawienia' }));
  it('incomplete', () => expect(summarizeGroupCard([base('a'), base('b', { period_from: null })]).kind).toBe('message'));
  it('different periods', () => expect(summarizeGroupCard([base('a'), base('b', { period_from: '2026-02-01' })])).toEqual({ kind: 'message', message: 'Różne okresy — brak wspólnego wyniku' }));
});
