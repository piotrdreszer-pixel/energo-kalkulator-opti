// Symulacja rozszerzenia okresu analizy (np. pełny rok) — czyste funkcje.
// Liczby liczy wyłącznie ten kod — model AI wybiera tylko operację i zakres dat.
// Metoda: średnia dobowa z zatwierdzonego okresu × liczba brakujących dni.
// To uproszczenie z założeniem braku zmian sezonowych — NIE prognoza sezonowa.
// Szacunek zużycia nigdy nie potwierdza Pmax ani bezpiecznej mocy umownej.
// Zmienia wyłącznie okres i PRZED; PO nigdy nie jest modyfikowane.

import { toStored, type Interval, type Settlement } from './invoice-settlement.ts';
import { mapConsumptionZones } from './invoice-import.ts';

const dayMs = 86400000;
const toDay = (s: string) => Math.round(Date.parse(s.slice(0, 10) + 'T00:00:00Z') / dayMs);
const fromDay = (d: number) => new Date(d * dayMs).toISOString().slice(0, 10);
const daysOf = (i: Interval) => toDay(i.to) - toDay(i.from) + 1;
const fmtD = (s: string) => s.split('-').reverse().join('.');

export const METHOD_YEAR = 'srednia_dobowa_zatwierdzonego_okresu';
export const METHOD_YEAR_LABEL = 'średnia dobowa z zatwierdzonego okresu × liczba brakujących dni';

export interface SimEstimate {
  field: string; period_from: string; period_to: string; value: number; base_value: number | null;
  unit: string; method: string;
  basis: { record_id: string; document: string; period_from: string; period_to: string; days: number; value: number }[];
}
export interface YearSimPlan {
  changes: { field: string; value: number | string }[];
  estimates: SimEstimate[];
  errors: string[]; notes: string[]; warnings: string[]; unresolved: string[];
  /** Moc umowna: historia z faktur i pytanie o założenie dla brakujących miesięcy (null = brak pytania). */
  power: {
    historia: { kw: number; od: string; do: string }[];
    formularz_kw: number | null;
    ostatnia_znana_kw: number | null;
    pytanie: string | null;
  } | null;
  preview: {
    okres_docelowy: { od: string; do: string; dni: number };
    dane_rzeczywiste: { od: string; do: string; dni: number };
    brakujace_okresy: { od: string; do: string; dni: number }[];
    strefy: { strefa: number; rzeczywiste_mwh: number; szacunek_mwh: number; razem_mwh: number; dni_danych: number }[];
    koszty: { skladnik: string; rzeczywiste_zl: number; szacunek_zl: number; razem_zl: number }[];
  } | null;
}

/** Części docelowego okresu nieobjęte żadnym zatwierdzonym rozliczeniem (luki wewnątrz i przedłużenia przed/po). */
export function missingWithin(target: Interval, covered: Interval[]): Interval[] {
  const end = toDay(target.to);
  let cursor = toDay(target.from);
  const out: Interval[] = [];
  for (const iv of [...covered].sort((a, b) => a.from.localeCompare(b.from))) {
    const s = toDay(iv.from), t = toDay(iv.to);
    if (t < cursor || s > end) continue;
    if (s > cursor) out.push({ from: fromDay(cursor), to: fromDay(Math.min(s - 1, end)) });
    cursor = Math.max(cursor, t + 1);
    if (cursor > end) break;
  }
  if (cursor <= end) out.push({ from: fromDay(cursor), to: fromDay(end) });
  return out;
}

/** Podział okresu na miesiące kalendarzowe — późniejsza faktura zastępuje tylko swoje miesiące, bez podwójnego liczenia. */
export function splitMonths(i: Interval): Interval[] {
  const out: Interval[] = [];
  let cur = i.from;
  while (cur <= i.to) {
    const [y, m] = cur.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const to = last < i.to ? last : i.to;
    out.push({ from: cur, to });
    cur = fromDay(toDay(to) + 1);
  }
  return out;
}

const COSTS: Record<'mocowa' | 'bierna', { kind: 'capacity' | 'reactive'; field: string; label: string }> = {
  mocowa: { kind: 'capacity', field: 'capacity_charge_before', label: 'Opłata mocowa PRZED' },
  bierna: { kind: 'reactive', field: 'reactive_energy_cost_before', label: 'Energia bierna PRZED' },
};

/**
 * Plan symulacji pełnego okresu: okres + zużycie PRZED (wszystkie brakujące części naraz),
 * opcjonalnie JEDEN koszt za okres (osobna zgoda). PO pozostaje nietknięte.
 */
export function planYearSimulation(
  row: Record<string, unknown>,
  s: Settlement,
  activeEstimates: { id: string; field: string; period_from: string; period_to: string; value: number }[],
  target: Interval,
  cost: 'mocowa' | 'bierna' | null = null,
  powerAssumption: number | null = null,
): YearSimPlan {
  const p: YearSimPlan = { changes: [], estimates: [], errors: [], notes: [], warnings: [], unresolved: [], power: null, preview: null };
  if (s.blocked.length) { p.errors.push(...s.blocked); return p; }
  if (!target.from || !target.to || target.from > target.to) { p.errors.push('Nieprawidłowy docelowy okres.'); return p; }
  const zones = s.zones;
  if (!zones) { p.errors.push('Nie można ustalić stref z faktur.'); return p; }
  if (Number(row.zones_count_before) !== zones) { p.errors.push(`Taryfa PRZED ma ${row.zones_count_before} stref(y), a faktury ${zones} — strefy niezgodne.`); return p; }
  const entries = s.entries.filter(e => e.included && e.record.period_from && e.record.period_to);
  if (!entries.length) { p.errors.push('Brak zatwierdzonych rozliczeń z okresem — nie ma podstawy do symulacji.'); return p; }
  const covered = entries.map(e => ({ from: e.record.period_from!, to: e.record.period_to! }));
  const missing = missingWithin(target, covered);
  const missingMonths = missing.flatMap(splitMonths);
  if (!missing.length) { p.errors.push('Docelowy okres jest już w pełni pokryty zatwierdzonymi fakturami.'); return p; }
  const realFrom = covered.map(i => i.from).sort()[0];
  const realTo = covered.map(i => i.to).sort().slice(-1)[0];
  const missingDays = missing.reduce((n, i) => n + daysOf(i), 0);
  const coveredDays = entries.filter(e => e.consumptionCounted).reduce((n, e) => n + daysOf({ from: e.record.period_from!, to: e.record.period_to! }), 0);

  // Zużycie per strefa: rzeczywiste pokrycie + średnia dobowa × brakujące dni.
  const zonePreview: NonNullable<YearSimPlan['preview']>['strefy'] = [];
  for (let z = 1; z <= zones; z++) {
    const zs = s.zoneSummaries.find(x => x.zone === z);
    const field = `consumption_before_zone${z}_mwh`;
    if (!zs || zs.mwh == null || zs.incomplete) { p.errors.push(`Strefa ${z}: zużycie z faktur niepełne — brak podstawy.`); continue; }
    let days = 0; const basis: SimEstimate['basis'] = [];
    let bad = false;
    for (const e of entries.filter(x => x.consumptionCounted)) {
      const v = mapConsumptionZones(e.record.consumption, zones).values[z as 1 | 2 | 3];
      if (v == null) { bad = true; break; }
      const d = daysOf({ from: e.record.period_from!, to: e.record.period_to! });
      days += d;
      basis.push({ record_id: e.record.id, document: e.doc.file_name, period_from: e.record.period_from!, period_to: e.record.period_to!, days: d, value: v });
    }
    if (bad || !days) { p.errors.push(`Strefa ${z}: rozliczenia nie mają odczytu tej strefy — nie szacuję.`); continue; }
    const activeSum = activeEstimates.filter(a => a.field === field).reduce((n, a) => n + Number(a.value), 0);
    const expected = zs.mwh + activeSum;
    const cur = row[field];
    if (cur != null && cur !== '' && Number(cur) !== 0 && Math.abs(Number(cur) - toStored(field, expected)) >= 1e-6) {
      p.errors.push(`Strefa ${z}: zużycie w formularzu (${cur} MWh) różni się od sumy faktur i aktywnych szacunków (${toStored(field, expected)} MWh) — najpierw zastosuj rozliczenie z faktur lub popraw zużycie ręcznie.`);
      continue;
    }
    const avg = zs.mwh / days;
    let estTotal = 0; let base = expected;
    for (const m of missingMonths) {
      const est = Math.round(avg * daysOf(m) * 10000) / 10000;
      estTotal += est;
      p.estimates.push({ field, period_from: m.from, period_to: m.to, value: est, base_value: toStored(field, base), unit: 'MWh', method: METHOD_YEAR, basis });
      base += est;
    }
    estTotal = Math.round(estTotal * 10000) / 10000;
    const total = Math.round((expected + estTotal) * 10000) / 10000;
    p.changes.push({ field, value: toStored(field, total) });
    zonePreview.push({ strefa: z, rzeczywiste_mwh: zs.mwh, szacunek_mwh: estTotal, razem_mwh: total, dni_danych: days });
    const po = row[`consumption_after_zone${z}_mwh`];
    if (po != null && po !== '' && Math.abs(Number(po) - total) >= 1e-6)
      p.warnings.push(`Strefa ${z}: zużycie PO (${po} MWh) różni się od symulowanego PRZED (${total} MWh) — wariantów nie wyrównuję. Zdecyduj: każdy wariant zachowuje własne założenia przedłużone na rok, albo przyjmujecie wspólny profil zużycia do porównania cen/taryfy/mocy.`);
  }

  // Jeden opcjonalny koszt za okres — wyłącznie na jawną zgodę, tą samą metodą dobową.
  const costPreview: NonNullable<YearSimPlan['preview']>['koszty'] = [];
  if (cost) {
    const cf = COSTS[cost];
    const c = s.costs.find(x => x.kind === cf.kind);
    if (!c || !c.components.length) p.unresolved.push(`${cf.label}: brak pozycji z faktur — nie szacuję.`);
    else if (c.missingAmounts) p.unresolved.push(`${cf.label}: część pozycji bez kwoty — nie szacuję.`);
    else if (cf.kind === 'reactive' && row.reactive_monthly_mode_before) p.unresolved.push(`${cf.label}: tryb miesięczny — uzupełnij ręcznie.`);
    else {
      const activeSum = activeEstimates.filter(a => a.field === cf.field).reduce((n, a) => n + Number(a.value), 0);
      const expected = c.total + activeSum;
      if (row[cf.field] == null || row[cf.field] === '' || Math.abs(Number(row[cf.field]) - toStored(cf.field, expected)) >= 1e-6)
        p.unresolved.push(`${cf.label}: wartość w formularzu nie jest sumą z faktur — nie zmieniam.`);
      else {
        const byRec = new Map<string, { days: number; value: number; doc: string; from: string; to: string }>();
        for (const comp of c.components) {
          if (comp.value == null || !comp.period_from || !comp.period_to) continue;
          const cur = byRec.get(comp.recordId) ?? { days: daysOf({ from: comp.period_from, to: comp.period_to }), value: 0, doc: comp.docName, from: comp.period_from, to: comp.period_to };
          cur.value += Number(comp.value);
          byRec.set(comp.recordId, cur);
        }
        const days = [...byRec.values()].reduce((n, x) => n + x.days, 0);
        if (!days) p.unresolved.push(`${cf.label}: pozycje bez okresu — nie szacuję.`);
        else {
          const avg = c.total / days;
          const basis: SimEstimate['basis'] = [...byRec.entries()].map(([recordId, x]) => ({ record_id: recordId, document: x.doc, period_from: x.from, period_to: x.to, days: x.days, value: Math.round(x.value * 100) / 100 }));
          let estTotal = 0; let base = expected;
          for (const m of missingMonths) {
            const est = Math.round(avg * daysOf(m) * 100) / 100;
            estTotal += est;
            p.estimates.push({ field: cf.field, period_from: m.from, period_to: m.to, value: est, base_value: toStored(cf.field, base), unit: 'zł', method: METHOD_YEAR, basis });
            base += est;
          }
          estTotal = Math.round(estTotal * 100) / 100;
          p.changes.push({ field: cf.field, value: toStored(cf.field, expected + estTotal) });
          costPreview.push({ skladnik: cf.label, rzeczywiste_zl: c.total, szacunek_zl: estTotal, razem_zl: Math.round((expected + estTotal) * 100) / 100 });
          p.notes.push(`${cf.label}: średnia dobowa kwot to uproszczenie, nie odtworzenie rzeczywistego naliczenia.`);
        }
      }
    }
  }

  // Nierozstrzygnięte pozycje — nigdy nie ekstrapolowane automatycznie.
  if (Number(row.fixed_distribution_before_total) > 0)
    p.unresolved.push('Suma pozostałych opłat PRZED (kwota za okres) — nie jest ekstrapolowana automatycznie; pozostaje bez zmian.');
  p.unresolved.push('Opłaty jednorazowe, przekroczenia mocy i podstawa opłaty mocowej — nie są szacowane.');
  if ((row.capacity_charge_after == null || Number(row.capacity_charge_after) === 0) && Number(row.capacity_charge_before) > 0)
    p.unresolved.push('Opłata mocowa PO wynosi zero — nierozstrzygnięte, czy to świadome założenie; nie kopiuję kosztu z PRZED.');
  if (!cost) {
    if (s.costs.some(c => c.kind === 'capacity' && c.components.length)) p.unresolved.push('Opłata mocowa PRZED za brakujące dni — możliwa do oszacowania osobno, na jawną zgodę.');
    if (s.costs.some(c => c.kind === 'reactive' && c.components.length)) p.unresolved.push('Energia bierna PRZED za brakujące dni — możliwa do oszacowania osobno, na jawną zgodę.');
  }

  // Moc umowna: historia z faktur jest zachowana; zmiana mocy NIE blokuje szacunku zużycia.
  // Kalkulator ma jedno pole mocy PRZED na cały okres — zapisujemy ją wyłącznie jako jawny,
  // zaakceptowany wariant uproszczony; nigdy nie uśredniamy ani nie stosujemy wstecz.
  const hist = s.contractedPower.filter(c => c.period_from && c.period_to);
  const formPower = row.contracted_power_before_kw != null && row.contracted_power_before_kw !== '' ? Number(row.contracted_power_before_kw) : null;
  const distinctKw = [...new Set(hist.map(c => c.kw))];
  const lastKw = hist.length ? hist[hist.length - 1].kw : null;
  const powerDiffers = distinctKw.length > 1 || (formPower != null && lastKw != null && Math.abs(formPower - lastKw) >= 1e-9);
  if (hist.length && powerDiffers) {
    const missFrom = missing[0].from, missTo = missing[missing.length - 1].to;
    p.power = {
      historia: hist.map(c => ({ kw: c.kw, od: c.period_from!, do: c.period_to! })),
      formularz_kw: formPower,
      ostatnia_znana_kw: lastKw,
      pytanie: powerAssumption == null
        ? `Czy dla brakujących miesięcy ${fmtD(missFrom)}–${fmtD(missTo)} przyjąć ostatnią znaną moc ${lastKw} kW?`
        : null,
    };
    const histTxt = hist.map(c => `${c.kw} kW (${fmtD(c.period_from!)}–${fmtD(c.period_to!)})`).join(', ');
    if (powerAssumption == null) {
      p.unresolved.push(`Moc umowna zmieniała się w okresie (${histTxt}) — to historia zmian, nie konflikt. Dla brakujących miesięcy potrzebne jest założenie; proponuję ostatnią znaną moc ${lastKw} kW. Bez tego założenia mocy nie zapisuję.`);
    } else {
      if (!Number.isFinite(powerAssumption) || powerAssumption <= 0) p.errors.push('Nieprawidłowa wartość założonej mocy.');
      else {
        if (formPower == null || Math.abs(formPower - powerAssumption) >= 1e-9)
          p.changes.push({ field: 'contracted_power_before_kw', value: powerAssumption });
        p.notes.push(`Moc umowna PRZED: historia z faktur (${histTxt}) pozostaje zachowana w rozliczeniach. Kalkulator przechowuje jedną moc dla całego okresu, więc zapisuję zaakceptowaną wartość ${powerAssumption} kW jako jawny wariant uproszczony — nie jest to średnia i nie odzwierciedla dokładnie historii. Koszty zależne od mocy (np. opłata naliczana od mocy umownej) kalkulator policzy z tej jednej wartości; opłata mocowa z faktur to osobny składnik i nie jest z nią utożsamiana.`);
      }
    }
  }

  // Ostrzeżenia o mocy.
  const poPower = Number(row.contracted_power_after_kw);
  if (s.pmax && poPower > 0 && s.pmax.kw > poPower)
    p.warnings.push(`Pmax z pomiarów (${s.pmax.kw} kW, okres ${fmtD(s.pmax.period_from ?? '?')} – ${fmtD(s.pmax.period_to ?? '?')}) przekracza moc umowną PO (${poPower} kW) — symulacja nie potwierdza wystarczalności mocy.`);

  // Okres docelowy — zmiana wyłącznie dat.
  p.changes.unshift({ field: 'period_to', value: target.to });
  p.changes.unshift({ field: 'period_from', value: target.from });

  p.notes.push(`Symulacja ${fmtD(target.from)}–${fmtD(target.to)}: ${METHOD_YEAR_LABEL}. Założenie braku zmian sezonowych — to nie jest prognoza uwzględniająca sezonowość.`);
  p.notes.push('Koszty liczone ze stawek (energia czynna, składnik zmienny) oraz opłaty miesięczne (np. handlowa) przeliczą się automatycznie z zużycia i długości okresu. Ceny jednostkowe i moc pozostają bez zmian.');
  p.notes.push('Szacunek nie potwierdza Pmax ani bezpiecznej mocy umownej. Zmieniam wyłącznie okres i PRZED — PO zostaje nietknięte.');

  if (p.errors.length) { p.changes = []; p.estimates = []; return p; }
  p.preview = {
    okres_docelowy: { od: target.from, do: target.to, dni: daysOf(target) },
    dane_rzeczywiste: { od: realFrom, do: realTo, dni: coveredDays },
    brakujace_okresy: missing.map(m => ({ od: m.from, do: m.to, dni: daysOf(m) })),
    strefy: zonePreview,
    koszty: costPreview,
  };
  return p;
}
