import { buildSettlement, settlementProposals, toStored, matchesStored, type Interval, type Settlement } from './invoice-settlement.ts';

export interface SettlementSnapshot {
  token: string;
  row: Record<string, any>;
  docs: any[];
  records: any[];
  items: any[];
  estimates: any[];
}
export const isSummaryCommand=(message:string)=> /(^|\s)zastosuj\s+(to\s+)?(podsumowanie|zestawienie)\s+do\s+PRZED(?:\s|[.!]|$)/i.test(message) && !/\?|\bnie\s+zastosuj/i.test(message);
export function intervalCovered(interval: Interval, ranges: Interval[]): boolean {
  let next = Date.parse(interval.from + 'T00:00:00Z');
  const end = Date.parse(interval.to + 'T00:00:00Z');
  for (const r of [...ranges].sort((a,b) => a.from.localeCompare(b.from))) {
    const start = Date.parse(r.from + 'T00:00:00Z'), stop = Date.parse(r.to + 'T00:00:00Z');
    if (start > next) break;
    if (stop >= next) next = stop + 86400000;
  }
  return next > end;
}
export function estimateCovered(s: Settlement, e: any): boolean {
  const ranges = s.entries.filter(x => x.included && x.record.period_from && x.record.period_to &&
    (e.field.startsWith('consumption_') ? x.consumptionCounted : x.stream !== 'sales'))
    .map(x => ({ from: String(x.record.period_from), to: String(x.record.period_to) }));
  return intervalCovered({from:e.period_from,to:e.period_to},ranges);
}
/** Trusted source values only; no model/client totals. */
export function settlementPlan(snapshot: SettlementSnapshot, replaceManual: string[] = []) {
  const {row, estimates} = snapshot;
  const settlement = buildSettlement({ppeNumber:String(row.ppe_number || ''),analysisId:row.id,
    docs:snapshot.docs,records:snapshot.records,items:snapshot.items});
  const conflicts: {field:string;label:string;current:unknown;incoming:number}[] = [];
  const replaced: string[] = [];
  const rows = settlementProposals(settlement).filter(p => !(p.field === 'reactive_energy_cost_before' && row.reactive_monthly_mode_before)).map(p => {
    const active = estimates.filter(e => e.field === p.field);
    const retained = active.filter(e => !estimateCovered(settlement,e));
    const estimated = retained.reduce((n,e) => n + Number(e.value),0);
    const value = toStored(p.field,p.value + estimated);
    const manual = row.value_sources?.[p.field]?.source === 'manual' && !matchesStored(p.field,value,row[p.field]);
    if(manual && !replaceManual.includes(p.field)) conflicts.push({field:p.field,label:p.label,current:row[p.field],incoming:value});
    for(const e of active.filter(e => estimateCovered(settlement,e))) replaced.push(e.id);
    return {...p,invoiceValue:p.value,estimated:retained.length ? estimated : null,value,current:row[p.field],manual};
  });
  const changes = rows.filter(p => !matchesStored(p.field,p.value,row[p.field]) || estimates.some(e=>e.field===p.field && replaced.includes(e.id))).map(p => ({field:p.field,value:p.value}));
  const sources = Object.fromEntries(rows.map(p => [p.field,{source:'document',item_ref:'settlement',
    document_ids:settlement.entries.filter(e=>e.included).map(e=>e.doc.id),estimate_ids:estimates.filter(e=>e.field===p.field && !replaced.includes(e.id)).map(e=>e.id)}]));
  return {settlement,rows,conflicts,changes,sources,replaced};
}