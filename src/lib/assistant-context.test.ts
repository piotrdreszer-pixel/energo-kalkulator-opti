import { describe, it, expect } from 'vitest';
import { assistantDraftDiff, assistantIssues, assistantResultSummary } from './assistant-context';
import { featureRules } from './feature-access';

describe('AI assistant', () => {
  it('access is off by default, also when other features are on', () => {
    expect(featureRules(null, 1).aiAssistant).toBe(false);
    expect(featureRules({ invoice_import: true, multi_ppe: true }, 1).aiAssistant).toBe(false);
    expect(featureRules({ ai_assistant: true }, 1).aiAssistant).toBe(true);
  });
  it('detects unsaved draft fields only', () => {
    expect(assistantDraftDiff({ handling_fee_after: 10, name: 'a' }, { handling_fee_after: 12, name: 'a' })).toEqual(['handling_fee_after']);
  });
  it('flags PRZED cost missing in PO', () => {
    expect(assistantIssues({ handling_fee_before: 20, handling_fee_after: 0 })).toContain('Koszt „opłata handlowa” występuje w PRZED, a w PO jest pusty');
  });
  it('missing consumption is reported, not treated as zero', () => {
    expect(assistantIssues({ zones_count_before: 2, consumption_before_zone1_mwh: 5 })).toContain('PRZED: brak zużycia w strefie 2');
  });
  it('result summary carries the calculator totals unchanged', () => {
    const r = { totalCostBefore: 556128.4, totalCostAfter: 358607.2, savingsValue: 197521.2, savingsPercent: 35.517, periodMonths: 12 } as any;
    const s = assistantResultSummary({ period_from: '2026-01-01', period_to: '2026-12-31' }, r, 'zapisane');
    expect(s.koszt_przed_zl).toBe(556128.4);
    expect(s.koszt_po_zl).toBe(358607.2);
    expect(s.oszczednosc_zl).toBe(197521.2);
    expect(s.oszczednosc_proc).toBe(35.52);
    expect(s.okres.od).toBe('2026-01-01');
  });
});
