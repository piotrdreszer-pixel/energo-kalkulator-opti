// Pure tariff change validation and comparison on copies of the analysis row.
// Costs always come from calculateEnergyCosts; nothing here writes data.
import { calculateEnergyCosts } from './calculation-utils.ts';
import { getZoneLabels, validateContractedPower, TARIFF_CODES } from './tariff-utils.ts';

export const isKnownTariff = (c: string) => TARIFF_CODES.some(t => t.code.toUpperCase() === String(c).toUpperCase());
const zonesOf = (c: string) => TARIFF_CODES.find(t => t.code.toUpperCase() === c.toUpperCase())?.zones ?? 0;
const group = (c: string) => c.slice(0, 1).toUpperCase();

export interface TariffCheck { ok: boolean; errors: string[]; conditions: string[] }

/** Validates the target pair (tariff + power) together; never against the old tariff only. */
export function checkTariffChange(a: { from: string; to: string; powerKw: number | null; visibleForOsd: string[] | null }): TariffCheck {
  const errors: string[] = [], conditions: string[] = [];
  if (!isKnownTariff(a.to)) errors.push(`Taryfa ${a.to} nie występuje w kalkulatorze.`);
  else if (a.visibleForOsd && !a.visibleForOsd.some(c => c.toUpperCase() === a.to.toUpperCase())) errors.push(`Taryfa ${a.to} nie jest dostępna dla wybranego OSD.`);
  if (a.powerKw == null || !(a.powerKw > 0)) errors.push('Brak mocy umownej dla nowej taryfy.');
  else if (isKnownTariff(a.to)) { const v = validateContractedPower(a.to, a.powerKw); if (!v.valid) errors.push(v.error!); }
  if (a.from && group(a.from) !== group(a.to)) conditions.push(`Zmiana grupy ${group(a.from)}→${group(a.to)} wymaga potwierdzenia napięcia i warunków przyłączenia u OSD — sama moc tego nie przesądza.`);
  return { ok: errors.length === 0, errors, conditions };
}

/** Consumption for the target tariff zones: kept only when zone meaning is identical; 1-zone target takes the total. Otherwise missing. */
export function mapConsumptionForTariff(from: string, to: string, cons: (number | null)[]): { values: (number | null)[]; missing: boolean } {
  const zf = zonesOf(from), zt = zonesOf(to);
  const vals = cons.slice(0, zf);
  if (zt === 1) return vals.every(v => v != null) ? { values: [vals.reduce((s, v) => s + Number(v), 0), null, null], missing: false } : { values: [null, null, null], missing: true };
  const same = zf === zt && getZoneLabels(zf).join('|') === getZoneLabels(zt).join('|') && from.replace(/[a-z]$/i, m => m.toLowerCase()).slice(0, 3) === to.slice(0, 3);
  if (same && vals.every(v => v != null)) return { values: [...vals, null, null, null].slice(0, 3) as (number | null)[], missing: false };
  return { values: [null, null, null], missing: true };
}

export interface CandidateRates { code: string; year: number | null; source: string; rates: Record<string, number | null> }
export interface CompareRow { code: string; powerKw: number; year: number | null; source: string; costPo: number | null; diffVsPo: number | null; savingsVsBefore: number | null; status: 'kompletne' | 'brakujace'; notes: string[] }

const RATE_KEYS = ['fixed_distribution_after_total', 'contracted_power_charge_rate_after', 'variable_distribution_after_zone1_rate', 'variable_distribution_after_zone2_rate', 'variable_distribution_after_zone3_rate'];

export function compareTariffs(row: Record<string, any>, cands: CandidateRates[], visibleForOsd: string[] | null, powerKw?: number): CompareRow[] {
  const power = powerKw ?? Number(row.contracted_power_after_kw);
  const base = calculateEnergyCosts(row);
  const cons = [1, 2, 3].map(z => row[`consumption_after_zone${z}_mwh`] ?? row[`consumption_zone${z}_mwh`] ?? null);
  return cands.map(c => {
    const chk = checkTariffChange({ from: row.tariff_code_after, to: c.code, powerKw: power, visibleForOsd });
    const notes = [...chk.errors, ...chk.conditions];
    const zones = zonesOf(c.code);
    const map = mapConsumptionForTariff(row.tariff_code_after, c.code, cons);
    if (map.missing) notes.push('Brak podziału zużycia na strefy tej taryfy — wymaga profilu lub zaakceptowanego założenia.');
    const missingRate = RATE_KEYS.filter(k => { const z = /zone(\d)/.exec(k)?.[1]; return (!z || Number(z) <= zones) && c.rates[k] == null; });
    if (missingRate.length) notes.push('Brak części stawek w bazie dla wybranego okresu (brak stawki ≠ 0).');
    if (zones > (Number(row.zones_count_after) || 1)) notes.push('Ceny energii czynnej dla nowych stref nie są ustalone.');
    const complete = chk.ok && !map.missing && !missingRate.length && zones <= (Number(row.zones_count_after) || 1);
    if (!complete) return { code: c.code, powerKw: power, year: c.year, source: c.source, costPo: null, diffVsPo: null, savingsVsBefore: null, status: 'brakujace', notes };
    const copy = { ...row, ...c.rates, tariff_code_after: c.code, zones_count_after: zones, contracted_power_after_kw: power };
    map.values.forEach((v, i) => { copy[`consumption_after_zone${i + 1}_mwh`] = v; });
    const r = calculateEnergyCosts(copy);
    return { code: c.code, powerKw: power, year: c.year, source: c.source, costPo: r.totalCostAfter, diffVsPo: base.savingsAvailable ? r.totalCostAfter - base.totalCostAfter : null, savingsVsBefore: r.savingsAvailable ? r.savingsValue : null, status: 'kompletne', notes };
  });
}

/** Cheapest among correctly computed rows; null when none or tie (ask the user). */
export function cheapest(rows: CompareRow[]): CompareRow | null {
  const ok = rows.filter(r => r.status === 'kompletne' && r.costPo != null).sort((a, b) => a.costPo! - b.costPo!);
  if (!ok.length || (ok[1] && Math.abs(ok[1].costPo! - ok[0].costPo!) < 0.005)) return null;
  return ok[0];
}
