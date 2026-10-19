// Ponowna edycja zatwierdzonego importu faktury: przeliczenie wkładu dokumentu bez dublowania
// i bez cichego cofania późniejszych ręcznych zmian. Czyste funkcje (testowane jednostkowo).

export interface AppliedFieldSnapshot {
  /** Wartość pola przed pierwszym zastosowaniem tego dokumentu. */
  before: unknown;
  /** Źródło (value_sources) pola przed pierwszym zastosowaniem. */
  beforeSource?: unknown;
  /** Wartość zapisana przez ten dokument. */
  after: unknown;
}

/** Zapisany stan podglądu jednego rekordu PPE (wybory + migawka zastosowanych wartości). */
export interface ReviewState {
  version: 1;
  choice?: string;
  selectedFields?: string[];
  lineOverrides?: Record<string, string | null>;
  lineSelected?: string[];
  otherMode?: 'replace' | 'add' | null;
  osdChoice?: string;
  osdApply?: boolean;
  tariffChoice?: string | null;
  periodAck?: boolean;
  applied?: Record<string, AppliedFieldSnapshot>;
}

export const sameValue = (a: unknown, b: unknown): boolean => {
  const na = a === undefined || a === '' ? null : a;
  const nb = b === undefined || b === '' ? null : b;
  if (na == null || nb == null) return na == null && nb == null;
  const x = Number(na), y = Number(nb);
  if (typeof na !== 'boolean' && typeof nb !== 'boolean' && Number.isFinite(x) && Number.isFinite(y) && String(na).trim() !== '' && String(nb).trim() !== '') {
    return Math.abs(x - y) < 1e-9;
  }
  return String(na) === String(nb);
};

export interface ManualChange {
  field: string;
  /** Wartość zapisana wcześniej przez ten dokument. */
  applied: unknown;
  /** Obecna wartość w kalkulatorze (zmieniona ręcznie). */
  current: unknown;
  /** Nowa wartość z faktury; undefined = pozycja odznaczona (dokument przestaje zasilać pole). */
  incoming: unknown;
}

export interface ReapplyPlan {
  write: Record<string, unknown>;
  /** Pola przywracane do wartości sprzed importu (odznaczone). */
  restored: string[];
  /** Pola zmienione ręcznie po imporcie — wymagają decyzji (domyślnie zostają bez zmian). */
  manual: ManualChange[];
  applied: Record<string, AppliedFieldSnapshot>;
}

/**
 * desired: wartości, które dokument ma teraz zasilać (wg bieżącego wyboru).
 * additive: pola sumowane (wkład liczony względem bieżącej wartości) — nie przywracane, nie blokowane.
 * replaceManual: pola, dla których użytkownik zgodził się zastąpić ręczną zmianę.
 */
export function planReapply(args: {
  desired: Record<string, unknown>;
  current: Record<string, unknown>;
  currentSources?: Record<string, unknown>;
  previous: Record<string, AppliedFieldSnapshot> | null | undefined;
  additive?: string[];
  replaceManual?: Set<string>;
}): ReapplyPlan {
  const prev = args.previous || {};
  const additive = new Set(args.additive || []);
  const replace = args.replaceManual || new Set<string>();
  const write: Record<string, unknown> = {};
  const restored: string[] = [];
  const manual: ManualChange[] = [];
  const applied: Record<string, AppliedFieldSnapshot> = {};

  for (const [f, val] of Object.entries(args.desired)) {
    const p = prev[f];
    const cur = args.current[f];
    if (p && !additive.has(f) && !sameValue(cur, p.after) && !replace.has(f)) {
      if (!sameValue(cur, val)) manual.push({ field: f, applied: p.after, current: cur, incoming: val });
      continue;
    }
    write[f] = val;
    applied[f] = p ? { before: p.before, beforeSource: p.beforeSource, after: val } : { before: cur ?? null, beforeSource: args.currentSources?.[f], after: val };
  }
  for (const [f, p] of Object.entries(prev)) {
    if (f in args.desired) continue;
    const cur = args.current[f];
    if (additive.has(f)) continue; // sumy przelicza wywołujący (wkład dokumentu = 0)
    if (sameValue(cur, p.after) || replace.has(f)) {
      write[f] = p.before ?? null;
      restored.push(f);
    } else {
      manual.push({ field: f, applied: p.after, current: cur, incoming: undefined });
    }
  }
  return { write, restored, manual, applied };
}
