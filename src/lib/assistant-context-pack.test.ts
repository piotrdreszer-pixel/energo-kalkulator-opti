import { describe, it, expect } from 'vitest';
import { pickPpeFields, compactInvoiceRecord, compactSettlementPlan, trimHistory } from './assistant-context-pack';

describe('assistant context packing', () => {
  it('keeps only whitelisted PPE fields', () => {
    const row = { id: 'a', name: 'PPE 1', secret_note: 'x', internal_flag: true };
    expect(pickPpeFields(row as never, ['id', 'name'])).toEqual({ id: 'a', name: 'PPE 1' });
  });
  it('caps oversized invoice JSON and drops heavy snapshots', () => {
    const big = Array.from({ length: 500 }, (_, i) => ({ zone: i, kwh: i }));
    const rec = compactInvoiceRecord({ ppe_number: 'P1', period_from: '2026-01-01', period_to: '2026-01-31', consumption: big, review_state: { a: 1 }, analysis_documents: { doc_type: 'invoice', document_number: '7' } } as never);
    expect(rec.dokument).toEqual({ typ: 'invoice', numer: '7', wystawca: null });
    expect(String(rec.zuzycie)).toContain('pominięto');
    expect('review_state' in rec).toBe(false);
  });
  it('settlement plan exposes rows and conflicts only', () => {
    const plan = { rows: [{ field: 'f', label: 'L', value: 5, invoiceValue: 4, estimated: 1, current: 0, manual: false }], conflicts: [{ field: 'g' }], settlement: { entries: [1, 2, 3] } } as never;
    const c = compactSettlementPlan(plan) as Record<string, unknown>;
    expect('settlement' in c).toBe(false);
    expect((c.wiersze as unknown[]).length).toBe(1);
    expect((c.konflikty_reczne as unknown[]).length).toBe(1);
  });
  it('history keeps the newest messages within budget and caps long ones', () => {
    const msgs = [
      { role: 'user', content: 'x'.repeat(9000) },
      { role: 'assistant', content: 'y'.repeat(9000) },
      { role: 'user', content: 'ostatnie pytanie' },
    ];
    const out = trimHistory(msgs, 12000, 3000);
    expect(out[out.length - 1].content).toBe('ostatnie pytanie');
    expect(out.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(12000);
    expect(out.some(m => m.content.length > 3001)).toBe(false);
  });
  it('history of short messages stays intact', () => {
    const msgs = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }];
    expect(trimHistory(msgs)).toEqual(msgs);
  });
});
