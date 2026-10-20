import { describe, it, expect } from 'vitest';
import { buildSettlement, type SettlementDoc, type SettlementItem } from './invoice-settlement';
import type { InvoicePpeRecord } from './invoice-import';
import { planConsumptionEstimate, planCostEstimate, planReplaceEstimates, incompletePo, daysOf } from './invoice-gaps';

const doc = (id: string): SettlementDoc => ({ id, file_name: `${id}.pdf`, status: 'approved', doc_type: 'kompleksowa', issuer: 'X', document_number: id, corrected_document_number: null, file_hash: id });
const rec = (id: string, from: string, to: string, z1: number, z2: number): InvoicePpeRecord => ({
  id: `r${id}`, document_id: id, ppe_number: 'PL1', ppe_address: null, tariff_code: 'C12a', osd_name: null, period_from: from, period_to: to,
  contracted_power_kw: 40, max_power_kw: null, consumption: [{ zone_name: 'szczyt', value: z1, unit: 'kWh' }, { zone_name: 'pozaszczyt', value: z2, unit: 'kWh' }],
  reactive: null, other_charges: null, source_pages: null, matched_analysis_id: 'a1', match_status: 'matched', applied_fields: [], applied_at: '2025-11-01', review_state: null,
} as unknown as InvoicePpeRecord);
const item = (id: string, docId: string, v: number): SettlementItem => ({ id, document_id: docId, ppe_record_id: `r${docId}`, name: 'Opłata mocowa', quantity: null, unit: 'zł', rate: null, net_value: v, category: 'capacity', page: 1 });

const docs = [doc('jul'), doc('sep'), doc('oct')];
const records = [rec('jul', '2025-07-01', '2025-07-31', 3100, 6200), rec('sep', '2025-09-01', '2025-09-30', 3000, 6000), rec('oct', '2025-10-01', '2025-10-31', 3100, 6200)];
const items = [item('i1', 'jul', 310), item('i2', 'sep', 300), item('i3', 'oct', 310)];
const s = buildSettlement({ ppeNumber: 'PL1', analysisId: 'a1', docs, records, items });
const row = { zones_count_before: 2, zones_count_after: 2, tariff_code_before: 'C12a', tariff_code_after: 'C12a',
  consumption_before_zone1_mwh: 9.2, consumption_before_zone2_mwh: 18.4, consumption_after_zone1_mwh: 9.2, consumption_after_zone2_mwh: 18.4, capacity_charge_before: 920 };

describe('okres i luki z faktur', () => {
  it('okres 01.07–31.10.2025 z luką w sierpniu', () => {
    expect(s.proposedPeriod).toEqual({ from: '2025-07-01', to: '2025-10-31' });
    expect(s.gaps).toEqual([{ from: '2025-08-01', to: '2025-08-31' }]);
    expect(daysOf(s.gaps[0])).toBe(31);
  });
});

describe('szacunek zużycia sierpnia', () => {
  const p = planConsumptionEstimate(row, s, s.gaps[0]);
  it('średnia dobowa lipca i września osobno dla każdej strefy', () => {
    expect(p.errors).toEqual([]);
    // strefa 1: (3,1 + 3,0) / 61 dni × 31 = 3,1000 MWh; strefa 2: (6,2 + 6,0) / 61 × 31 = 6,2000
    expect(p.estimates.find(e => e.field === 'consumption_before_zone1_mwh')?.value).toBeCloseTo(3.1, 4);
    expect(p.estimates.find(e => e.field === 'consumption_before_zone2_mwh')?.value).toBeCloseTo(6.2, 4);
    expect(p.changes.find(c => c.field === 'consumption_before_zone1_mwh')?.value).toBeCloseTo(12.3, 4);
  });
  it('zgodne taryfy i zużycie nie upoważniają do zmiany PO', () => {
    expect(p.changes.map(c => c.field)).toEqual(['consumption_before_zone1_mwh', 'consumption_before_zone2_mwh']);
    expect(p.estimates.every(e => e.field.startsWith('consumption_before_'))).toBe(true);
    const q = planConsumptionEstimate({ ...row, consumption_after_zone1_mwh: 5 }, s, s.gaps[0]);
    expect(q.changes.some(c => c.field === 'consumption_after_zone1_mwh')).toBe(false);
  });
  it('ręcznie zmienione zużycie blokuje szacunek', () => {
    const q = planConsumptionEstimate({ ...row, consumption_before_zone1_mwh: 50 }, s, s.gaps[0]);
    expect(q.changes).toEqual([]);
    expect(q.errors.length).toBeGreaterThan(0);
  });
});

describe('szacunek kosztów i zastąpienie fakturą', () => {
  it('opłata mocowa sierpnia = (310+300)/61×31', () => {
    const p = planCostEstimate(row, s, s.gaps[0]);
    expect(p.estimates[0].value).toBeCloseTo(310, 2);
    expect(p.changes[0]).toEqual({ field: 'capacity_charge_before', value: 1230 });
  });
  it('faktura za sierpień zastępuje szacunek sumą z faktur, bez dodawania', () => {
    const s2 = buildSettlement({ ppeNumber: 'PL1', analysisId: 'a1', docs: [...docs, doc('aug')], records: [...records, rec('aug', '2025-08-01', '2025-08-31', 2000, 4000)], items });
    const active = [{ id: 'e1', field: 'consumption_before_zone1_mwh', period_from: '2025-08-01', period_to: '2025-08-31', value: 3.1, base_value: 9.2, unit: 'MWh' }];
    const p = planReplaceEstimates({ ...row, consumption_before_zone1_mwh: 12.3 }, s2, active);
    expect(p.replace).toEqual(['e1']);
    expect(p.changes[0].value).toBeCloseTo(11.2, 4);
    expect(planReplaceEstimates({ ...row, consumption_before_zone1_mwh: 12.3 }, s, active).replace).toEqual([]);
  });
});

describe('niepełny wariant PO', () => {
  it('koszt w PRZED i pusty w PO jest oznaczany', () => {
    expect(incompletePo({ period_from: '2025-01-01', period_to: '2025-12-31', handling_fee_before: 100, handling_fee_after: null })).toContain('opłata handlowa');
    expect(incompletePo({ period_from: '2025-01-01', period_to: '2025-12-31', handling_fee_before: 100, handling_fee_after: 50 })).toEqual([]);
  });
});
