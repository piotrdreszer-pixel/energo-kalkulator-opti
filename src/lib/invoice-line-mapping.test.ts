import { describe, it, expect } from 'vitest';
import { mapLineItems, convertForTarget, isCleanMapping, perKwhToPerMwh, kwhToMwh, type LineItemInput } from './invoice-line-mapping';
import { calculateEnergyCosts } from './calculation-utils';

const li = (o: Partial<LineItemInput>): LineItemInput => ({
  id: o.name || 'x', name: 'x', quantity: null, unit: null, rate: null, net_value: null, category: null, page: 2, ...o,
});

// Pozycje z rzeczywistego odczytu (C11, 27–31.03.2026)
const items: LineItemInput[] = [
  li({ name: 'Energia czynna', category: 'energia_czynna', quantity: 17, unit: 'kWh', rate: 0.9918, net_value: 16.86 }),
  li({ name: 'Opłata handlowa', category: 'handlowa', quantity: 1, unit: 'mc', rate: 49, net_value: 49 }),
  li({ name: 'Opłata jakościowa', category: 'dystrybucja', quantity: 17, unit: 'kWh', rate: 0.0332, net_value: 0.56 }),
  li({ name: 'Opłata sieciowa zmienna', category: 'dystrybucja', quantity: 17, unit: 'kWh', rate: 0.2562, net_value: 4.36 }),
  li({ name: 'Opłata OZE', category: 'dystrybucja', quantity: 17, unit: 'kWh', rate: 0.0073, net_value: 0.12 }),
  li({ name: 'Opłata kogeneracyjna', category: 'dystrybucja', quantity: 17, unit: 'kWh', rate: 0.003, net_value: 0.05 }),
  li({ name: 'Opłata sieciowa stała', category: 'dystrybucja', quantity: 40, unit: 'kW', rate: 7.72, net_value: 50.76 }),
  li({ name: 'Opłata mocowa', category: 'mocowa', quantity: 9, unit: 'kWh', rate: 0.2194, net_value: 1.97 }),
  li({ name: 'Opłata abonamentowa', category: 'abonament', quantity: 1, unit: 'mc', rate: 3.12, net_value: 3.12 }),
];
const record = {
  tariff_code: 'C11', consumption: [{ zone_name: 'całodobowa', value: 16.67, unit: 'kWh' }],
  period_from: '2026-03-27', period_to: '2026-03-31', contracted_power_kw: 40,
};
const byName = (maps: ReturnType<typeof mapLineItems>, n: string) => maps.find((m) => m.item.name === n)!;

describe('przeliczenia jednostek', () => {
  it('zł/kWh → zł/MWh i kWh → MWh', () => {
    expect(perKwhToPerMwh(0.9918)).toBeCloseTo(991.8, 9);
    expect(perKwhToPerMwh(0.2562)).toBeCloseTo(256.2, 9);
    expect(kwhToMwh(17)).toBeCloseTo(0.017, 12);
  });
  it('ilość × stawka nie zmienia się po konwersji', () => {
    expect(kwhToMwh(17) * perKwhToPerMwh(0.9918)).toBeCloseTo(17 * 0.9918, 9);
  });
});

describe('mapowanie pozycji faktury C11', () => {
  const maps = mapLineItems(items, record, null);
  it('energia czynna → cena PRZED S1 w zł/MWh', () => {
    const m = byName(maps, 'Energia czynna');
    expect(m.target).toBe('active_energy_price_before_zone1');
    expect(m.converted).toBeCloseTo(991.8, 9);
  });
  it('sieciowa zmienna dla taryfy C zostaje w zł/kWh (silnik mnoży ×1000)', () => {
    const m = byName(maps, 'Opłata sieciowa zmienna');
    expect(m.target).toBe('variable_distribution_before_zone1_rate');
    expect(m.converted).toBe(0.2562);
    const cost = calculateEnergyCosts({ tariff_code_before: 'C11', zones_count_before: 1, variable_distribution_before_zone1_rate: m.converted!, consumption_before_zone1_mwh: 0.017 });
    expect(cost.distributionCostBefore).toBeCloseTo(17 * 0.2562, 9);
  });
  it('sieciowa zmienna dla taryfy B zapisywana w zł/MWh (bez podwójnego ×1000)', () => {
    const v = convertForTarget(items[3], 'variable_distribution_before_zone1_rate', 'B21')!;
    expect(v.value).toBeCloseTo(256.2, 9);
    const cost = calculateEnergyCosts({ tariff_code_before: 'B21', zones_count_before: 1, variable_distribution_before_zone1_rate: v.value, consumption_before_zone1_mwh: 0.017 });
    expect(cost.distributionCostBefore).toBeCloseTo(17 * 0.2562, 9);
  });
  it('jakościowa, OZE i kogeneracyjna nie są doliczane do stawki sieciowej', () => {
    for (const n of ['Opłata jakościowa', 'Opłata OZE', 'Opłata kogeneracyjna']) {
      expect(byName(maps, n).status).toBe('unsupported');
      expect(byName(maps, n).target).toBeNull();
    }
  });
  it('sieciowa stała → stawka zł/kW/mies, nie kwota netto; informacja o niepełnym miesiącu', () => {
    const m = byName(maps, 'Opłata sieciowa stała');
    expect(m.target).toBe('contracted_power_charge_rate_before');
    expect(m.converted).toBe(7.72);
    expect(m.info.length).toBe(1);
  });
  it('opłata handlowa → zł/mies', () => {
    expect(byName(maps, 'Opłata handlowa').converted).toBe(49);
  });
  it('opłata mocowa i abonament wymagają ręcznego przypisania', () => {
    expect(byName(maps, 'Opłata mocowa').status).toBe('needs_assignment');
    expect(byName(maps, 'Opłata abonamentowa').status).toBe('needs_assignment');
  });
  it('„Zaznacz wszystkie poprawnie przypisane” obejmuje 4 pozycje', () => {
    expect(maps.filter(isCleanMapping).map((m) => m.item.name).sort()).toEqual(
      ['Energia czynna', 'Opłata handlowa', 'Opłata sieciowa stała', 'Opłata sieciowa zmienna']
    );
  });
  it('ręczne przypisanie opłaty mocowej przenosi kwotę z ostrzeżeniem o okresie', () => {
    const m = byName(mapLineItems(items, record, null, { 'Opłata mocowa': 'capacity_charge_before' }), 'Opłata mocowa');
    expect(m.converted).toBe(1.97);
    expect(m.warnings.some((w) => w.includes('Okres faktury'))).toBe(true);
  });
  it('dwie stawki na to samo pole nie są sumowane ani wybierane', () => {
    const two = [items[0], { ...items[0], id: 'e2', rate: 1.1 }];
    const ms = mapLineItems(two, record, null);
    expect(ms.every((m) => !isCleanMapping(m))).toBe(true);
  });
});
