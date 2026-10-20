import { describe, it, expect } from 'vitest';
import { commandGuard, isAcceptance, numbersInText, pickAcceptance, validateAppChanges, isCommand } from '../../supabase/functions/ai-assistant/proposal';

describe('chat command guard', () => {
  it('explicit command with the value saves', () => {
    expect(commandGuard('Ustaw cenę PO na 500 zł/MWh w strefie 1', [{ value: 500 }], 'polecenie_uzytkownika')).toBeNull();
  });
  it('question never saves', () => {
    expect(commandGuard('Dlaczego okres wynosi miesiąc?', [{ value: 500 }], 'polecenie_uzytkownika')).not.toBeNull();
  });
  it('simulation never saves', () => {
    expect(commandGuard('Co da cena 500 zł/MWh?', [{ value: 500 }], 'polecenie_uzytkownika')).not.toBeNull();
  });
  it('value chosen by the model is not a command', () => {
    expect(commandGuard('Ustaw lepszą cenę PO', [{ value: 450 }], 'polecenie_uzytkownika')).not.toBeNull();
    expect(commandGuard('Ustaw cenę 500', [{ value: 500 }], 'zalozenie')).not.toBeNull();
  });
  it('reads Polish decimals', () => {
    expect(numbersInText('wpisz 0,62 i 1 200,5')).toEqual([0.62, 1200.5]);
  });
  it('acceptance in chat', () => {
    expect(isAcceptance('Tak, zastosuj')).toBe(true);
    expect(isAcceptance('Nie zastosuj')).toBe(false);
    expect(isAcceptance('Czy zastosować?')).toBe(false);
  });
  it('value from analysis data saves when the command points to it', () => {
    const row = { active_energy_price_before_zone1: 480, active_energy_price_after_zone1: 600 };
    expect(commandGuard('Ustaw cenę PO strefy 1 taką jak PRZED', [{ field: 'active_energy_price_after_zone1', value: 480 }], 'dane_analizy', row)).toBeNull();
    expect(commandGuard('Ustaw cenę PO strefy 1 taką jak PRZED', [{ field: 'active_energy_price_after_zone1', value: 455 }], 'dane_analizy', row)).not.toBeNull();
  });
  it('"uzupełnij" is a command, a question is not', () => {
    expect(isCommand('Uzupełnij zużycie sierpnia średnim dobowym zużyciem z lipca i września')).toBe(true);
    expect(isCommand('Czy uzupełnić sierpień?')).toBe(false);
  });
});

describe('acceptance target', () => {
  const t = '2025-11-01T10:00:00Z';
  const c = (id: string, ppe = 'p1', base = t) => ({ id, analysis_id: ppe, base_updated_at: base, created_at: t });
  it('one current proposal of this PPE shown in chat is accepted', () => {
    expect(pickAcceptance([c('a'), c('b', 'p2')], 'p1', t, ['a', 'b'])).toEqual({ ok: true, id: 'a' });
  });
  it('several candidates → ask which', () => {
    expect(pickAcceptance([c('a'), c('b')], 'p1', t, ['a', 'b'])).toMatchObject({ ok: false, reason: 'ambiguous' });
  });
  it('stale, other PPE or not shown in this conversation → none', () => {
    expect(pickAcceptance([c('a', 'p1', '2025-01-01T00:00:00Z'), c('b', 'p2'), c('x')], 'p1', t, ['a', 'b'])).toMatchObject({ ok: false, reason: 'none' });
  });
});

describe('app-computed changes', () => {
  it('period must be valid ISO dates in order', () => {
    expect(validateAppChanges('period', [{ field: 'period_from', value: '2025-07-01' }, { field: 'period_to', value: '2025-10-31' }])).toEqual([]);
    expect(validateAppChanges('period', [{ field: 'period_from', value: '2025-11-01' }, { field: 'period_to', value: '2025-10-31' }]).length).toBe(1);
  });
  it('estimates may not touch PO prices', () => {
    expect(validateAppChanges('estimate', [{ field: 'active_energy_price_after_zone1', value: 1 }]).length).toBe(1);
  });
});
