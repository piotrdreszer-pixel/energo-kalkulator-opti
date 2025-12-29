// Tariff codes and their zone mappings
export const TARIFF_CODES = [
  // C-tariffs (below 40kW)
  { code: 'C11', label: 'C11 - jedna strefa', zones: 1, maxPower: 40 },
  { code: 'C12a', label: 'C12a - dwie strefy (dzień/noc)', zones: 2, maxPower: 40 },
  { code: 'C12b', label: 'C12b - dwie strefy (szczyt/poza)', zones: 2, maxPower: 40 },
  { code: 'C13', label: 'C13 - trzy strefy', zones: 3, maxPower: 40 },
  // B-tariffs (below 40kW)
  { code: 'B11', label: 'B11 - jedna strefa', zones: 1, maxPower: 40 },
  { code: 'B12', label: 'B12 - dwie strefy', zones: 2, maxPower: 40 },
  { code: 'B13', label: 'B13 - trzy strefy', zones: 3, maxPower: 40 },
  // C-tariffs (above 40kW)
  { code: 'C21', label: 'C21 - jedna strefa (>40kW)', zones: 1, minPower: 40 },
  { code: 'C22a', label: 'C22a - dwie strefy (>40kW)', zones: 2, minPower: 40 },
  { code: 'C22b', label: 'C22b - dwie strefy (>40kW)', zones: 2, minPower: 40 },
  { code: 'C23', label: 'C23 - trzy strefy (>40kW)', zones: 3, minPower: 40 },
  // B-tariffs (above 40kW)
  { code: 'B21', label: 'B21 - jedna strefa (>40kW)', zones: 1, minPower: 40 },
  { code: 'B22', label: 'B22 - dwie strefy (>40kW)', zones: 2, minPower: 40 },
  { code: 'B23', label: 'B23 - trzy strefy (>40kW)', zones: 3, minPower: 40 },
] as const;

export type TariffCode = typeof TARIFF_CODES[number]['code'];

export function getTariffInfo(code: string) {
  return TARIFF_CODES.find(t => t.code === code) || TARIFF_CODES[0];
}

export function getZonesCount(tariffCode: string): number {
  const tariff = getTariffInfo(tariffCode);
  return tariff.zones;
}

export function isLowVoltageTariff(tariffCode: string): boolean {
  return tariffCode.startsWith('C1') || tariffCode.startsWith('B1');
}

export function isHighVoltageTariff(tariffCode: string): boolean {
  return tariffCode.startsWith('C2') || tariffCode.startsWith('B2');
}

export interface PowerValidationResult {
  valid: boolean;
  error?: string;
}

export function validateContractedPower(tariffCode: string, powerKw: number): PowerValidationResult {
  if (isLowVoltageTariff(tariffCode)) {
    if (powerKw > 40) {
      return {
        valid: false,
        error: 'Dla taryf C1/B1 moc umowna nie może przekraczać 40 kW.',
      };
    }
  }
  
  if (isHighVoltageTariff(tariffCode)) {
    if (powerKw <= 40) {
      return {
        valid: false,
        error: 'Dla taryf C2/B2 moc umowna musi być większa niż 40 kW.',
      };
    }
  }
  
  return { valid: true };
}

export const ZONE_LABELS = {
  1: ['Całodobowa'],
  2: ['Szczyt', 'Poza szczytem'],
  3: ['Szczyt', 'Strefa pośrednia', 'Dolina'],
} as const;

export function getZoneLabels(zonesCount: number): readonly string[] {
  return ZONE_LABELS[zonesCount as keyof typeof ZONE_LABELS] || ZONE_LABELS[1];
}
