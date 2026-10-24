import { describe, it, expect } from 'vitest';
import { planYearSimulation, missingWithin, METHOD_YEAR } from '../../supabase/functions/_shared/year-simulation';
import type { Settlement, SettlementEntry } from '../../supabase/functions/_shared/invoice-settlement';

const entry = (id: string, from: string, to: string, kwh: number, counted = true, included = true): SettlementEntry => ({
  record: { id, period_from: from, period_to: to, consumption: [{ zone_name: 'całodobowa', value: kwh, unit: 'kWh' }] } as never,
  doc: { id: 'd' + id, file_name: `faktura-${id}.pdf` } as never,
  stream: 'both', included, consumptionCounted: counted, notes: [],
});

const settlement = (entries: SettlementEntry[], extra: Partial<Settlement> = {}): Settlement => ({
  ppeNumber: 'PL1', entries, pending: [], tariffs: [], zones: 1,
  zoneSummaries: [{ zone: 1, mwh: entries.filter(e => e.included && e.consumptionCounted).reduce((n, e) => n + (e.record.consumption as { value: number }[])[0].value / 1000, 0), incomplete: false, activeCost: null, price: null, priceNote: null, components: [], costComponents: [] }],
  costs: [], totalNet: 0, contractedPower: [], pmax: null, pmaxMissing: 0, handling: null,
  proposedPeriod: null, gaps: [], issues: [], blocked: [], ...extra,
});

// Styczeń–maj 2025: 151 dni danych, 5 MWh; czerwiec–grudzień: 214 dni brakujących.
const janMay = () => [
  entry('1', '2025-01-01', '2025-01-31', 1000), entry('2', '2025-02-01', '2025-02-28', 1000),
  entry('3', '2025-03-01', '2025-03-31', 1000), entry('4', '2025-04-01', '2025-04-30', 1000),
  entry('5', '2025-05-01', '2025-05-31', 1000),
];
const row = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'a', zones_count_before: 1, period_from: '2025-01-01', period_to: '2025-05-31',
  consumption_before_zone1_mwh: 5, consumption_after_zone1_mwh: 5, ...extra,
});
const YEAR = { from: '2025-01-01', to: '2025-12-31' };

describe('missingWithin', () => {
  it('przedłużenie po ostatniej fakturze', () => {
    expect(missingWithin(YEAR, [{ from: '2025-01-01', to: '2025-05-31' }])).toEqual([{ from: '2025-06-01', to: '2025-12-31' }]);
  });
  it('przedłużenie przed pierwszą fakturą', () => {
    expect(missingWithin(YEAR, [{ from: '2025-06-01', to: '2025-12-31' }])).toEqual([{ from: '2025-01-01', to: '2025-05-31' }]);
  });
  it('luki wewnątrz i przedłużenie razem', () => {
    expect(missingWithin(YEAR, [{ from: '2025-01-01', to: '2025-01-31' }, { from: '2025-03-01', to: '2025-03-31' }]))
      .toEqual([{ from: '2025-02-01', to: '2025-02-28' }, { from: '2025-04-01', to: '2025-12-31' }]);
  });
  it('pełne pokrycie → brak brakujących', () => {
    expect(missingWithin(YEAR, [{ from: '2025-01-01', to: '2025-06-30' }, { from: '2025-07-01', to: '2025-12-31' }])).toEqual([]);
  });
});

describe('planYearSimulation', () => {
  it('przedłużenie na pełny rok: 151 dni danych, 214 dni szacowanych, średnia dobowa', () => {
    const p = planYearSimulation(row(), settlement(janMay()), [], YEAR);
    expect(p.errors).toEqual([]);
    // 5 MWh / 151 dni × 214 dni = 7,0861 MWh; razem 12,0861 MWh
    expect(p.estimates).toHaveLength(1);
    expect(p.estimates[0]).toMatchObject({ field: 'consumption_before_zone1_mwh', period_from: '2025-06-01', period_to: '2025-12-31', value: 7.0861, unit: 'MWh', method: METHOD_YEAR });
    expect(p.changes).toContainEqual({ field: 'consumption_before_zone1_mwh', value: 12.0861 });
    expect(p.changes).toContainEqual({ field: 'period_from', value: '2025-01-01' });
    expect(p.changes).toContainEqual({ field: 'period_to', value: '2025-12-31' });
    expect(p.preview).toMatchObject({ okres_docelowy: { dni: 365 }, dane_rzeczywiste: { od: '2025-01-01', do: '2025-05-31', dni: 151 } });
    expect(p.preview!.brakujace_okresy).toEqual([{ od: '2025-06-01', do: '2025-12-31', dni: 214 }]);
    expect(p.preview!.strefy[0]).toMatchObject({ strefa: 1, rzeczywiste_mwh: 5, szacunek_mwh: 7.0861, razem_mwh: 12.0861 });
  });

  it('kilka brakujących części naraz (luka + przedłużenie), bez ograniczenia do pierwszej', () => {
    const entries = [entry('1', '2025-01-01', '2025-01-31', 1000), entry('3', '2025-03-01', '2025-03-31', 1000)];
    const p = planYearSimulation(row({ consumption_before_zone1_mwh: 2 }), settlement(entries), [], YEAR);
    expect(p.errors).toEqual([]);
    expect(p.estimates.map(e => [e.period_from, e.period_to])).toEqual([
      ['2025-02-01', '2025-02-28'], ['2025-04-01', '2025-12-31'],
    ]);
    // 2 MWh / 62 dni; luty: 28 dni → 0,9032; kwiecień–grudzień: 275 dni → 8,871
    expect(p.estimates[0].value).toBe(0.9032);
    expect(p.estimates[1].value).toBe(8.871);
    expect(p.changes).toContainEqual({ field: 'consumption_before_zone1_mwh', value: 11.7742 });
  });

  it('niepełny miesiąc źródłowy liczy średnią z rzeczywistych dni', () => {
    const entries = [entry('1', '2025-01-01', '2025-01-15', 1000)]; // 15 dni, 1 MWh
    const p = planYearSimulation(row({ consumption_before_zone1_mwh: 1 }), settlement(entries), [], YEAR);
    expect(p.errors).toEqual([]);
    // 1/15 × 350 dni = 23,3333
    expect(p.estimates[0].value).toBe(23.3333);
    expect(p.changes).toContainEqual({ field: 'consumption_before_zone1_mwh', value: 24.3333 });
  });

  it('niewliczane rozliczenia (duplikat/korekta) nie zwiększają podstawy', () => {
    const entries = [...janMay(), entry('6', '2025-05-01', '2025-05-31', 99000, true, false)];
    const s = settlement(entries);
    s.zoneSummaries[0].mwh = 5;
    const p = planYearSimulation(row(), s, [], YEAR);
    expect(p.errors).toEqual([]);
    expect(p.estimates[0].value).toBe(7.0861);
  });

  it('różne zużycie PRZED i PO: ostrzeżenie, PO bez zmian', () => {
    const p = planYearSimulation(row({ consumption_after_zone1_mwh: 4 }), settlement(janMay()), [], YEAR);
    expect(p.errors).toEqual([]);
    expect(p.changes.some(c => c.field.startsWith('consumption_after_'))).toBe(false);
    expect(p.warnings.some(w => w.includes('PO (4 MWh)') && w.includes('12,0861') || w.includes('PO (4 MWh)'))).toBe(true);
  });

  it('zużycie w formularzu różne od sumy faktur → błąd, bez zmian', () => {
    const p = planYearSimulation(row({ consumption_before_zone1_mwh: 9 }), settlement(janMay()), [], YEAR);
    expect(p.errors[0]).toContain('różni się od sumy faktur');
    expect(p.changes).toEqual([]);
    expect(p.estimates).toEqual([]);
  });

  it('aktywny szacunek z wcześniejszej luki jest uwzględniony w podstawie', () => {
    const p = planYearSimulation(row({ consumption_before_zone1_mwh: 6 }), settlement(janMay()), [
      { id: 'e1', field: 'consumption_before_zone1_mwh', period_from: '2025-03-01', period_to: '2025-03-31', value: 1 },
    ], YEAR);
    expect(p.errors).toEqual([]);
    expect(p.changes).toContainEqual({ field: 'consumption_before_zone1_mwh', value: 13.0861 });
  });

  it('niepełne zużycie strefy z faktur → błąd', () => {
    const s = settlement(janMay()); s.zoneSummaries[0].incomplete = true;
    expect(planYearSimulation(row(), s, [], YEAR).errors[0]).toContain('niepełne');
  });

  it('pełne pokrycie docelowego okresu → błąd', () => {
    const entries = [entry('1', '2025-01-01', '2025-06-30', 1000), entry('2', '2025-07-01', '2025-12-31', 1000)];
    expect(planYearSimulation(row({ consumption_before_zone1_mwh: 2, period_to: '2025-12-31' }), settlement(entries), [], YEAR).errors[0]).toContain('w pełni pokryty');
  });

  it('opłata mocowa tylko na jawną zgodę i tylko gdy pole równa się sumie z faktur', () => {
    const s = settlement(janMay(), {
      costs: [{ kind: 'capacity', label: 'Opłata mocowa', total: 500, missingAmounts: 0, components: janMay().map(e => ({ docId: 'd', docName: 'f.pdf', recordId: e.record.id, period_from: e.record.period_from, period_to: e.record.period_to, label: 'Opłata mocowa', value: 100, unit: 'zł' })) }],
    });
    // bez zgody: brak zmiany kosztu, pozycja na liście nierozstrzygniętych
    const noCost = planYearSimulation(row({ capacity_charge_before: 500 }), s, [], YEAR);
    expect(noCost.changes.some(c => c.field === 'capacity_charge_before')).toBe(false);
    expect(noCost.unresolved.some(u => u.includes('Opłata mocowa PRZED'))).toBe(true);
    // ze zgodą: 500 zł / 151 dni × 214 dni = 708,61 zł; razem 1208,61 zł
    const withCost = planYearSimulation(row({ capacity_charge_before: 500 }), s, [], YEAR, 'mocowa');
    expect(withCost.errors).toEqual([]);
    expect(withCost.changes).toContainEqual({ field: 'capacity_charge_before', value: 1208.61 });
    expect(withCost.preview!.koszty[0]).toMatchObject({ skladnik: 'Opłata mocowa PRZED', rzeczywiste_zl: 500, szacunek_zl: 708.61, razem_zl: 1208.61 });
    // wartość ręczna różna od sumy faktur → nie zmienia
    const manual = planYearSimulation(row({ capacity_charge_before: 777 }), s, [], YEAR, 'mocowa');
    expect(manual.changes.some(c => c.field === 'capacity_charge_before')).toBe(false);
    expect(manual.unresolved.some(u => u.includes('nie jest sumą z faktur'))).toBe(true);
  });

  it('brak kosztu PO przy opłacie mocowej PRZED → nierozstrzygnięte, bez kopiowania do PO', () => {
    const p = planYearSimulation(row({ capacity_charge_before: 500, capacity_charge_after: 0 }), settlement(janMay()), [], YEAR);
    expect(p.unresolved.some(u => u.includes('Opłata mocowa PO wynosi zero'))).toBe(true);
    expect(p.changes.some(c => c.field === 'capacity_charge_after')).toBe(false);
  });

  it('Pmax powyżej mocy PO → ostrzeżenie ze źródłem pomiaru', () => {
    const s = settlement(janMay(), { pmax: { kw: 250, period_from: '2025-02-01', period_to: '2025-02-28' } });
    const p = planYearSimulation(row({ contracted_power_after_kw: 200 }), s, [], YEAR);
    expect(p.warnings.some(w => w.includes('250 kW') && w.includes('200 kW'))).toBe(true);
  });

  it('suma pozostałych opłat i opłaty jednorazowe → nierozstrzygnięte, nieekstrapolowane', () => {
    const p = planYearSimulation(row({ fixed_distribution_before_total: 300 }), settlement(janMay()), [], YEAR);
    expect(p.unresolved.some(u => u.includes('Suma pozostałych opłat'))).toBe(true);
    expect(p.unresolved.some(u => u.includes('jednorazowe'))).toBe(true);
    expect(p.changes.some(c => c.field === 'fixed_distribution_before_total')).toBe(false);
  });

  it('zmiana taryfy w okresie źródłowym blokuje symulację', () => {
    const s = settlement(janMay(), { blocked: ['Taryfa zmienia się w okresie rozliczeń.'] });
    expect(planYearSimulation(row(), s, [], YEAR).errors).toContain('Taryfa zmienia się w okresie rozliczeń.');
  });
});
