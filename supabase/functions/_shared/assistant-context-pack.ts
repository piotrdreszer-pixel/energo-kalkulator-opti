// Zwężanie kontekstu asystenta AI do danych potrzebnych modelowi (bez surowego OCR i pełnych wierszy).
export const HISTORY_MAX_TOTAL = 15000;
export const HISTORY_MAX_EACH = 3000;

/** Tylko pola z zamkniętej listy (pomija kolumny techniczne i nadmiarowe JSON-y). */
export function pickPpeFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
}

const capJson = (v: unknown, max = 2000): unknown => {
  if (v == null) return null;
  const s = JSON.stringify(v);
  return s.length <= max ? v : `pominięto (${s.length} znaków — szczegóły na żądanie)`;
};

/** Zwarty rekord faktury: nagłówek + ograniczone JSON-y zużycia; bez stron źródłowych i migawek weryfikacji. */
export function compactInvoiceRecord(r: Record<string, unknown>): Record<string, unknown> {
  const doc = (r.analysis_documents ?? {}) as Record<string, unknown>;
  return {
    ppe: r.ppe_number ?? null, taryfa: r.tariff_code ?? null,
    okres: { od: r.period_from ?? null, do: r.period_to ?? null },
    moc_umowna_kw: r.contracted_power_kw ?? null, moc_maks_kw: r.max_power_kw ?? null,
    dokument: { typ: doc.doc_type ?? null, numer: doc.document_number ?? null, wystawca: doc.issuer ?? null },
    zuzycie: capJson(r.consumption), energia_bierna: capJson(r.reactive, 800), pozostale_oplaty: capJson(r.other_charges, 800),
  };
}

/** Zwarte podsumowanie faktur: wiersze pól i konflikty; bez surowych pozycji, dokumentów i komponentów rozliczenia. */
export function compactSettlementPlan(plan: { rows: unknown[]; conflicts: unknown[] } | null): unknown {
  if (!plan) return null;
  return {
    wiersze: (plan.rows as Record<string, unknown>[]).map(r => ({
      pole: r.field, etykieta: r.label, proponowana: r.value, z_faktur: r.invoiceValue,
      szacunek: r.estimated, obecna: r.current, reczna_korekta: r.manual === true ? true : undefined,
    })),
    konflikty_reczne: plan.conflicts,
  };
}

/** Ostatnie wiadomości mieszczące się w budżecie znaków; pojedyncze treści skracane. Zwraca kolejność chronologiczną. */
export function trimHistory(msgs: { role: string; content: string }[], maxTotal = HISTORY_MAX_TOTAL, maxEach = HISTORY_MAX_EACH): { role: string; content: string }[] {
  const kept: { role: string; content: string }[] = [];
  let total = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const content = m.content.length > maxEach ? m.content.slice(0, maxEach) + '…' : m.content;
    if (total + content.length > maxTotal && kept.length) break;
    total += content.length;
    kept.unshift({ role: m.role, content });
    if (total >= maxTotal) break;
  }
  return kept;
}
