import { describe, it, expect } from 'vitest';
import { planReapply } from './invoice-reedit';
import { normalizeTariffCode, mapConsumptionZones, recordToBeforeFields, tariffConflict, type InvoicePpeRecord } from './invoice-import';
import { planOtherCharges, type LineMapping } from './invoice-line-mapping';
import { getZonesCount } from './tariff-utils';

describe('normalizeTariffCode', () => {
  it('dopasowuje wielkość liter i spacje, zachowuje oznaczenia', () => {
    expect(normalizeTariffCode('c12A').code).toBe('C12a');
    expect(normalizeTariffCode(' C 22 b ').code).toBe('C22b');
    expect(normalizeTariffCode('Grupa taryfowa: G12w').code).toBe('G12w');
    expect(normalizeTariffCode('C21').code).toBe('C21');
  });
  it('nierozpoznana taryfa nie dostaje domyślnej', () => {
    expect(normalizeTariffCode('C12').code).toBeNull();
    expect(normalizeTariffCode('X99').code).toBeNull();
    expect(normalizeTariffCode(null).code).toBeNull();
  });
  it('liczba stref nie zależy od wielkości liter', () => {
    expect(getZonesCount('C12A')).toBe(2);
    expect(getZonesCount('b23')).toBe(3);
  });
  it('różne taryfy jednego PPE na fakturach = konflikt', () => {
    const c = tariffConflict('PPE1', [
      { ppe_number: 'PPE1', tariff_code: 'C11', period_from: '2025-01-01', period_to: '2025-06-30' },
      { ppe_number: 'PPE 1', tariff_code: 'c12a', period_from: '2025-07-01', period_to: '2025-12-31' },
      { ppe_number: 'PPE2', tariff_code: 'B23', period_from: null, period_to: null },
    ]);
    expect(c?.map((x) => x.code)).toEqual(['C11', 'C12a']);
    expect(tariffConflict('PPE1', [{ ppe_number: 'PPE1', tariff_code: 'C11', period_from: null, period_to: null }, { ppe_number: 'PPE1', tariff_code: 'c11', period_from: null, period_to: null }])).toBeNull();
  });
});

describe('mapConsumptionZones', () => {
  it('2 strefy wg znaczenia, nie kolejności; kWh → MWh', () => {
    const p = mapConsumptionZones([
      { zone_name: 'Pozaszczyt', value: 7500, unit: 'kWh' },
      { zone_name: 'Szczyt', value: 2500, unit: 'kWh' },
    ], 2);
    expect(p.values).toEqual({ 1: 2.5, 2: 7.5 });
    expect(p.missing).toEqual([]);
  });
  it('3 strefy, MWh bez ponownego przeliczenia', () => {
    const p = mapConsumptionZones([
      { zone_name: 'pozostałe godziny doby', value: 6, unit: 'MWh' },
      { zone_name: 'szczyt przedpołudniowy', value: 2.5, unit: 'MWh' },
      { zone_name: 'szczyt popołudniowy', value: 1.5, unit: 'MWh' },
    ], 3);
    expect(p.values).toEqual({ 1: 2.5, 2: 1.5, 3: 6 });
  });
  it('brak odczytu strefy = brak danych, nie zero ani podział', () => {
    const p = mapConsumptionZones([{ zone_name: 'Szczyt', value: 1000, unit: 'kWh' }], 2);
    expect(p.values).toEqual({ 1: 1 });
    expect(p.values[2]).toBeUndefined();
    expect(p.missing).toEqual([2]);
  });
  it('to samo zużycie przy różnych opłatach liczone raz; zużycie łączne tylko do kontroli', () => {
    const p = mapConsumptionZones([
      { zone_name: 'Szczyt', value: 1000, unit: 'kWh' },
      { zone_name: 'Szczyt', value: 1000, unit: 'kWh' },
      { zone_name: 'Pozaszczyt', value: 3000, unit: 'kWh' },
      { zone_name: 'Razem', value: 4500, unit: 'kWh' },
    ], 2);
    expect(p.values).toEqual({ 1: 1, 2: 3 });
    expect(p.totalMwh).toBe(4.5);
    expect(p.mismatch).toBe(true);
  });
  it('różne okresy rozliczeń sumowane, różne wartości w tym samym okresie = konflikt', () => {
    const p = mapConsumptionZones([
      { zone_name: 'Szczyt', value: 1000, unit: 'kWh', period_from: '2026-01-01', period_to: '2026-01-31' },
      { zone_name: 'Szczyt', value: 1200, unit: 'kWh', period_from: '2026-02-01', period_to: '2026-02-28' },
      { zone_name: 'Pozaszczyt', value: 1, unit: 'kWh' },
      { zone_name: 'Pozaszczyt', value: 2, unit: 'kWh' },
    ], 2);
    expect(p.values[1]).toBeCloseTo(2.2, 12);
    expect(p.conflicts).toEqual([2]);
    expect(p.values[2]).toBeUndefined();
  });
  it('rekord → pola PRZED: taryfa ze słownika i strefy dla dwóch PPE niezależnie', () => {
    const base = { id: 'r', document_id: 'd', ppe_address: null, osd_name: null, period_from: null, period_to: null, contracted_power_kw: null, max_power_kw: null, reactive: null, other_charges: null, source_pages: null, matched_analysis_id: null, match_status: 'new', applied_fields: [], applied_at: null } as const;
    const a = recordToBeforeFields({ ...base, ppe_number: 'A', tariff_code: 'c12a', consumption: [{ zone_name: 'poza szczytem', value: 3000, unit: 'kWh' }, { zone_name: 'szczyt', value: 1000, unit: 'kWh' }] } as unknown as InvoicePpeRecord);
    const b = recordToBeforeFields({ ...base, ppe_number: 'B', tariff_code: 'B23', consumption: [{ zone_name: 'S3', value: 9, unit: 'MWh' }, { zone_name: 'S1', value: 1, unit: 'MWh' }, { zone_name: 'S2', value: 2, unit: 'MWh' }] } as unknown as InvoicePpeRecord);
    expect(a).toMatchObject({ tariff_code_before: 'C12a', consumption_before_zone1_mwh: 1, consumption_before_zone2_mwh: 3 });
    expect(a.consumption_before_zone3_mwh).toBeUndefined();
    expect(b).toMatchObject({ tariff_code_before: 'B23', consumption_before_zone1_mwh: 1, consumption_before_zone2_mwh: 2, consumption_before_zone3_mwh: 9 });
    const u = recordToBeforeFields({ ...base, ppe_number: 'C', tariff_code: 'XYZ', consumption: [{ zone_name: 'szczyt', value: 1000, unit: 'kWh' }] } as unknown as InvoicePpeRecord);
    expect(u.tariff_code_before).toBeUndefined();
    expect(u.consumption_before_zone1_mwh).toBeUndefined();
  });
});

describe('planReapply — ponowna edycja importu', () => {
  it('ponowny zapis bez zmian nie zmienia wartości', () => {
    const prev = { active_energy_price_before_zone1: { before: 600, after: 991.8 } };
    const r = planReapply({ desired: { active_energy_price_before_zone1: 991.8 }, current: { active_energy_price_before_zone1: 991.8 }, previous: prev });
    expect(r.write).toEqual({ active_energy_price_before_zone1: 991.8 });
    expect(r.applied.active_energy_price_before_zone1.before).toBe(600);
  });
  it('odznaczona pozycja przywraca wartość sprzed importu', () => {
    const r = planReapply({ desired: {}, current: { handling_fee_before: 49 }, previous: { handling_fee_before: { before: 20, after: 49 } } });
    expect(r.write).toEqual({ handling_fee_before: 20 });
    expect(r.restored).toEqual(['handling_fee_before']);
  });
  it('ręczna zmiana po imporcie nie jest cofana bez zgody', () => {
    const prev = { handling_fee_before: { before: 20, after: 49 } };
    const r = planReapply({ desired: { handling_fee_before: 55 }, current: { handling_fee_before: 60 }, previous: prev });
    expect(r.write).toEqual({});
    expect(r.manual).toEqual([{ field: 'handling_fee_before', applied: 49, current: 60, incoming: 55 }]);
    const ok = planReapply({ desired: { handling_fee_before: 55 }, current: { handling_fee_before: 60 }, previous: prev, replaceManual: new Set(['handling_fee_before']) });
    expect(ok.write).toEqual({ handling_fee_before: 55 });
    const desel = planReapply({ desired: {}, current: { handling_fee_before: 60 }, previous: prev });
    expect(desel.write).toEqual({});
    expect(desel.manual[0].incoming).toBeUndefined();
  });
});

describe('suma opłat przy ponownej edycji', () => {
  const m = (id: string, v: number): LineMapping => ({ item: { id, name: id, quantity: null, unit: null, rate: null, net_value: v, vat_rate: null, gross_value: null, category: null, page: 1 }, kind: 'other', target: 'fixed_distribution_before_total', allowedTargets: [], status: 'mapped', converted: v, convertedUnit: 'zł', reason: null, warnings: [], info: [] } as unknown as LineMapping);
  const prev = [
    { document_id: 'D1', item_ref: 'a', name: 'a', net_value: 100, page: 1, period_from: null, period_to: null },
    { document_id: 'D1', item_ref: 'b', name: 'b', net_value: 50, page: 1, period_from: null, period_to: null },
    { document_id: 'D2', item_ref: 'x', name: 'x', net_value: 30, page: 1, period_from: null, period_to: null },
  ];
  const run = (sel: string[]) => planOtherCharges({ maps: [m('a', 100), m('b', 50)], selected: new Set(sel), documentId: 'D1', period: { from: null, to: null }, current: 180, previous: prev, mode: null });
  it('ponowny zapis bez zmian nie podwaja', () => expect(run(['a', 'b']).result).toBe(180));
  it('odznaczenie pozycji pomniejsza wkład, wkład innej faktury zostaje', () => {
    const r = run(['a']);
    expect(r.result).toBe(130);
    expect(r.breakdown.map((x) => x.item_ref).sort()).toEqual(['a', 'x']);
  });
  it('odznaczenie wszystkiego zostawia tylko inne faktury', () => expect(run([]).result).toBe(30));
});

import { mapLineItems } from './invoice-line-mapping';
describe('strefa opłaty wg nazwy', () => {
  it('„zmienna dzienna/nocna” trafia do strefy 1/2 dla C22b', () => {
    const it = (id: string, name: string) => ({ id, name, quantity: 1000, unit: 'kWh', rate: 0.3, net_value: 300, vat_rate: 23, gross_value: null, category: 'dystrybucja', page: 4 });
    const maps = mapLineItems([it('a', 'Opłata sieciowa zmienna dzienna'), it('b', 'Opłata sieciowa zmienna nocna')],
      { tariff_code: 'C22B', consumption: [{ zone_name: 'Dzień', value: 1, unit: 'kWh' }, { zone_name: 'Noc', value: 1, unit: 'kWh' }], period_from: null, period_to: null, contracted_power_kw: null }, null);
    expect(maps.map((m) => m.target)).toEqual(['variable_distribution_before_zone1_rate', 'variable_distribution_before_zone2_rate']);
  });
});

import { selectionProblems } from './invoice-line-mapping';
describe('Suma pozostałych opłat — pełny scenariusz 100 + 25,50 + 74,50', () => {
  const mk = (id: string, v: number | null, target: string | null = 'fixed_distribution_before_total'): LineMapping => ({ item: { id, name: id, quantity: null, unit: null, rate: null, net_value: v, vat_rate: null, gross_value: null, category: null, page: 1 }, kind: 'other', target, allowedTargets: [], status: 'mapped', converted: v, convertedUnit: 'zł', reason: null, warnings: [], info: [] } as unknown as LineMapping);
  const maps = [mk('a', 100), mk('b', 25.5), mk('c', 74.5)];
  const plan = (sel: string[], current: number, previous: ReturnType<typeof planOtherCharges>['breakdown'] | null) =>
    planOtherCharges({ maps, selected: new Set(sel), documentId: 'D', period: { from: null, to: null }, current, previous, mode: null });
  it('suma 200,00 → odznaczenie 25,50 daje 174,50 → ponowny zapis nie zwiększa', () => {
    const first = plan(['a', 'b', 'c'], 0, null);
    expect(first.result).toBe(200);
    const second = plan(['a', 'c'], 200, first.breakdown);
    expect(second.result).toBe(174.5);
    const third = plan(['a', 'c'], 174.5, second.breakdown);
    expect(third.result).toBe(174.5);
  });
  it('zaznaczona pozycja bez pola lub kwoty ma podaną przyczynę', () => {
    const p = selectionProblems([mk('x', null), mk('y', 10, null), mk('z', 5)], new Set(['x', 'y', 'z']));
    expect(p.map((x) => x.name)).toEqual(['x', 'y']);
  });
});
