import { describe, it, expect } from 'vitest';
import { calculateProjectTotals } from './project-totals';

const base = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  period_from: '2026-01-01',
  period_to: '2026-12-31',
  tariff_code_before: 'B23',
  tariff_code_after: 'B23',
  zones_count_before: 1,
  zones_count_after: 1,
  consumption_before_zone1_mwh: 10,
  consumption_after_zone1_mwh: 10,
  active_energy_price_before_zone1: 500,
  active_energy_price_after_zone1: 400,
  ...over,
});

describe('calculateProjectTotals', () => {
  it('sums before/after and computes percent from sums, not averages', () => {
    // A: 5000 -> 4000; B: 20 MWh * 500 = 10000 -> 20*450 = 9000
    const t = calculateProjectTotals([
      base('a', { ppe_number: '0001' }),
      base('b', { ppe_number: '0002', consumption_before_zone1_mwh: 20, consumption_after_zone1_mwh: 20, active_energy_price_after_zone1: 450 }),
    ]);
    expect(t.totalBefore).toBe(15000);
    expect(t.totalAfter).toBe(13000);
    expect(t.savingsValue).toBe(2000);
    expect(t.savingsPercent).toBeCloseTo((2000 / 15000) * 100, 6);
    expect(t.canAggregate).toBe(true);
  });

  it('blocks two variants of the same PPE number (ignoring spaces, keeping leading zeros)', () => {
    const t = calculateProjectTotals([base('a', { ppe_number: '0001 23' }), base('b', { ppe_number: '000123' })]);
    expect(t.duplicatePpe).toEqual(['000123']);
    expect(t.canAggregate).toBe(false);
  });

  it('does not aggregate when periods differ', () => {
    const t = calculateProjectTotals([base('a'), base('b', { period_to: '2026-06-30' })]);
    expect(t.samePeriod).toBe(false);
    expect(t.canAggregate).toBe(false);
  });

  it('treats missing values as incomplete, not zero', () => {
    const t = calculateProjectTotals([base('a', { consumption_after_zone1_mwh: null })]);
    expect(t.invalid).toHaveLength(1);
    expect(t.canAggregate).toBe(false);
  });

  it('returns null percent when total before is zero', () => {
    const t = calculateProjectTotals([base('a', { active_energy_price_before_zone1: 0, active_energy_price_after_zone1: 0 })]);
    expect(t.savingsPercent).toBeNull();
  });

  it('flags different exclusion scopes', () => {
    const t = calculateProjectTotals([base('a'), base('b', { report_excluded_components: ['reactive'] })]);
    expect(t.sameExclusions).toBe(false);
  });

  it('treats a valid zero as data, not as missing', () => {
    const t = calculateProjectTotals([base('a', { consumption_after_zone1_mwh: 0, value_sources: { consumption_after_zone1_mwh: { source: 'manual' } } })]);
    expect(t.invalid).toHaveLength(0);
  });

  it('hidden components do not change totals; excluded components do', () => {
    const r = { reactive_energy_cost_before: 1000, reactive_energy_cost_after: 0 };
    const plain = calculateProjectTotals([base('a', r)]);
    const hidden = calculateProjectTotals([base('a', { ...r, report_hidden_components: ['reactive'] })]);
    const excluded = calculateProjectTotals([base('a', { ...r, report_excluded_components: ['reactive'] })]);
    expect(hidden.totalBefore).toBe(plain.totalBefore);
    expect(plain.totalBefore).toBe(6000);
    expect(excluded.totalBefore).toBe(5000);
  });
});
