import { describe, it, expect } from 'vitest';
import { assistantDraftDiff, assistantIssues } from './assistant-context';
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
});
