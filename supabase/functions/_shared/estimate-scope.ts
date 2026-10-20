/** A mention inside a prohibition is not authorization to estimate a cost. */
export function requestedEstimateScope(message: string, scope: 'zuzycie' | 'koszty', component: 'mocowa' | 'bierna' | null): boolean {
  const affirmative = message.split(/[.!;]/).filter(part => !/(^|\s)(nie|bez)\s/i.test(part)).join(' ');
  if (scope === 'zuzycie') return /(zuży|zuzy)/i.test(affirmative);
  if (!component) return false;
  return component === 'mocowa' ? /mocow/i.test(affirmative) : /biern/i.test(affirmative);
}