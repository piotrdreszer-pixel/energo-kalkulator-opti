import { describe, it, expect } from 'vitest';
import { calculateEnergyCosts } from './calculation-utils';
import { calculateProjectTotals } from './project-totals';
import { assistantResultSummary } from './assistant-context';

const row = { id: 'test', name: 'Test', period_from: '2025-07-01', period_to: '2025-10-31', tariff_code_before: 'C11', tariff_code_after: 'C11', zones_count_before: 1, zones_count_after: 1, consumption_before_zone1_mwh: 10, consumption_after_zone1_mwh: 10, active_energy_price_before_zone1: 500, active_energy_price_after_zone1: 400 };
describe('PO completeness across calculator consumers', () => {
  it('missing PO price contributes zero without altering inputs', () => {
    const input = { ...row, active_energy_price_after_zone1: null };
    const r = calculateEnergyCosts(input);
    expect(r.savingsAvailable).toBe(true);
    expect(r.totalCostBefore).toBe(5000);
    expect(r.totalCostAfter).toBe(0);
    expect(r.savingsValue).toBe(5000);
    expect(r.savingsPercent).toBe(100);
    expect(r.missingPo).toEqual([]);
    expect(assistantResultSummary(input, r, 'zapisane').oszczednosc_zl).toBe(5000);
    expect(input.active_energy_price_after_zone1).toBeNull();
  });
  it('explicitly confirmed zero is valid and can produce real 100 percent', () => {
    const r = calculateEnergyCosts({ ...row, active_energy_price_after_zone1: 0, value_sources: { active_energy_price_after_zone1: { source: 'manual' } } });
    expect(r.savingsAvailable).toBe(true);
    expect(r.savingsValue).toBe(5000);
    expect(r.savingsPercent).toBe(100);
  });
  it('zero without provenance is also accepted for calculation', () => {
    expect(calculateEnergyCosts({ ...row, active_energy_price_after_zone1: 0 }).savingsValue).toBe(5000);
  });
  it('inapplicable and excluded components do not block comparison', () => {
    expect(calculateEnergyCosts({ ...row, handling_fee_before: 0, handling_fee_after: null }).savingsAvailable).toBe(true);
    expect(calculateEnergyCosts({ ...row, capacity_charge_before: 920, capacity_charge_after: null, report_excluded_components: ['capacity'] }).savingsAvailable).toBe(true);
  });
  it('omits absent fixed charges and keeps costs from populated zones', () => {
    expect(calculateEnergyCosts({ ...row, fixed_distribution_before_total: 100, fixed_distribution_after_total: null }).savingsValue).toBe(1100);
    const r = calculateEnergyCosts({ ...row, zones_count_after: 2, consumption_after_zone2_mwh: 2, active_energy_price_after_zone2: null });
    expect(r.totalCostAfter).toBe(4000);
    expect(r.savingsValue).toBe(1000);
  });
  it('multi-PPE includes available costs from every point', () => {
    const t = calculateProjectTotals([row, { ...row, id: 'test2', active_energy_price_after_zone1: null }]);
    expect(t.entries).toHaveLength(2);
    expect(t.totalBefore).toBe(10000);
    expect(t.canAggregate).toBe(true);
    expect(t.totalAfter).toBe(4000);
    expect(t.savingsValue).toBe(6000);
    expect(t.savingsPercent).toBe(60);
  });
  it('missing PRZED fields retain populated PO costs', () => {
    const r = calculateEnergyCosts({ ...row, consumption_before_zone1_mwh: null });
    expect(r.totalCostBefore).toBe(0);
    expect(r.totalCostAfter).toBe(4000);
    expect(r.savingsValue).toBe(-4000);
    expect(r.savingsPercent).toBe(0);
  });
  it('an empty analysis produces finite zero totals', () => {
    const r = calculateEnergyCosts({});
    expect(r.totalCostBefore).toBe(0);
    expect(r.totalCostAfter).toBe(0);
    expect(r.savingsValue).toBe(0);
    expect(r.savingsPercent).toBe(0);
    const t = calculateProjectTotals([{ id: 'empty', name: 'Empty' }]);
    expect(t.canAggregate).toBe(true);
    expect(t.savingsValue).toBe(0);
    expect(t.invalid).toEqual([]);
  });
});