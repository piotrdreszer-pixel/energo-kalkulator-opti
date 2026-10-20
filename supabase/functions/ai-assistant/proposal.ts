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

const IMPERATIVE = /\b(ustaw|zmień|zmien|wpisz|zapisz|popraw|podmień|zastąp|zastap|daj|wstaw)\b/i;
const QUESTION = /\?\s*$|\b(co da|co by|jak by|ile by|dlaczego|czy)\b/i;

/** Server-side check that a "command" really is one: imperative, not a question, every value literally given by the user. Returns a reason when not. */
export function commandGuard(message: string, changes: { value: number }[], source: string): string | null {
  if (source !== 'polecenie_uzytkownika') return 'wartość nie pochodzi od użytkownika';
  if (!IMPERATIVE.test(message)) return 'brak polecenia';
  if (QUESTION.test(message)) return 'pytanie lub symulacja';
  const nums = numbersInText(message);
  if (!changes.every(c => nums.some(n => Math.abs(n - c.value) < 1e-9))) return 'wartości nie podane w poleceniu';
  return null;
}

/** Explicit acceptance of the latest proposal in chat. */
export function isAcceptance(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (m.includes('?') || /\b(nie|anuluj|odrzuć|odrzuc)\b/.test(m)) return false;
  return /\b(zastosuj|zatwierdzam|zatwierdź|zatwierdz|akceptuję|akceptuje|tak,? (zapisz|zastosuj|wprowadź|wprowadz)|wprowadź|wprowadz)\b/.test(m);
}
