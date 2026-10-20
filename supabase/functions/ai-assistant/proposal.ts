// Closed list of PO changes the assistant may propose. Pure module: used by the
// ai-assistant edge function and by unit tests in src/lib.

export type ProposalField =
  | 'active_energy_price_after_zone1' | 'active_energy_price_after_zone2' | 'active_energy_price_after_zone3'
  | 'contracted_power_after_kw' | 'handling_fee_after' | 'capacity_charge_after'
  | 'reactive_energy_cost_after' | 'fixed_distribution_after_total';

export const PROPOSAL_FIELDS: Record<ProposalField, { label: string; unit: string; max: number }> = {
  active_energy_price_after_zone1: { label: 'Cena energii czynnej PO – strefa 1', unit: 'zł/MWh', max: 5000 },
  active_energy_price_after_zone2: { label: 'Cena energii czynnej PO – strefa 2', unit: 'zł/MWh', max: 5000 },
  active_energy_price_after_zone3: { label: 'Cena energii czynnej PO – strefa 3', unit: 'zł/MWh', max: 5000 },
  contracted_power_after_kw: { label: 'Moc umowna PO', unit: 'kW', max: 100000 },
  handling_fee_after: { label: 'Opłata handlowa PO', unit: 'zł/miesiąc', max: 100000 },
  capacity_charge_after: { label: 'Opłata mocowa PO', unit: 'zł za okres analizy', max: 100000000 },
  reactive_energy_cost_after: { label: 'Koszt energii biernej PO', unit: 'zł za okres analizy', max: 100000000 },
  fixed_distribution_after_total: { label: 'Suma pozostałych opłat PO', unit: 'zł za okres analizy', max: 100000000 },
};

export const PROPOSAL_FIELD_NAMES = Object.keys(PROPOSAL_FIELDS) as ProposalField[];
export const PROPOSAL_SOURCES = ['polecenie_uzytkownika', 'dane_analizy', 'zalozenie'] as const;
export type ProposalSource = typeof PROPOSAL_SOURCES[number];
export const PROPOSAL_SOURCE_LABELS: Record<ProposalSource, string> = {
  polecenie_uzytkownika: 'wartość podana przez użytkownika',
  dane_analizy: 'wartość z danych analizy',
  zalozenie: 'jawne założenie',
};

export interface ProposalInput { changes: { field: string; value: number }[]; source: string; assumption: string | null }
export interface ValidProposal { changes: { field: ProposalField; value: number }[]; before: Record<string, unknown>; source: ProposalSource; assumption: string | null; isSimulation: boolean }

export function validateProposal(input: ProposalInput, row: Record<string, unknown>): { ok: true; proposal: ValidProposal } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const zones = Number(row.zones_count_after) || 1;
  const seen = new Set<string>();
  const changes: ValidProposal['changes'] = [];
  if (!Array.isArray(input.changes) || input.changes.length === 0) errors.push('Brak zmian w propozycji.');
  if (input.changes?.length > PROPOSAL_FIELD_NAMES.length) errors.push('Zbyt wiele zmian w jednej propozycji.');
  if (!(PROPOSAL_SOURCES as readonly string[]).includes(input.source)) errors.push('Nieznane źródło wartości.');
  if (input.source === 'zalozenie' && !input.assumption?.trim()) errors.push('Założenie musi być opisane.');
  for (const c of input.changes ?? []) {
    const meta = PROPOSAL_FIELDS[c.field as ProposalField];
    if (!meta) { errors.push(`Pole „${c.field}” nie może być zmieniane przez asystenta.`); continue; }
    if (seen.has(c.field)) { errors.push(`Pole „${meta.label}” występuje dwa razy.`); continue; }
    seen.add(c.field);
    const v = Number(c.value);
    if (typeof c.value !== 'number' || !Number.isFinite(v)) { errors.push(`${meta.label}: wartość nie jest liczbą.`); continue; }
    if (v < 0 || v > meta.max) { errors.push(`${meta.label}: wartość poza dopuszczalnym zakresem (0–${meta.max} ${meta.unit}).`); continue; }
    const zone = /zone(\d)$/.exec(c.field)?.[1];
    if (zone && Number(zone) > zones) { errors.push(`${meta.label}: taryfa PO ma tylko ${zones} stref(y).`); continue; }
    if (c.field === 'contracted_power_after_kw' && v <= 0) { errors.push('Moc umowna PO musi być większa od zera.'); continue; }
    if (c.field === 'reactive_energy_cost_after' && row.reactive_monthly_mode_after) { errors.push('Energia bierna PO jest wpisywana miesięcznie — zmień ją ręcznie w formularzu.'); continue; }
    if (Number(row[c.field] ?? NaN) === v) { errors.push(`${meta.label}: wartość jest już ustawiona.`); continue; }
    changes.push({ field: c.field as ProposalField, value: Math.round(v * 1e6) / 1e6 });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, proposal: {
    changes, before: Object.fromEntries(changes.map(c => [c.field, row[c.field] ?? null])),
    source: input.source as ProposalSource, assumption: input.assumption?.trim().slice(0, 500) || null,
    isSimulation: changes.some(c => c.field === 'contracted_power_after_kw'),
  } };
}

/** Numbers written by the user ("500", "0,62", "1 200,5"). */
export function numbersInText(text: string): number[] {
  return (text.match(/\d[\d\s\u00a0]*(?:[.,]\d+)?/g) ?? [])
    .map(s => Number(s.replace(/[\s\u00a0]/g, '').replace(',', '.'))).filter(Number.isFinite);
}

const IMPERATIVE = /(^|\s)(ustaw|zmień|zmien|wpisz|zapisz|popraw|podmień|zastąp|zastap|daj|wstaw|uzupełnij|uzupelnij|oszacuj)(\s|$|[,.:])/i;
const QUESTION = /\?\s*$|\b(co da|co by|jak by|ile by|dlaczego|czy)\b/i;

/** Imperative, not a question/simulation. */
export function isCommand(message: string): boolean {
  return IMPERATIVE.test(message) && !QUESTION.test(message);
}

/**
 * Server-side check that a PO "command" may be saved without another confirmation. Returns a reason when not.
 * - polecenie_uzytkownika: every value literally given in the message;
 * - dane_analizy: every value equals a value already present in the analysis (e.g. "ustaw cenę PO jak PRZED");
 * - zalozenie: never saved without acceptance.
 */
export function commandGuard(message: string, changes: { field?: string; value: number }[], source: string, row?: Record<string, unknown> | null): string | null {
  if (!isCommand(message)) return QUESTION.test(message) ? 'pytanie lub symulacja' : 'brak polecenia';
  if (source === 'polecenie_uzytkownika') {
    const nums = numbersInText(message);
    return changes.every(c => nums.some(n => Math.abs(n - c.value) < 1e-9)) ? null : 'wartości nie podane w poleceniu';
  }
  if (source === 'dane_analizy' && row) {
    const known = Object.entries(row).filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))));
    return changes.every(c => known.some(([k, v]) => k !== c.field && Math.abs(Number(v) - c.value) < 1e-9)) ? null : 'wartości nie wynikają z danych analizy';
  }
  return 'wartość jest założeniem — wymaga akceptacji';
}

/** Explicit acceptance of a proposal in chat. */
export function isAcceptance(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (m.includes('?') || /\b(nie|anuluj|odrzuć|odrzuc)\b/.test(m)) return false;
  return /\b(zastosuj|zatwierdzam|zatwierdź|zatwierdz|akceptuję|akceptuje|tak,? (zapisz|zastosuj|wprowadź|wprowadz)|wprowadź|wprowadz)\b/.test(m);
}

export interface PendingProposal { id: string; analysis_id: string; base_updated_at: string; created_at: string; kind?: string | null }

/**
 * Which proposal an acceptance refers to: only pending, current-version proposals of this PPE shown in this conversation.
 * Several candidates without an explicit id → ask; never pick "the latest" from another context.
 */
export function pickAcceptance(cands: PendingProposal[], ppeId: string, rowUpdatedAt: string, shownIds: string[], explicitId?: string | null):
  { ok: true; id: string } | { ok: false; reason: 'none' | 'ambiguous' | 'unknown'; ids: string[] } {
  const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  const valid = cands.filter(c => c.analysis_id === ppeId && same(c.base_updated_at, rowUpdatedAt) && shownIds.includes(c.id));
  if (explicitId) return valid.some(c => c.id === explicitId) ? { ok: true, id: explicitId } : { ok: false, reason: 'unknown', ids: valid.map(c => c.id) };
  if (valid.length === 1) return { ok: true, id: valid[0].id };
  return { ok: false, reason: valid.length ? 'ambiguous' : 'none', ids: valid.map(c => c.id) };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KIND_FIELDS: Record<string, RegExp> = {
  period: /^period_(from|to)$/,
  estimate: /^(consumption_(before|after)_zone[123]_mwh|capacity_charge_before|reactive_energy_cost_before)$/,
  estimate_replace: /^(consumption_(before|after)_zone[123]_mwh|capacity_charge_before|reactive_energy_cost_before)$/,
};

/** Validates app-computed changes (period/estimates) before they are stored as a proposal. */
export function validateAppChanges(kind: string, changes: { field: string; value: unknown }[]): string[] {
  const re = KIND_FIELDS[kind];
  if (!re) return ['Nieznany rodzaj operacji.'];
  if (!changes.length) return ['Brak zmian do zapisania.'];
  const errs: string[] = [];
  for (const c of changes) {
    if (!re.test(c.field)) errs.push(`Pole „${c.field}” jest niedozwolone dla tej operacji.`);
    else if (kind === 'period' ? !(typeof c.value === 'string' && ISO.test(c.value)) : !(typeof c.value === 'number' && Number.isFinite(c.value) && c.value >= 0 && c.value < 1e9)) errs.push(`Nieprawidłowa wartość pola „${c.field}”.`);
  }
  if (kind === 'period') {
    const f = changes.find(c => c.field === 'period_from')?.value as string | undefined, t = changes.find(c => c.field === 'period_to')?.value as string | undefined;
    if (!f || !t || f > t) errs.push('Nieprawidłowy okres.');
  }
  return errs;
}
