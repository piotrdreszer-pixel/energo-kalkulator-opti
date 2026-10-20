import { describe, it, expect } from 'vitest';
import { functionErrorMessage, isAllowedFile } from './invoice-upload';
describe('invoice upload errors', () => {
  it('402 tells about missing AI credits', () => {
    expect(functionErrorMessage(402, null)).toMatch(/kredyt/i);
  });
  it('403 keeps the server denial reason', () => {
    expect(functionErrorMessage(403, { error: 'Brak dostępu do funkcji Import faktur' })).toBe('Brak dostępu do funkcji Import faktur');
  });
  it('429 and timeout are reported as retryable', () => {
    expect(functionErrorMessage(429, null)).toMatch(/limit/i);
    expect(functionErrorMessage(504, null)).toMatch(/czas/i);
  });
  it('only PDF, JPG and PNG are accepted', () => {
    expect(isAllowedFile('a.PDF')).toBe(true);
    expect(isAllowedFile('a.docx')).toBe(false);
  });
});
