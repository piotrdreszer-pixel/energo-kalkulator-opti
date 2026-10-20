import { describe, it, expect } from 'vitest';
import { checkTariffChange, mapConsumptionForTariff, cheapest, compareTariffs } from '../../supabase/functions/_shared/tariff-compare';

describe('tariff + power as one operation', () => {
  it('B23 with 1050 kW is validated against the new tariff', () => {
    const r = checkTariffChange({ from: 'C21', to: 'B23', powerKw: 1050, visibleForOsd: null });
    expect(r.ok).toBe(true);
    expect(r.conditions.length).toBe(1);
  });
  it('tariff hidden for OSD is rejected', () => {
    expect(checkTariffChange({ from: 'C21', to: 'B23', powerKw: 1050, visibleForOsd: ['C21', 'C22a'] }).ok).toBe(false);
  });
  it('C11 above 40 kW is rejected', () => {
    expect(checkTariffChange({ from: 'C21', to: 'C11', powerKw: 50, visibleForOsd: null }).ok).toBe(false);
  });
});

describe('zone consumption', () => {
  it('different zone meaning → missing, never split by guess', () => {
    expect(mapConsumptionForTariff('C22a', 'B23', [10, 30, null]).missing).toBe(true);
  });
  it('1-zone target takes the total', () => {
    expect(mapConsumptionForTariff('C22a', 'C21', [10, 30, null]).values[0]).toBe(40);
  });
});

describe('comparison', () => {
  const row = { tariff_code_after: 'C21', zones_count_after: 1, contracted_power_after_kw: 50, consumption_after_zone1_mwh: 100, active_energy_price_after_zone1: 500, period_from: '2025-01-01', period_to: '2025-12-31' };
  it('missing rate is not zero', () => {
    const r = compareTariffs(row, [{ code: 'C21', year: 2025, source: 'baza', rates: { fixed_distribution_after_total: 100, contracted_power_charge_rate_after: null, variable_distribution_after_zone1_rate: 0.1 } }], null);
    expect(r[0].status).toBe('brakujace');
    expect(r[0].costPo).toBeNull();
  });
  it('tie → no cheapest', () => {
    const a = { code: 'X', powerKw: 1, year: 1, source: '', costPo: 10, diffVsPo: 0, savingsVsBefore: 0, status: 'kompletne' as const, notes: [] };
    expect(cheapest([a, { ...a, code: 'Y' }])).toBeNull();
    expect(cheapest([a, { ...a, code: 'Y', costPo: 12 }])?.code).toBe('X');
  });
});

import { validateAppChanges } from '../../supabase/functions/ai-assistant/proposal';
describe('tariff PO operation fields', () => {
  it('tariff PO change may not touch PRZED', () => {
    expect(validateAppChanges('tariff_po', [{ field: 'tariff_code_after', value: 'B23' }, { field: 'contracted_power_after_kw', value: 1050 }])).toEqual([]);
    expect(validateAppChanges('tariff_po', [{ field: 'tariff_code_before', value: 'B23' }]).length).toBe(1);
  });
});
