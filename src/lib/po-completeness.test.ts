import { describe, it, expect } from 'vitest';
import { calculateEnergyCosts } from './calculation-utils';
import { calculateProjectTotals } from './project-totals';
import { assistantResultSummary } from './assistant-context';

const row = { id: 'test', name: 'Test', period_from: '2025-07-01', period_to: '2025-10-31', tariff_code_before: 'C11', tariff_code_after: 'C11', zones_count_before: 1, zones_count_after: 1, consumption_before_zone1_mwh: 10, consumption_after_zone1_mwh: 10, active_energy_price_before_zone1: 500, active_energy_price_after_zone1: 400 };
describe('PO completeness across calculator consumers', () => {
  it('missing PO does not generate a 100 percent saving', () => {
    const r = calculateEnergyCosts({ ...row, active_energy_price_after_zone1: null });
    expect(r.savingsAvailable).toBe(false);
    expect(r.savingsValue).toBeNaN();
    expect(r.savingsPercent).toBeNaN();
    expect(assistantResultSummary(row, r, 'zapisane').oszczednosc_zl).toBeNull();
  });
  it('explicitly confirmed zero is valid and can produce real 100 percent', () => {
    const r = calculateEnergyCosts({ ...row, active_energy_price_after_zone1: 0, value_sources: { active_energy_price_after_zone1: { source: 'manual' } } });
    expect(r.savingsAvailable).toBe(true);
    expect(r.savingsValue).toBe(5000);
    expect(r.savingsPercent).toBe(100);
  });
  it('unknown default zero is not silently accepted', () => {
    expect(calculateEnergyCosts({ ...row, active_energy_price_after_zone1: 0 }).savingsAvailable).toBe(false);
  });
  it('inapplicable and excluded components do not block comparison', () => {
    expect(calculateEnergyCosts({ ...row, handling_fee_before: 0, handling_fee_after: null }).savingsAvailable).toBe(true);
    expect(calculateEnergyCosts({ ...row, capacity_charge_before: 920, capacity_charge_after: null, report_excluded_components: ['capacity'] }).savingsAvailable).toBe(true);
  });
  it('fixed charges and partial zone prices must not be silently omitted', () => {
    expect(calculateEnergyCosts({ ...row, fixed_distribution_before_total: 100, fixed_distribution_after_total: null }).savingsAvailable).toBe(false);
    expect(calculateEnergyCosts({ ...row, zones_count_after: 2, consumption_after_zone2_mwh: 2, active_energy_price_after_zone2: null }).savingsAvailable).toBe(false);
  });
  it('multi-PPE retains all costs but never publishes a partial saving', () => {
    const t = calculateProjectTotals([row, { ...row, id: 'test2', active_energy_price_after_zone1: null }]);
    expect(t.entries).toHaveLength(2);
    expect(t.totalBefore).toBe(10000);
    expect(t.canAggregate).toBe(false);
    expect(t.savingsValue).toBeNaN();
  });
});