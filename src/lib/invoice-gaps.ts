// Okres z faktur, luki i jawne szacunki brakujących okresów (czyste funkcje).
// Liczby liczy wyłącznie ten kod — model AI wybiera tylko operację.
// Szacunek zużycia nigdy nie potwierdza Pmax ani bezpiecznej mocy umownej.

import { mapConsumptionZones } from './invoice-import';
import { classifyItem } from './invoice-line-mapping';
import { toStored, type Interval, type Settlement, type SettlementEntry, type SettlementItem } from './invoice-settlement';
import { calculateEnergyCosts } from './calculation-utils';

const dayMs = 86400000;
const toDay = (s: string) => Math.round(Date.parse(s.slice(0, 10) + 'T00:00:00Z') / dayMs);
export const daysOf = (i: Interval) => toDay(i.to) - toDay(i.from) + 1;
export const METHOD_DAILY = 'srednia_dobowa_sasiednich_okresow';
export const METHOD_LABEL = 'średnie dobowe z sąsiednich rozliczeń × liczba dni luki';

export interface EstimateRow {
  field: string; period_from: string; period_to: string; value: number; base_value: number | null;
  unit: string; method: string; basis: { record_id: string; document: string; period_from: string; period_to: string; days: number; value: number }[];
}
export interface ActiveEstimate { id: string; field: string; period_from: string; period_to: string; value: number; base_value: number | null; unit: string }
export interface Plan { changes: { field: string; value: number }[]; estimates: EstimateRow[]; replace: string[]; errors: string[]; notes: string[] }

const empty = (): Plan => ({ changes: [], estimates: [], replace: [], errors: [], notes: [] });
const close = (a: unknown, b: number, field: string) => a != null && a !== '' && Math.abs(Number(a) - toStored(field, b)) < 1e-6;
const fmtD = (s: string) => s.split('-').reverse().join('.');

/** Okres objęty zatwierdzonymi rozliczeniami i luki w nim. */
export function invoicePeriod(s: Settlement) {
  return { period: s.proposedPeriod, gaps: s.gaps };
}

/** Rozliczenia bezpośrednio przed i po luce (wliczone, z okresem). */
export function neighbours(s: Settlement, gap: Interval, needConsumption: boolean): SettlementEntry[] {
  const ok = s.entries.filter(e => e.included && e.record.period_from && e.record.period_to && (!needConsumption || e.consumptionCounted));
  const before = ok.filter(e => toDay(e.record.period_to!) === toDay(gap.from) - 1);
  const after = ok.filter(e => toDay(e.record.period_from!) === toDay(gap.to) + 1);
  return [...before, ...after];
}

/** Szacunek zużycia luki osobno dla każdej strefy: Σ zużycia sąsiadów / Σ dni sąsiadów × dni luki. */
export function planConsumptionEstimate(row: Record<string, unknown>, s: Settlement, gap: Interval): Plan {
  const p = empty();
  if (s.blocked.length) { p.errors.push(...s.blocked); return p; }
  const zones = s.zones;
  if (!zones) { p.errors.push('Nie można ustalić stref z faktur.'); return p; }
  if (Number(row.zones_count_before) !== zones) { p.errors.push(`Taryfa PRZED ma ${row.zones_count_before} stref(y), a faktury ${zones} — strefy niezgodne.`); return p; }
  const nb = neighbours(s, gap, true);
  if (nb.length < 1) { p.errors.push('Brak rozliczeń bezpośrednio przed lub po luce — nie ma podstawy do szacunku.'); return p; }
  if (nb.length < 2) p.notes.push('Szacunek oparty tylko na jednym sąsiednim rozliczeniu.');
  const gapDays = daysOf(gap);
  const copyAfter = Number(row.zones_count_after) === zones && String(row.tariff_code_after || '').toUpperCase() === String(row.tariff_code_before || '').toUpperCase();
  for (let z = 1; z <= zones; z++) {
    const zs = s.zoneSummaries.find(x => x.zone === z);
    const field = `consumption_before_zone${z}_mwh`;
    if (!zs || zs.mwh == null || zs.incomplete) { p.errors.push(`Strefa ${z}: zużycie z faktur niepełne — brak podstawy.`); continue; }
    let sum = 0, days = 0; const basis: EstimateRow['basis'] = [];
    let missing = false;
    for (const e of nb) {
      const v = mapConsumptionZones(e.record.consumption, zones).values[z as 1 | 2 | 3];
      if (v == null) { missing = true; break; }
      const d = daysOf({ from: e.record.period_from!, to: e.record.period_to! });
      sum += v; days += d;
      basis.push({ record_id: e.record.id, document: e.doc.file_name, period_from: e.record.period_from!, period_to: e.record.period_to!, days: d, value: v });
    }
    if (missing || !days) { p.errors.push(`Strefa ${z}: sąsiednie faktury nie mają odczytu tej strefy — nie szacuję.`); continue; }
    const est = Math.round(sum / days * gapDays * 10000) / 10000;
    const base = toStored(field, zs.mwh);
    const cur = row[field];
    if (cur != null && cur !== '' && Number(cur) !== 0 && !close(cur, zs.mwh, field)) {
      p.errors.push(`Strefa ${z}: zużycie w formularzu (${cur} MWh) różni się od sumy zatwierdzonych faktur (${base} MWh) — najpierw zastosuj rozliczenie z faktur lub popraw zużycie ręcznie.`);
      continue;
    }
    const value = toStored(field, base + est);
    p.changes.push({ field, value });
    p.estimates.push({ field, period_from: gap.from, period_to: gap.to, value: est, base_value: base, unit: 'MWh', method: METHOD_DAILY, basis });
    const af = `consumption_after_zone${z}_mwh`;
    if (copyAfter && close(row[af], zs.mwh, af)) {
      p.changes.push({ field: af, value });
      p.estimates.push({ field: af, period_from: gap.from, period_to: gap.to, value: est, base_value: base, unit: 'MWh', method: METHOD_DAILY, basis });
    }
  }
  p.notes.push(`Szacunek ${fmtD(gap.from)}–${fmtD(gap.to)} (${gapDays} dni): ${METHOD_LABEL}. Nie potwierdza Pmax ani bezpiecznej mocy umownej.`);
  if (p.errors.length) { p.changes = []; p.estimates = []; }
  return p;
}

const COST_FIELDS: { kind: 'capacity' | 'reactive'; field: string; label: string }[] = [
  { kind: 'capacity', field: 'capacity_charge_before', label: 'Opłata mocowa PRZED' },
  { kind: 'reactive', field: 'reactive_energy_cost_before', label: 'Energia bierna PRZED' },
];

/** Szacunek kwot za okres (opłata mocowa, energia bierna) tą samą metodą dobową — tylko gdy pole równa się sumie z faktur. */
export function planCostEstimate(row: Record<string, unknown>, s: Settlement, items: SettlementItem[], gap: Interval): Plan {
  const p = empty();
  const nb = neighbours(s, gap, false);
  if (!nb.length) { p.errors.push('Brak rozliczeń bezpośrednio przed lub po luce — nie ma podstawy do szacunku kosztów.'); return p; }
  const gapDays = daysOf(gap);
  for (const cf of COST_FIELDS) {
    const cost = s.costs.find(c => c.kind === cf.kind);
    if (!cost || !cost.components.length) continue;
    if (cost.missingAmounts) { p.notes.push(`${cf.label}: część pozycji bez kwoty — nie szacuję.`); continue; }
    if (cf.kind === 'reactive' && row.reactive_monthly_mode_before) { p.notes.push(`${cf.label}: tryb miesięczny — uzupełnij ręcznie.`); continue; }
    if (!close(row[cf.field], cost.total, cf.field)) { p.notes.push(`${cf.label}: wartość w formularzu nie jest sumą z faktur — nie zmieniam.`); continue; }
    let sum = 0, days = 0; const basis: EstimateRow['basis'] = [];
    for (const e of nb) {
      const v = cost.components.filter(c => c.recordId === e.record.id).reduce((a, c) => a + Number(c.value || 0), 0);
      const d = daysOf({ from: e.record.period_from!, to: e.record.period_to! });
      sum += v; days += d;
      basis.push({ record_id: e.record.id, document: e.doc.file_name, period_from: e.record.period_from!, period_to: e.record.period_to!, days: d, value: v });
    }
    if (!days) continue;
    const est = Math.round(sum / days * gapDays * 100) / 100;
    p.changes.push({ field: cf.field, value: toStored(cf.field, cost.total + est) });
    p.estimates.push({ field: cf.field, period_from: gap.from, period_to: gap.to, value: est, base_value: toStored(cf.field, cost.total), unit: 'zł', method: METHOD_DAILY, basis });
  }
  void items; void classifyItem;
  if (!p.changes.length && !p.notes.length) p.notes.push('Brak kosztów z faktur, które można oszacować tą metodą.');
  p.notes.push('Koszty liczone ze stawek (energia czynna, składnik zmienny) przeliczają się automatycznie z zużycia. „Suma pozostałych opłat” i opłata handlowa nie są szacowane automatycznie.');
  return p;
}

/** Zastąpienie aktywnych szacunków danymi z faktur, gdy luka jest już pokryta — bez podwójnego liczenia (nowa wartość = suma z faktur). */
export function planReplaceEstimates(row: Record<string, unknown>, s: Settlement, active: ActiveEstimate[]): Plan {
  const p = empty();
  for (const a of active) {
    const covered = !s.gaps.some(g => toDay(g.from) <= toDay(a.period_to) && toDay(a.period_from) <= toDay(g.to)) &&
      s.entries.some(e => e.included && e.record.period_from && e.record.period_to && toDay(e.record.period_from) <= toDay(a.period_from) && toDay(a.period_to) <= toDay(e.record.period_to));
    if (!covered) continue;
    const zone = /zone(\d)_mwh$/.exec(a.field)?.[1];
    let actual: number | null = null;
    if (zone) { const zs = s.zoneSummaries.find(x => x.zone === Number(zone)); actual = zs && !zs.incomplete ? zs.mwh : null; }
    else { const c = s.costs.find(x => x.kind === (a.field === 'capacity_charge_before' ? 'capacity' : 'reactive')); actual = c && !c.missingAmounts ? c.total : null; }
    if (actual == null) { p.errors.push(`${a.field}: dane z faktur niepełne — szacunek pozostaje.`); continue; }
    const expected = Number(a.base_value ?? 0) + Number(a.value);
    if (!close(row[a.field], expected, a.field)) { p.errors.push(`${a.field}: wartość zmieniono po zapisie szacunku — nie nadpisuję, popraw ręcznie.`); continue; }
    p.changes.push({ field: a.field, value: toStored(a.field, actual) });
    p.replace.push(a.id);
  }
  if (!p.replace.length && !p.errors.length) p.notes.push('Żaden szacunek nie jest jeszcze pokryty zatwierdzoną fakturą.');
  return p;
}

const PO_PAIRS: [keyof ReturnType<typeof calculateEnergyCosts>, keyof ReturnType<typeof calculateEnergyCosts>, string][] = [
  ['activeEnergyCostBefore', 'activeEnergyCostAfter', 'energia czynna'],
  ['distributionCostBefore', 'distributionCostAfter', 'dystrybucja'],
  ['handlingFeeBefore', 'handlingFeeAfter', 'opłata handlowa'],
  ['contractedPowerChargeBefore', 'contractedPowerChargeAfter', 'opłata za moc umowną'],
  ['capacityChargeBefore', 'capacityChargeAfter', 'opłata mocowa'],
  ['reactiveEnergyCostBefore', 'reactiveEnergyCostAfter', 'energia bierna'],
];

/** Składniki, które mają koszt w PRZED, a w PO są zerowe/puste — wtedy oszczędność jest pozorna (wariant PO niepełny). */
export function incompletePo(row: Record<string, unknown>): string[] {
  const r = calculateEnergyCosts(row as never);
  const excluded = (row.report_excluded_components as string[] | null) ?? [];
  const keyOf: Record<string, string> = { 'energia czynna': 'activeEnergy', dystrybucja: 'distribution', 'opłata handlowa': 'handling', 'opłata za moc umowną': 'contractedPower', 'opłata mocowa': 'capacity', 'energia bierna': 'reactive' };
  return PO_PAIRS.filter(([b, a, l]) => !excluded.includes(keyOf[l]) && Number(r[b]) > 0 && !Number(r[a])).map(([, , l]) => l);
}

export const ESTIMATE_FIELD_LABELS: Record<string, string> = {
  consumption_before_zone1_mwh: 'Zużycie PRZED – strefa 1', consumption_before_zone2_mwh: 'Zużycie PRZED – strefa 2', consumption_before_zone3_mwh: 'Zużycie PRZED – strefa 3',
  consumption_after_zone1_mwh: 'Zużycie PO – strefa 1', consumption_after_zone2_mwh: 'Zużycie PO – strefa 2', consumption_after_zone3_mwh: 'Zużycie PO – strefa 3',
  capacity_charge_before: 'Opłata mocowa PRZED', reactive_energy_cost_before: 'Energia bierna PRZED',
  period_from: 'Okres analizy od', period_to: 'Okres analizy do',
};
