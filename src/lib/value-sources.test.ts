import { describe, it, expect } from 'vitest';
import { autoYearsFromPeriod, initialRatesYear, canAutoApplyRates, markSources, rateBaseFields } from './value-sources';
import { calculateEnergyCosts } from './calculation-utils';
import { calculateProjectTotals } from './project-totals';

const ppe = (over: Record<string, unknown> = {}) => ({
  id: 'x', name: 'x',
  period_from: '2026-01-01', period_to: '2026-12-31',
  tariff_code_before: 'C21', tariff_code_after: 'C21',
  zones_count_before: 1, zones_count_after: 1,
  contracted_power_before_kw: 50, contracted_power_after_kw: 50,
  contracted_power_charge_rate_before: 12.5, contracted_power_charge_rate_after: 11,
  variable_distribution_before_zone1_rate: 0.2, variable_distribution_after_zone1_rate: 0.18,
  consumption_before_zone1_mwh: 100, consumption_after_zone1_mwh: 100,
  active_energy_price_before_zone1: 600, active_energy_price_after_zone1: 550,
  capacity_charge_before: 1000, capacity_charge_after: 1000,
  ...over,
});
const newFields = {
  rates_year_before: 2026, rates_year_after: 2026,
  rates_source_before: { rate_card_id: 'c', rate_card_name: 'n', valid_from: '2026-01-01', valid_to: null, year: 2026, applied_at: 'x' },
  value_sources: { capacity_charge_before: { source: 'manual' } },
  cost_mode_before: 'rates',
  simulation_period_from: '2027-01-01', simulation_period_to: '2027-12-31',
};

describe('rates year selection (legacy rule kept)', () => {
  it('period within 2026 -> PRZED and PO 2026', () => {
    expect(autoYearsFromPeriod('2026-01-01', '2026-12-31')).toEqual({ before: '2026', after: '2026' });
  });
  it('period within 2025 -> 2025', () => {
    expect(autoYearsFromPeriod('2025-01-01', '2025-12-31')).toEqual({ before: '2025', after: '2025' });
  });
  it('period 2025 -> 2026 -> no automatic choice (manual)', () => {
    expect(autoYearsFromPeriod('2025-07-01', '2026-06-30')).toBeNull();
  });
  it('saved year wins over rates_date; legacy rows fall back to rates_date year', () => {
    expect(initialRatesYear(2025, '2026-03-01')).toEqual({ year: '2025', fromSaved: true });
    expect(initialRatesYear(null, '2026-03-01')).toEqual({ year: '2026', fromSaved: false });
  });
});

describe('auto-apply protection', () => {
  it('blocks auto-apply when manual corrections exist', () => {
    expect(canAutoApplyRates({ manualMode: false, overriddenCount: 1, sources: {}, prefix: 'before' })).toBe(false);
  });
  it('blocks auto-apply when a rate field came from a document', () => {
    const s = markSources({}, ['capacity_charge_after'], { source: 'document' });
    expect(canAutoApplyRates({ manualMode: false, overriddenCount: 0, sources: s, prefix: 'after' })).toBe(false);
  });
  it('allows auto-apply when values come from the rates base', () => {
    const s = markSources({}, rateBaseFields('before'), { source: 'rate_base', rate_card_id: 'c' });
    expect(canAutoApplyRates({ manualMode: false, overriddenCount: 0, sources: s, prefix: 'before' })).toBe(true);
  });
});

describe('compatibility: new fields do not change results', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['one year', {}],
    ['2025 -> 2026', { period_from: '2025-07-01', period_to: '2026-06-30' }],
    ['manually changed rates', { contracted_power_charge_rate_before: 99, rates_overridden_before: { contracted_power_charge_rate_before: 99 } }],
    ['rates from other year', { variable_distribution_after_zone1_rate: 0.31 }],
  ];
  for (const [name, over] of cases) {
    it(name, () => {
      const a = calculateEnergyCosts(ppe(over) as never);
      const b = calculateEnergyCosts({ ...ppe(over), ...newFields } as never);
      expect(b).toEqual(a);
    });
  }
  it('several PPE totals unchanged', () => {
    const list = [ppe({ id: 'a', ppe_number: '1' }), ppe({ id: 'b', ppe_number: '2', consumption_before_zone1_mwh: 50, consumption_after_zone1_mwh: 50 })];
    const a = calculateProjectTotals(list as never);
    const b = calculateProjectTotals(list.map((x) => ({ ...x, ...newFields })) as never);
    expect(b.totalBefore).toBe(a.totalBefore);
    expect(b.totalAfter).toBe(a.totalAfter);
    expect(a.totalBefore).toBeGreaterThan(0);
  });
});
