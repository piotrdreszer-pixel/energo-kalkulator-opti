import { describe, it, expect } from 'vitest';
import { buildSettlement, coverageGaps, settlementProposals, type SettlementDoc, type SettlementItem } from './invoice-settlement';
import type { InvoicePpeRecord } from './invoice-import';

const PPE = '0590000000000001';
let n = 0;
function month(y: number, m: number) {
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${y}-${String(m).padStart(2, '0')}-${last}` };
}
function doc(over: Partial<SettlementDoc> = {}): SettlementDoc {
  n++;
  return { id: `d${n}`, file_name: `f${n}.pdf`, status: 'approved', doc_type: 'kompleksowa', issuer: 'X', document_number: `FV/${n}`, corrected_document_number: null, file_hash: `h${n}`, ...over };
}
function rec(d: SettlementDoc, p: { from: string; to: string }, over: Partial<InvoicePpeRecord> = {}): InvoicePpeRecord {
  return {
    id: `r-${d.id}`, document_id: d.id, ppe_number: PPE, ppe_address: null, tariff_code: 'C12a', osd_name: null,
    period_from: p.from, period_to: p.to, contracted_power_kw: 40, max_power_kw: 30,
    consumption: [{ zone_name: 'szczyt', value: 1000, unit: 'kWh' }, { zone_name: 'pozaszczyt', value: 2000, unit: 'kWh' }],
    reactive: null, other_charges: null, source_pages: null, matched_analysis_id: null, match_status: 'matched',
    applied_fields: [], applied_at: '2026-01-01', review_state: null, ...over,
  };
}
function items(d: SettlementDoc, r: InvoicePpeRecord, price1 = 0.5, price2 = 0.4): SettlementItem[] {
  return [
    { id: `${d.id}-a1`, document_id: d.id, ppe_record_id: r.id, name: 'Energia czynna szczyt', quantity: 1000, unit: 'kWh', rate: price1, net_value: 1000 * price1, category: 'energia_czynna', page: 1 },
    { id: `${d.id}-a2`, document_id: d.id, ppe_record_id: r.id, name: 'Energia czynna pozaszczyt', quantity: 2000, unit: 'kWh', rate: price2, net_value: 2000 * price2, category: 'energia_czynna', page: 1 },
    { id: `${d.id}-m`, document_id: d.id, ppe_record_id: r.id, name: 'Opłata mocowa', quantity: 3000, unit: 'kWh', rate: 0.1, net_value: 300, category: 'mocowa', page: 1 },
    { id: `${d.id}-s`, document_id: d.id, ppe_record_id: r.id, name: 'Do zapłaty', quantity: null, unit: null, rate: null, net_value: 99999, category: 'inne', page: 2 },
  ];
}
function year(startMonth = 1, startYear = 2025, skip: number[] = []) {
  const docs: SettlementDoc[] = [], records: InvoicePpeRecord[] = [], its: SettlementItem[] = [];
  for (let i = 0; i < 12; i++) {
    if (skip.includes(i)) continue;
    const m = ((startMonth - 1 + i) % 12) + 1, y = startYear + Math.floor((startMonth - 1 + i) / 12);
    const d = doc(); const r = rec(d, month(y, m));
    docs.push(d); records.push(r); its.push(...items(d, r));
  }
  return { docs, records, items: its };
}

describe('buildSettlement', () => {
  it('12 kolejnych miesięcy: pełny okres, zużycie kWh/1000, cena ważona, saldo pominięte', () => {
    const s = buildSettlement({ ppeNumber: PPE, ...year() });
    expect(s.proposedPeriod).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(s.gaps).toEqual([]);
    expect(s.zoneSummaries[0].mwh).toBeCloseTo(12);
    expect(s.zoneSummaries[1].mwh).toBeCloseTo(24);
    expect(s.zoneSummaries[0].price).toBeCloseTo(500);
    expect(s.costs.find((c) => c.kind === 'capacity')!.total).toBeCloseTo(3600);
    expect(s.costs.some((c) => c.kind === 'balance')).toBe(false);
    expect(s.totalNet).toBeCloseTo(12 * (500 + 800 + 300));
  });

  it('okres lipiec–czerwiec', () => {
    const s = buildSettlement({ ppeNumber: PPE, ...year(7, 2025) });
    expect(s.proposedPeriod).toEqual({ from: '2025-07-01', to: '2026-06-30' });
  });

  it('brak miesiąca = luka, abonament bez stawki miesięcznej', () => {
    const s = buildSettlement({ ppeNumber: PPE, ...year(1, 2025, [4]) });
    expect(s.gaps).toEqual([{ from: '2025-05-01', to: '2025-05-31' }]);
    expect(s.zoneSummaries[0].mwh).toBeCloseTo(11);
  });

  it('ponowne wgranie tej samej faktury nie podwaja sum', () => {
    const y = year();
    const d = doc({ file_hash: y.docs[0].file_hash }); const r = rec(d, month(2025, 1));
    const s = buildSettlement({ ppeNumber: PPE, docs: [...y.docs, d], records: [...y.records, r], items: [...y.items, ...items(d, r)] });
    expect(s.zoneSummaries[0].mwh).toBeCloseTo(12);
    expect(s.entries.find((e) => e.doc.id === d.id)!.included).toBe(false);
  });

  it('sprzedaż + dystrybucja za ten sam okres: koszty obu, zużycie raz', () => {
    const ds = doc({ doc_type: 'sprzedaz' }), dd = doc({ doc_type: 'dystrybucja' });
    const p = month(2025, 1);
    const rs = rec(ds, p), rd = rec(dd, p);
    const dItems: SettlementItem[] = [{ id: 'net', document_id: dd.id, ppe_record_id: rd.id, name: 'Składnik zmienny stawki sieciowej', quantity: 3000, unit: 'kWh', rate: 0.1, net_value: 300, category: 'dystrybucja', page: 1 }];
    const s = buildSettlement({ ppeNumber: PPE, docs: [ds, dd], records: [rs, rd], items: [...items(ds, rs), ...dItems] });
    expect(s.entries.every((e) => e.included)).toBe(true);
    expect(s.zoneSummaries[0].mwh).toBeCloseTo(1);
    expect(s.costs.find((c) => c.kind === 'variable_network')!.total).toBe(300);
  });

  it('korekta nie jest sumowana automatycznie', () => {
    const y = year();
    const k = doc({ doc_type: 'korekta', corrected_document_number: y.docs[0].document_number }); const r = rec(k, month(2025, 1));
    const s = buildSettlement({ ppeNumber: PPE, docs: [...y.docs, k], records: [...y.records, r], items: [...y.items, ...items(k, r)] });
    expect(s.zoneSummaries[0].mwh).toBeCloseTo(12);
    expect(s.issues.some((i) => i.includes('Korekta'))).toBe(true);
  });

  it('zmiana taryfy 2→3 strefy blokuje zapis stref', () => {
    const y = year();
    y.records[11].tariff_code = 'C21';
    y.records[6].tariff_code = 'B23';
    const s = buildSettlement({ ppeNumber: PPE, ...y });
    expect(s.tariffs.length).toBeGreaterThan(1);
    expect(settlementProposals(s).some((p) => p.field.startsWith('consumption_'))).toBe(false);
  });

  it('zmiana mocy: historia bez uśredniania', () => {
    const y = year();
    for (let i = 6; i < 12; i++) y.records[i].contracted_power_kw = 60;
    const s = buildSettlement({ ppeNumber: PPE, ...y });
    expect(s.contractedPower.map((c) => c.kw)).toEqual([40, 60]);
    expect(s.blocked.some((b) => b.includes('mocy'))).toBe(true);
  });

  it('zmiana ceny: cena zbiorcza ważona zużyciem', () => {
    const d1 = doc(), d2 = doc();
    const r1 = rec(d1, month(2025, 1)), r2 = rec(d2, month(2025, 2), { consumption: [{ zone_name: 'szczyt', value: 3000, unit: 'kWh' }, { zone_name: 'pozaszczyt', value: 2000, unit: 'kWh' }] });
    const i2 = items(d2, r2, 1.0).map((i) => (i.id.endsWith('a1') ? { ...i, quantity: 3000, net_value: 3000 } : i));
    const s = buildSettlement({ ppeNumber: PPE, docs: [d1, d2], records: [r1, r2], items: [...items(d1, r1, 0.5), ...i2] });
    // (500 + 3000) zł / 4 MWh = 875 zł/MWh (średnia arytmetyczna dałaby 750)
    expect(s.zoneSummaries[0].price).toBeCloseTo(875);
  });

  it('kilka PPE na jednym dokumencie — tylko wybrany PPE', () => {
    const d = doc(); const r1 = rec(d, month(2025, 1)); const r2 = { ...rec(d, month(2025, 1)), id: 'other', ppe_number: '0590000000000002' };
    const s = buildSettlement({ ppeNumber: PPE, docs: [d], records: [r1, r2], items: [...items(d, r1), ...items(d, r2).map((i) => ({ ...i, id: i.id + 'x', ppe_record_id: 'other' }))] });
    expect(s.costs.find((c) => c.kind === 'capacity')!.total).toBe(300);
  });

  it('odznaczone pozycje (review_state) nie wchodzą do sum; przeliczenie nie dubluje', () => {
    const y = year();
    y.records[0].review_state = { version: 1, lineSelected: [`${y.docs[0].id}-a1`, `${y.docs[0].id}-a2`] };
    const a = buildSettlement({ ppeNumber: PPE, ...y });
    const b = buildSettlement({ ppeNumber: PPE, ...y });
    expect(a.costs.find((c) => c.kind === 'capacity')!.total).toBeCloseTo(3300);
    expect(b.totalNet).toBeCloseTo(a.totalNet);
  });

  it('brak Pmax nie jest zerem; niezatwierdzone nie wliczone', () => {
    const y = year();
    y.records.forEach((r) => (r.max_power_kw = null));
    y.docs[0].status = 'needs_review';
    const s = buildSettlement({ ppeNumber: PPE, ...y });
    expect(s.pmax).toBeNull();
    expect(s.pending.length).toBe(1);
  });

  it('coverageGaps', () => {
    expect(coverageGaps([{ from: '2025-01-01', to: '2025-01-31' }, { from: '2025-03-01', to: '2025-03-31' }])).toEqual([{ from: '2025-02-01', to: '2025-02-28' }]);
  });
});

import { toStored, matchesStored } from './invoice-settlement';
describe('storage precision check', () => {
  it('6344.172 kWh -> 6.344172 MWh stored as 6.3442 matches', () => {
    expect(toStored('consumption_before_zone1_mwh', 6.344172)).toBe(6.3442);
    expect(matchesStored('consumption_before_zone1_mwh', 6.344172, '6.3442')).toBe(true);
  });
  it('unit error (x1000) still fails', () => {
    expect(matchesStored('consumption_before_zone1_mwh', 6.344172, '6344.172')).toBe(false);
  });
  it('zero vs null distinguished', () => {
    expect(matchesStored('capacity_charge_before', 0, '0.00')).toBe(true);
    expect(matchesStored('capacity_charge_before', 0, null)).toBe(false);
  });
});
