import { describe, it, expect } from 'vitest';
import { featureRules, canDeleteClientData } from './feature-access';
describe('individual feature permissions', () => {
  it('disabled feature flags do not remove owner deletion rights', () => {
    expect(featureRules(null, 3).readOnly).toBe(true);
    expect(canDeleteClientData('owner', 'owner', false, false)).toBe(true);
  });
  it('admin and app owner may delete regardless of feature flags', () => {
    expect(canDeleteClientData('admin', 'other', true, false)).toBe(true);
    expect(canDeleteClientData('superadmin', 'other', false, true)).toBe(true);
  });
  it('other users and managers cannot delete someone else data', () => {
    expect(canDeleteClientData('manager', 'other', false, false)).toBe(false);
    expect(canDeleteClientData(null, null, true, true)).toBe(false);
  });
  it('missing or null access denies both features', () => {
    for (const access of [undefined, null, {}, { invoice_import: null, multi_ppe: null }]) {
      expect(featureRules(access, 1)).toEqual({ multiPpe: false, readOnly: false, canImport: false, canAddPpe: false, aiAssistant: false });
    }
  });
  it('both disabled allows first PPE in each independent analysis', () => {
    expect(featureRules(null, 0).canAddPpe).toBe(true);
    expect(featureRules(null, 1).canAddPpe).toBe(false);
  });
  it('import alone does not permit a second PPE', () => {
    expect(featureRules({ invoice_import: true }, 1)).toMatchObject({ canImport: true, canAddPpe: false });
  });
  it('multi PPE alone does not permit import', () => {
    expect(featureRules({ multi_ppe: true }, 2)).toMatchObject({ canImport: false, canAddPpe: true, readOnly: false });
  });
  it('both enabled allows both workflows', () => {
    expect(featureRules({ multi_ppe: true, invoice_import: true }, 2)).toMatchObject({ canImport: true, canAddPpe: true, readOnly: false });
  });
  it('revocation makes existing multi PPE analysis read only even with import enabled', () => {
    expect(featureRules({ multi_ppe: false, invoice_import: true }, 2)).toMatchObject({ readOnly: true, canImport: false, canAddPpe: false });
  });
});