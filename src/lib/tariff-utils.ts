// Tariff codes and their zone mappings - NO descriptive zone hints in labels
export const TARIFF_CODES = [
  // C-tariffs (below 40kW)
  { code: 'C11', zones: 1, maxPower: 40 },
  { code: 'C12a', zones: 2, maxPower: 40 },
  { code: 'C12b', zones: 2, maxPower: 40 },
  { code: 'C13', zones: 3, maxPower: 40 },
  // B-tariffs (below 40kW)
  { code: 'B11', zones: 1, maxPower: 40 },
  { code: 'B12', zones: 2, maxPower: 40 },
  { code: 'B13', zones: 3, maxPower: 40 },
  // C-tariffs (above 40kW)
  { code: 'C21', zones: 1, minPower: 40 },
  { code: 'C22a', zones: 2, minPower: 40 },
  { code: 'C22b', zones: 2, minPower: 40 },
  { code: 'C23', zones: 3, minPower: 40 },
  // B-tariffs (above 40kW)
  { code: 'B21', zones: 1, minPower: 40 },
  { code: 'B22', zones: 2, minPower: 40 },
  { code: 'B23', zones: 3, minPower: 40 },
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

// Month labels in Polish
export const MONTH_LABELS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
] as const;

// Calculate period length in months
export function calculatePeriodMonths(periodFrom: string | null, periodTo: string | null): number {
  if (!periodFrom || !periodTo) return 12; // Default to 12 months
  
  const from = new Date(periodFrom);
  const to = new Date(periodTo);
  
  const yearDiff = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  const dayDiff = to.getDate() - from.getDate();
  
  // Calculate total months including partial months
  let totalMonths = yearDiff * 12 + monthDiff;
  
  // Add 1 because period includes both start and end month
  totalMonths += 1;
  
  // Adjust for partial months if end day is before start day
  if (dayDiff < 0) {
    totalMonths -= 1;
  }
  
  return Math.max(1, totalMonths);
}
