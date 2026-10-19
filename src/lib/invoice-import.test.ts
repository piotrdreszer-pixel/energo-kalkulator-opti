import { describe, it, expect } from 'vitest';
import {
  proposeMatch,
  recordToBeforeFields,
  diffAgainstAnalysis,
  canApplyRecord,
  type InvoicePpeRecord,
} from './invoice-import';
import type { EnergyAnalysis } from '@/types/database';

const rec = (over: Partial<InvoicePpeRecord> = {}): InvoicePpeRecord => ({
  id: 'r1',
  document_id: 'd1',
  ppe_number: 'PPE 001',
  ppe_address: 'ul. Testowa 1',
  tariff_code: 'C21',
  osd_name: 'ENEA',
  period_from: '2026-01-01',
  period_to: '2026-12-31',
  contracted_power_kw: 40,
  max_power_kw: null,
  consumption: [
    { zone_name: 'dzienna', value: 12000, unit: 'kWh' },
    { zone_name: 'nocna', value: 3000, unit: 'kWh' },
  ],
  reactive: null,
  other_charges: null,
  source_pages: [1],
  matched_analysis_id: null,
  match_status: 'unmatched',
  applied_fields: [],
  applied_at: null,
  ...over,
});

describe('proposeMatch', () => {
  const analyses = [
    { id: 'a1', ppe_number: 'PPE001' },
    { id: 'a2', ppe_number: 'PPE 002' },
  ] as Pick<EnergyAnalysis, 'id' | 'ppe_number'>[];

  it('dopasowuje po numerze PPE ignorując spacje', () => {
    expect(proposeMatch(rec({ ppe_number: 'PPE 001' }), analyses)).toEqual({ analysisId: 'a1', status: 'matched' });
  });
  it('nowy numer → propozycja utworzenia PPE', () => {
    expect(proposeMatch(rec({ ppe_number: 'PPE 999' }), analyses).status).toBe('new');
  });
  it('brak numeru → unmatched', () => {
    expect(proposeMatch(rec({ ppe_number: null }), analyses).status).toBe('unmatched');
  });
  it('kilka punktów z tym samym numerem → ambiguous (ręczne przypisanie)', () => {
    const dup = [...analyses, { id: 'a3', ppe_number: 'PPE001' }];
    expect(proposeMatch(rec(), dup).status).toBe('ambiguous');
  });
});

describe('recordToBeforeFields', () => {
  it('mapuje tylko pola PRZED i identyfikację PPE', () => {
    const f = recordToBeforeFields(rec());
    expect(f.tariff_code_before).toBe('C21');
    expect(f.contracted_power_before_kw).toBe(40);
    expect(Object.keys(f).every((k) => !k.includes('_after'))).toBe(true);
  });
  it('przelicza kWh na MWh', () => {
    const f = recordToBeforeFields(rec({ tariff_code: 'G12' }));
    expect(f.consumption_before_zone1_mwh).toBe(12);
    expect(f.consumption_before_zone2_mwh).toBe(3);
  });
  it('pomija brakujące wartości (null nie zamieniany na 0)', () => {
    const f = recordToBeforeFields(rec({ contracted_power_kw: null, consumption: null }));
    expect(f.contracted_power_before_kw).toBeUndefined();
    expect(f.consumption_before_zone1_mwh).toBeUndefined();
  });
});

describe('diffAgainstAnalysis', () => {
  it('oznacza zmienione i niezmienione pola', () => {
    const a = { tariff_code_before: 'C21', contracted_power_before_kw: 50 } as EnergyAnalysis;
    const diffs = diffAgainstAnalysis(rec(), a);
    const tariff = diffs.find((d) => d.field === 'tariff_code_before')!;
    const power = diffs.find((d) => d.field === 'contracted_power_before_kw')!;
    expect(tariff.changed).toBe(false);
    expect(power.changed).toBe(true);
    expect(power.current).toBe(50);
    expect(power.incoming).toBe(40);
  });
  it('dla nowego punktu wszystkie pola są zmianami', () => {
    const diffs = diffAgainstAnalysis(rec(), null);
    expect(diffs.every((d) => d.changed)).toBe(true);
  });
});

describe('canApplyRecord', () => {
  it('ponowne zatwierdzenie jest zablokowane', () => {
    expect(canApplyRecord(rec())).toBe(true);
    expect(canApplyRecord(rec({ applied_at: '2026-10-18T00:00:00Z' }))).toBe(false);
  });
});
