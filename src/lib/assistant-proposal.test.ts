import { describe, it, expect } from 'vitest';
import { validateProposal, buildProposalPreview, isProposalStale } from './assistant-proposal';
import { canAutoApplyRates } from './value-sources';

const row = {
  period_from: '2025-01-01', period_to: '2025-12-31', osd_id: 'x', tariff_code_before: 'C12A', tariff_code_after: 'C12A',
  zones_count_before: 2, zones_count_after: 2, consumption_before_zone1_mwh: 100, consumption_before_zone2_mwh: 100,
  consumption_after_zone1_mwh: 100, consumption_after_zone2_mwh: 100,
  active_energy_price_before_zone1: 600, active_energy_price_before_zone2: 600,
  active_energy_price_after_zone1: 550, active_energy_price_after_zone2: 550,
  handling_fee_before: 100, handling_fee_after: 100, contracted_power_after_kw: 50,
  value_sources: { active_energy_price_after_zone1: { source: 'manual' } },
};
const ok = (changes: { field: string; value: number }[], extra = {}) => validateProposal({ changes, source: 'polecenie_uzytkownika', assumption: null }, { ...row, ...extra });

describe('assistant proposals', () => {
  it('accepts prices in both active zones', () => {
    expect(ok([{ field: 'active_energy_price_after_zone1', value: 500 }, { field: 'active_energy_price_after_zone2', value: 450 }]).ok).toBe(true);
  });
  it('rejects a zone the PO tariff does not have', () => {
    expect(ok([{ field: 'active_energy_price_after_zone3', value: 500 }]).ok).toBe(false);
  });
  it('rejects fields outside the closed list (PRZED, tariff)', () => {
    expect(ok([{ field: 'active_energy_price_before_zone1', value: 1 }]).ok).toBe(false);
    expect(ok([{ field: 'tariff_code_after', value: 1 }]).ok).toBe(false);
  });
  it('rejects negative and zero power', () => {
    expect(ok([{ field: 'handling_fee_after', value: -1 }]).ok).toBe(false);
    expect(ok([{ field: 'contracted_power_after_kw', value: 0 }]).ok).toBe(false);
  });
  it('marks power change as simulation', () => {
    const r = ok([{ field: 'contracted_power_after_kw', value: 40 }]);
    expect(r.ok && r.proposal.isSimulation).toBe(true);
  });
  it('requires a described assumption', () => {
    expect(validateProposal({ changes: [{ field: 'handling_fee_after', value: 50 }], source: 'zalozenie', assumption: null }, row).ok).toBe(false);
  });
  it('blocks reactive cost when PO is entered monthly', () => {
    expect(ok([{ field: 'reactive_energy_cost_after', value: 10 }], { reactive_monthly_mode_after: true }).ok).toBe(false);
  });
  it('preview: prices 500/450 give PO 95 000 + fees, extra benefit 15 000 zł', () => {
    const p = buildProposalPreview(row, [{ field: 'active_energy_price_after_zone1', value: 500 }, { field: 'active_energy_price_after_zone2', value: 450 }]);
    expect(p.currentAfter).toBeCloseTo(110000 + 1200, 2);
    expect(p.proposedAfter).toBeCloseTo(95000 + 1200, 2);
    expect(p.extraBenefit).toBeCloseTo(15000, 2);
    expect(p.savingsAfterChange).toBeCloseTo(121200 - 96200, 2);
    expect(p.fields[0].replaces).toBe('ręczną korektę');
  });
  it('preview: monthly handling fee scales with period months', () => {
    const p = buildProposalPreview(row, [{ field: 'handling_fee_after', value: 50 }]);
    expect(p.extraBenefit).toBeCloseTo(600, 2);
  });
  it('stale when saved after preparation', () => {
    expect(isProposalStale('2026-01-01T10:00:00.5+00:00', '2026-01-01T10:00:00.5Z')).toBe(false);
    expect(isProposalStale('2026-01-01T10:00:01Z', '2026-01-01T10:00:00Z')).toBe(true);
  });
  it('auto rates never overwrite applied assistant values', () => {
    expect(canAutoApplyRates({ manualMode: false, overriddenCount: 0, prefix: 'after', sources: { capacity_charge_after: { source: 'ai' } } })).toBe(false);
  });
});
