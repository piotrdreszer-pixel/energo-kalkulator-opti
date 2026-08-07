export type ReportComponentKey =
  | 'activeEnergy'
  | 'distribution'
  | 'contractedPower'
  | 'capacity'
  | 'reactive'
  | 'handling'
  | 'fixedDistribution';

export const REPORT_COMPONENTS: { key: ReportComponentKey; label: string }[] = [
  { key: 'activeEnergy', label: 'Energia czynna' },
  { key: 'distribution', label: 'Składnik zmienny stawki sieciowej' },
  { key: 'contractedPower', label: 'Opłata za moc umowną' },
  { key: 'capacity', label: 'Opłata mocowa' },
  { key: 'reactive', label: 'Energia bierna' },
  { key: 'handling', label: 'Opłata handlowa' },
  { key: 'fixedDistribution', label: 'Suma pozostałych opłat' },
];

export function isComponentVisible(
  hidden: string[] | null | undefined,
  key: ReportComponentKey,
): boolean {
  return !(hidden || []).includes(key);
}
