import { describe, it, expect } from 'vitest';
import { commandGuard, isAcceptance, numbersInText } from '../../supabase/functions/ai-assistant/proposal';

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
});
