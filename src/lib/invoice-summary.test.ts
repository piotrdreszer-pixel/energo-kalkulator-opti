import { describe, it, expect } from 'vitest';
import { gapMessage, itemStatus, monthCoverage } from './invoice-summary';

describe('gapMessage', () => {
  it('brak sierpnia w roku → 11 z 12 miesięcy', () => {
    expect(gapMessage({ from: '2026-01-01', to: '2026-12-31' }, [{ from: '2026-08-01', to: '2026-08-31' }]))
      .toBe('Brakuje rozliczeń za sierpień 2026. Dane z faktur obejmują 11 z 12 miesięcy.');
  });
  it('brak luk → brak komunikatu', () => {
    expect(gapMessage({ from: '2026-07-01', to: '2026-10-31' }, [])).toBeNull();
  });
  it('luka krótsza niż miesiąc nie odejmuje miesiąca', () => {
    const c = monthCoverage({ from: '2026-07-01', to: '2026-10-31' }, [{ from: '2026-08-10', to: '2026-08-20' }]);
    expect(c.missing).toEqual([]);
    expect(c.months.length).toBe(4);
  });
});

describe('itemStatus', () => {
  it('konflikt ma pierwszeństwo, potem szacunek', () => {
    expect(itemStatus({ hasInvoiceValue: true, estimated: true, conflict: true })).toBe('wymaga decyzji');
    expect(itemStatus({ hasInvoiceValue: true, estimated: true, conflict: false })).toBe('szacunek');
    expect(itemStatus({ hasInvoiceValue: false, estimated: false, conflict: false })).toBe('brak danych');
  });
});
