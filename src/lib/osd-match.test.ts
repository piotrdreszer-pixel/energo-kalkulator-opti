import { describe, it, expect } from 'vitest';
import { matchOsd } from './osd-match';

const ops = [
  { id: 'pge', code: 'PGE', name: 'PGE Dystrybucja S.A.' },
  { id: 'tau', code: 'TAURON', name: 'TAURON Dystrybucja S.A.' },
  { id: 'enea', code: 'ENEA', name: 'ENEA Operator Sp. z o.o.' },
  { id: 'energa', code: 'ENERGA', name: 'ENERGA-OPERATOR S.A.' },
  { id: 'stoen', code: 'STOEN', name: 'Stoen Operator Sp. z o.o.' },
];

describe('matchOsd', () => {
  it('pełna nazwa operatora', () => expect(matchOsd('ENEA Operator Sp. z o.o.', ops)).toEqual({ osdId: 'enea', status: 'matched' }));
  it('warianty pisowni', () => {
    expect(matchOsd('Energa Operator SA', ops).osdId).toBe('energa');
    expect(matchOsd('TAURON Dystrybucja', ops).osdId).toBe('tau');
    expect(matchOsd('innogy Stoen Operator', ops).osdId).toBe('stoen');
  });
  it('sam sprzedawca nie jest operatorem', () => {
    expect(matchOsd('E.ON Polska', ops)).toEqual({ osdId: null, status: 'uncertain' });
    expect(matchOsd('PGE Obrót', ops).osdId).toBeNull();
  });
  it('brak operatora w bazie → brak dopasowania, nic nie tworzymy', () => {
    expect(matchOsd('PKP Energetyka', ops)).toEqual({ osdId: null, status: 'none' });
    expect(matchOsd(null, ops).status).toBe('none');
  });
});
