import { describe, it, expect } from 'vitest';
import { capacityGroup, capacityBlockReason, mapLineItems, planOtherCharges, type OtherContribution, convertForTarget, isCleanMapping, perKwhToPerMwh, kwhToMwh, type LineItemInput } from './invoice-line-mapping';
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
  it('jakościowa, OZE i kogeneracyjna → sugerowana Suma pozostałych opłat, nie zaznaczane automatycznie', () => {
    for (const n of ['Opłata jakościowa', 'Opłata OZE', 'Opłata kogeneracyjna']) {
      expect(byName(maps, n).target).toBe('fixed_distribution_before_total');
      expect(byName(maps, n).converted).toBe(byName(maps, n).item.net_value);
      expect(isCleanMapping(byName(maps, n))).toBe(false);
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
  it('opłata mocowa wymaga przypisania, abonament ma sugestię sumy', () => {
    expect(byName(maps, 'Opłata mocowa').status).toBe('needs_assignment');
    expect(byName(maps, 'Opłata abonamentowa').target).toBe('fixed_distribution_before_total');
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

describe('Suma pozostałych opłat PRZED', () => {
  const big: LineItemInput[] = [
    li({ id: 'q', name: 'Opłata jakościowa', category: 'dystrybucja', quantity: 22000, unit: 'kWh', rate: 0.0338, net_value: 743.45 }),
    li({ id: 'o', name: 'Opłata OZE', category: 'dystrybucja', quantity: 22000, unit: 'kWh', rate: 0.0073, net_value: 163.47 }),
    li({ id: 'k', name: 'Opłata kogeneracyjna', category: 'dystrybucja', quantity: 22000, unit: 'kWh', rate: 0.003, net_value: 67.18 }),
    li({ id: 's', name: 'Saldo z poprzedniego okresu', net_value: 500 }),
  ];
  const maps = mapLineItems(big, record, null);
  const base = { maps, documentId: 'd1', period: { from: '2026-01-01', to: '2026-12-31' }, previous: null };
  it('sumuje kwoty netto zaznaczonych pozycji: 743,45 + 163,47 + 67,18 = 974,10', () => {
    const p = planOtherCharges({ ...base, selected: new Set(['q', 'o', 'k']), current: 0, mode: null });
    expect(p.total).toBe(974.1);
    expect(p.result).toBe(974.1);
  });
  it('odznaczenie pozycji zmniejsza sumę', () => {
    expect(planOtherCharges({ ...base, selected: new Set(['q', 'k']), current: 0, mode: null }).total).toBe(810.63);
  });
  it('saldo nie trafia do sumy', () => {
    expect(byName(maps, 'Saldo z poprzedniego okresu').status).toBe('unsupported');
    expect(planOtherCharges({ ...base, selected: new Set(['q', 's']), current: 0, mode: null }).total).toBe(743.45);
  });
  it('istniejąca kwota wymaga jawnego wyboru zastąp/dodaj', () => {
    const sel = new Set(['q', 'o', 'k']);
    expect(planOtherCharges({ ...base, selected: sel, current: 100, mode: null }).result).toBeNull();
    expect(planOtherCharges({ ...base, selected: sel, current: 100, mode: 'replace' }).result).toBe(974.1);
    expect(planOtherCharges({ ...base, selected: sel, current: 100, mode: 'add' }).result).toBe(1074.1);
  });
  it('ponowne dodanie tego samego dokumentu przelicza wkład zamiast go dublować', () => {
    const prev: OtherContribution[] = [{ document_id: 'd1', item_ref: 'q', name: 'x', net_value: 743.45, page: 2, period_from: null, period_to: null }];
    const p = planOtherCharges({ ...base, selected: new Set(['q', 'o', 'k']), current: 843.45, previous: prev, mode: 'add' });
    expect(p.result).toBe(1074.1);
    expect(p.breakdown.length).toBe(3);
  });
  it('wkład innego dokumentu zostaje przy dodawaniu', () => {
    const prev: OtherContribution[] = [{ document_id: 'd0', item_ref: 'z', name: 'x', net_value: 100, page: 1, period_from: null, period_to: null }];
    const p = planOtherCharges({ ...base, selected: new Set(['q']), current: 100, previous: prev, mode: 'add' });
    expect(p.result).toBe(843.45);
    expect(p.breakdown.map((b) => b.document_id)).toEqual(['d0', 'd1']);
  });
  it('pozycja przypisana do pola dedykowanego nie trafia do sumy', () => {
    const m2 = mapLineItems([...big, li({ id: 'm', name: 'Opłata mocowa', category: 'mocowa', net_value: 50 })], record, null, { m: 'capacity_charge_before' });
    expect(planOtherCharges({ ...base, maps: m2, selected: new Set(['q', 'm']), current: 0, mode: null }).total).toBe(743.45);
  });
});

describe('grupa opłaty mocowej', () => {
  const cap = (id: string, net: number | null) => li({ id, name: `Opłata mocowa ${id}`, category: 'mocowa', quantity: 9, unit: 'kWh', rate: 0.2194, net_value: net });
  const its = [cap('m1', 120.5), cap('m2', 80.25), cap('m3', 49.25), cap('mx', null), items[0]];
  const all = { m1: 'capacity_charge_before', m2: 'capacity_charge_before', m3: 'capacity_charge_before', mx: 'capacity_charge_before' } as const;
  const maps = mapLineItems(its, record, null, all);
  const plan = (sel: string[], m = maps) => planOtherCharges({ maps: m, selected: new Set(sel), documentId: 'd1', period: { from: null, to: null }, current: 0, previous: null, mode: 'replace', target: 'capacity_charge_before' });
  it('kilka pozycji mocowej na jedno pole nie powoduje konfliktu', () => {
    expect(capacityGroup(maps).length).toBe(4);
    expect(maps.filter((m) => m.item.id !== 'mx' && m.kind === 'capacity').every((m) => m.status === 'mapped')).toBe(true);
  });
  it('zaznaczenie wszystkich sumuje kwoty netto', () => expect(plan(['m1', 'm2', 'm3', 'mx']).total).toBe(250));
  it('odznaczenie jednej pozycji usuwa jej wkład', () => expect(plan(['m1', 'm3']).total).toBe(169.75));
  it('odznaczenie całej grupy → brak sumy', () => expect(plan([]).result).toBeNull());
  it('pozycja bez kwoty zablokowana z przyczyną', () => {
    expect(capacityBlockReason(maps.find((m) => m.item.id === 'mx')!)).toBe('Brak kwoty netto na fakturze.');
  });
  it('mocowa nie trafia do Sumy pozostałych opłat', () => {
    expect(planOtherCharges({ maps, selected: new Set(['m1']), documentId: 'd1', period: { from: null, to: null }, current: 0, previous: null, mode: null }).total).toBe(0);
  });
  it('dwa PPE liczone niezależnie', () => {
    const m2 = mapLineItems([cap('m1', 10)], record, null, { m1: 'capacity_charge_before' });
    expect(plan(['m1'], m2).total).toBe(10);
    expect(plan(['m1']).total).toBe(120.5);
  });
});
