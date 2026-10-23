// Podsumowanie danych z faktur — czyste funkcje (komunikaty o lukach, statusy pozycji).
import type { Interval } from './invoice-settlement';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));

/** Miesiące okresu (YYYY-MM) i te, których żaden dzień nie jest pokryty rozliczeniem (całe w luce). */
export function monthCoverage(period: Interval, gaps: Interval[]) {
  const months: string[] = [];
  let y = +period.from.slice(0, 4), m = +period.from.slice(5, 7);
  const endKey = period.to.slice(0, 7);
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push(key);
    if (key === endKey) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  const missing = months.filter((k) => {
    const first = `${k}-01`;
    const yy = +k.slice(0, 4), mm = +k.slice(5, 7);
    const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    const from = first < period.from ? period.from : first;
    const to = last > period.to ? period.to : last;
    return gaps.some((g) => day(g.from) <= day(from) && day(g.to) >= day(to));
  });
  return { months, missing };
}

export const monthName = (key: string) => MONTHS[+key.slice(5, 7) - 1] + ` ${key.slice(0, 4)}`;

/** Np. „Brakuje rozliczeń za sierpień 2026. Dane z faktur obejmują 11 z 12 miesięcy.” */
export function gapMessage(period: Interval | null, gaps: Interval[]): string | null {
  if (!period || !gaps.length) return null;
  const { months, missing } = monthCoverage(period, gaps);
  const days = gaps.map((g) => `${g.from} – ${g.to}`).join(', ');
  if (!missing.length) return `Brakuje rozliczeń za część okresu: ${days}.`;
  return `Brakuje rozliczeń za ${missing.map(monthName).join(', ')}. Dane z faktur obejmują ${months.length - missing.length} z ${months.length} miesięcy.`;
}

export type ItemStatus = 'z faktur' | 'szacunek' | 'wymaga decyzji' | 'brak danych';

/** Status pozycji podsumowania. Ręczna wartość różna od propozycji wymaga decyzji; brak propozycji = brak danych. */
export function itemStatus(opts: { hasInvoiceValue: boolean; estimated: boolean; conflict: boolean }): ItemStatus {
  if (opts.conflict) return 'wymaga decyzji';
  if (opts.estimated) return 'szacunek';
  if (opts.hasInvoiceValue) return 'z faktur';
  return 'brak danych';
}
