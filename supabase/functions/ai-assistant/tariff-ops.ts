// Tariff change / comparison helpers for the assistant. Rates come from the same rates-resolve function the form uses.
import { checkTariffChange, mapConsumptionForTariff, compareTariffs, cheapest, type CandidateRates } from '../_shared/tariff-compare.ts';
import { getZonesCount } from '../_shared/tariff-utils.ts';

export interface Resolved { rateCardId: string; rateCardName: string; validFrom: string; validTo: string | null; rates: { fixedNetworkRate: number | null; variableRates: { zone: number; rate: number }[]; capacityFee: number | null } }

export async function resolveRates(url: string, anon: string, osdId: string, tariff: string, season: string, year: number): Promise<Resolved | null> {
  const q = new URLSearchParams({ osd_id: osdId, tariff, season: season || 'ALL', date: `${year}-01-01` });
  const r = await fetch(`${url}/functions/v1/rates-resolve?${q}`, { headers: { apikey: anon } });
  if (!r.ok) return null;
  return await r.json();
}

export const ratesYear = (row: Record<string, any>) => Number(row.rates_year_after) || Number(String(row.period_from ?? '').slice(0, 4)) || new Date().getFullYear();

/** Maps resolved rates to PO fields; a missing rate stays null (never 0). */
export function rateChanges(res: Resolved, zones: number, year: number) {
  const v = (z: number) => res.rates.variableRates.find(x => x.zone === z)?.rate ?? res.rates.variableRates[z - 1]?.rate ?? null;
  return {
    contracted_power_charge_rate_after: res.rates.fixedNetworkRate ?? null,
    variable_distribution_after_zone1_rate: v(1),
    variable_distribution_after_zone2_rate: zones >= 2 ? v(2) : null,
    variable_distribution_after_zone3_rate: zones >= 3 ? v(3) : null,
    capacity_charge_after: res.rates.capacityFee ?? null,
    rate_card_id_after: res.rateCardId, rates_year_after: year,
    rates_source_after: { rate_card_id: res.rateCardId, rate_card_name: res.rateCardName, valid_from: res.validFrom, valid_to: res.validTo, year, applied_at: new Date().toISOString(), via: 'ai' },
  } as Record<string, unknown>;
}

const RATE_FIELDS = ['contracted_power_charge_rate_after', 'variable_distribution_after_zone1_rate', 'variable_distribution_after_zone2_rate', 'variable_distribution_after_zone3_rate', 'capacity_charge_after'];

/** Manual or document corrections of PO rates that a tariff change would replace. */
export function manualRateCorrections(row: Record<string, any>): string[] {
  const vs = (row.value_sources ?? {}) as Record<string, { source?: string }>;
  const ov = Object.keys((row.rates_overridden_after ?? {}) as Record<string, unknown>);
  return Array.from(new Set([...ov, ...RATE_FIELDS.filter(f => ['manual', 'document'].includes(vs[f]?.source ?? ''))]));
}

export interface TariffPlan { ok: boolean; errors: string[]; conditions: string[]; changes: { field: string; value: unknown }[]; missing: string[]; rateCard?: string }

export async function planTariffPo(a: { row: Record<string, any>; tariff: string; powerKw: number; visible: string[] | null; replaceManual: boolean; url: string; anon: string }): Promise<TariffPlan> {
  const { row } = a;
  const chk = checkTariffChange({ from: row.tariff_code_after, to: a.tariff, powerKw: a.powerKw, visibleForOsd: a.visible });
  if (!chk.ok) return { ok: false, errors: chk.errors, conditions: chk.conditions, changes: [], missing: [] };
  if (!row.osd_id) return { ok: false, errors: ['Brak OSD w analizie — nie można dobrać stawek.'], conditions: chk.conditions, changes: [], missing: [] };
  const manual = manualRateCorrections(row);
  if (manual.length && !a.replaceManual) return { ok: false, errors: [`Ręczne korekty stawek PO (${manual.join(', ')}) nie pasują do nowej taryfy. Zapytaj użytkownika, czy je zastąpić stawkami z bazy.`], conditions: chk.conditions, changes: [], missing: [] };
  const year = ratesYear(row), zones = getZonesCount(a.tariff);
  const res = await resolveRates(a.url, a.anon, row.osd_id, a.tariff, row.season_after ?? 'ALL', year);
  if (!res) return { ok: false, errors: [`Brak stawek ${a.tariff} dla tego OSD w roku ${year}. Nic nie zapisano.`], conditions: chk.conditions, changes: [], missing: [] };
  const fields: Record<string, unknown> = { tariff_code_after: a.tariff, zones_count_after: zones, contracted_power_after_kw: a.powerKw, ...rateChanges(res, zones, year), rates_overridden_after: {} };
  const cons = mapConsumptionForTariff(row.tariff_code_after, a.tariff, [1, 2, 3].map(z => row[`consumption_after_zone${z}_mwh`] ?? null));
  const missing: string[] = [];
  cons.values.forEach((v, i) => { fields[`consumption_after_zone${i + 1}_mwh`] = i < zones ? v : null; });
  if (cons.missing) missing.push('zużycie PO w strefach nowej taryfy');
  for (let z = 1; z <= 3; z++) if (z > zones) fields[`active_energy_price_after_zone${z}`] = null; else if (row[`active_energy_price_after_zone${z}`] == null) missing.push(`cena energii PO strefa ${z}`);
  RATE_FIELDS.forEach(f => { if (fields[f] === null && !/zone[23]/.test(f)) missing.push(`stawka ${f}`); });
  const changes = Object.entries(fields).filter(([k, v]) => JSON.stringify(row[k] ?? null) !== JSON.stringify(v)).map(([field, value]) => ({ field, value }));
  return { ok: true, errors: [], conditions: chk.conditions, changes, missing, rateCard: `${res.rateCardName} (${year})` };
}

export async function compareForRow(a: { row: Record<string, any>; visible: string[]; powerKw?: number; url: string; anon: string }) {
  const year = ratesYear(a.row);
  const cands: CandidateRates[] = [];
  for (const code of a.visible) {
    const res = a.row.osd_id ? await resolveRates(a.url, a.anon, a.row.osd_id, code, a.row.season_after ?? 'ALL', year) : null;
    const zones = getZonesCount(code);
    cands.push(res
      ? { code, year, source: res.rateCardName, rates: { ...rateChanges(res, zones, year), fixed_distribution_after_total: a.row.fixed_distribution_after_total ?? null } as Record<string, number | null> }
      : { code, year, source: 'brak stawek w bazie', rates: { contracted_power_charge_rate_after: null } });
  }
  const rows = compareTariffs(a.row, cands, a.visible, a.powerKw);
  return { rows, najtanszy: cheapest(rows)?.code ?? null, rok_stawek: year };
}
