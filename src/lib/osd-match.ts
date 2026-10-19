// Dopasowanie nazwy OSD odczytanej z faktury do rekordu osd_operators.
// Kontrolowana lista aliasów — nigdy nie tworzymy nowych operatorów z odpowiedzi AI.

export interface OsdOption { id: string; code: string; name: string }

export type OsdMatchStatus = 'matched' | 'uncertain' | 'none';

/** Aliasy per kod operatora (porównywane po normalizacji). */
export const OSD_ALIASES: Record<string, string[]> = {
  PGE: ['pge dystrybucja', 'pge dystrybucja sa', 'pge dystr'],
  TAURON: ['tauron dystrybucja', 'tauron dystrybucja sa', 'tauron dystr'],
  ENEA: ['enea operator', 'enea operator sp z oo', 'enea operator spzoo'],
  ENERGA: ['energa operator', 'energaoperator', 'energa operator sa'],
  STOEN: ['stoen operator', 'stoen operator sp z oo', 'innogy stoen operator', 'rwe stoen operator'],
};

/** Nazwy sprzedawców — same w sobie nie wskazują OSD. */
const SELLER_ONLY = ['pge obrot', 'tauron sprzedaz', 'enea sa', 'energa obrot', 'eon polska', 'e on polska', 'eon', 'e on', 'innogy polska', 'pge energia', 'tauron'];

export function normalizeOsdName(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchOsd(
  osdName: string | null | undefined,
  operators: OsdOption[]
): { osdId: string | null; status: OsdMatchStatus } {
  const n = normalizeOsdName(osdName);
  if (!n) return { osdId: null, status: 'none' };
  const hits = operators.filter((op) => {
    const aliases = [normalizeOsdName(op.name), ...(OSD_ALIASES[op.code.toUpperCase()] || [])];
    return aliases.some((a) => a && (n === a || n.startsWith(a + ' ') || n.startsWith(a)));
  });
  if (hits.length === 1) return { osdId: hits[0].id, status: 'matched' };
  if (hits.length > 1) return { osdId: null, status: 'uncertain' };
  // Nazwa sprzedawcy lub nieznany operator — wymagany ręczny wybór
  return { osdId: null, status: SELLER_ONLY.includes(n) ? 'uncertain' : 'none' };
}
