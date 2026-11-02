export const INCOMPLETE_PO_MESSAGE = 'Nie można wyznaczyć oszczędności — uzupełnij wariant PO';

/** Compatibility helper: absent inputs contribute zero and never block savings. */
export function missingPoFields(_row: Record<string, unknown>): string[] {
  return [];
}