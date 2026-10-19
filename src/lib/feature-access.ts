export interface FeatureAccess { invoice_import?: boolean | null; multi_ppe?: boolean | null }
export const MULTI_PPE_LOCK_MESSAGE = 'Edycja tej analizy wymaga dostępu do funkcji Analizy wielu PPE';
export function featureRules(access: FeatureAccess | null | undefined, count: number) {
  const multiPpe = access?.multi_ppe === true;
  const readOnly = count > 1 && !multiPpe;
  return { multiPpe, readOnly, canImport: access?.invoice_import === true && !readOnly, canAddPpe: !readOnly && (multiPpe || count === 0) };
}
export function canDeleteClientData(actorId: string | null, creatorId: string | null, isAdmin: boolean, isOwner: boolean) {
  return !!actorId && (actorId === creatorId || isAdmin || isOwner);
}