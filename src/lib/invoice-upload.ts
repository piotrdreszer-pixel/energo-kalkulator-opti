// Przebieg przesyłania faktury: kroki i komunikaty błędów (czyste funkcje).

export type UploadStage = 'queued' | 'uploading' | 'saving' | 'reading' | 'done' | 'error';

export interface UploadItem {
  key: string;
  file: File;
  name: string;
  docId: string;
  hash?: string;
  stage: UploadStage;
  /** Kroki już wykonane — ponowienie zaczyna od pierwszego niewykonanego (bez duplikatów). */
  uploaded: boolean;
  saved: boolean;
  message?: string;
}

export const STAGE_LABELS: Record<UploadStage, string> = {
  queued: 'Oczekuje',
  uploading: 'Przesyłanie',
  saving: 'Zapisywanie',
  reading: 'Odczytywanie',
  done: 'Przesłano — odczyt w toku',
  error: 'Błąd',
};

export const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];
export const isAllowedFile = (name: string) => ALLOWED_EXT.some((e) => name.toLowerCase().endsWith(e));

/** Komunikat dla użytkownika z odpowiedzi funkcji serwerowej (status + treść), bez surowych błędów. */
export function functionErrorMessage(status: number | null | undefined, body: unknown): string {
  const msg = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error : null;
  if (status === 401) return 'Sesja wygasła — zaloguj się ponownie.';
  if (status === 402) return msg || 'Brak kredytów AI w workspace. Doładuj kredyty i ponów odczyt.';
  if (status === 403) return msg || 'Brak dostępu do funkcji Import faktur.';
  if (status === 409) return msg || 'Dokument jest już odczytywany.';
  if (status === 429) return msg || 'Przekroczono limit zapytań AI. Ponów za chwilę.';
  if (status === 504 || status === 408) return 'Przekroczono czas odpowiedzi. Ponów odczyt.';
  if (status && status >= 500) return msg || 'Usługa odczytu chwilowo niedostępna. Ponów za kilka minut.';
  return msg || 'Nie udało się uruchomić odczytu.';
}

/** Kod/komunikat z błędu storage lub bazy → zrozumiały tekst. */
export function storageErrorMessage(e: { message?: string; statusCode?: string | number } | null | undefined): string {
  const m = e?.message || '';
  if (/row-level security|unauthorized|403/i.test(m) || String(e?.statusCode) === '403') return 'Brak uprawnienia do przesłania pliku (Import faktur).';
  if (/exists|duplicate/i.test(m)) return 'Ten plik został już przesłany.';
  if (/too large|payload/i.test(m)) return 'Plik jest za duży.';
  return m || 'Nieznany błąd przesyłania.';
}

export interface DocsSummary { total: number; approved: number; toReview: number; reading: number; errors: number; allApproved: boolean }

/** Trwałe podsumowanie listy dokumentów importu. */
export function summarizeDocs(docs: { status: string }[]): DocsSummary {
  const c = (s: string[]) => docs.filter((d) => s.includes(d.status)).length;
  const approved = c(['approved']);
  return {
    total: docs.length, approved, toReview: c(['needs_review']), reading: c(['pending', 'processing']), errors: c(['error']),
    allApproved: docs.length > 0 && approved === docs.length,
  };
}

/** Cel przycisku „Przejdź do analizy”: jeden PPE → formularz, kilka/zero → lista PPE analizy. */
export function analysisTarget(projectId: string, groupId: string, ppeIds: string[]): string {
  return ppeIds.length === 1 ? `/projects/${projectId}/analysis/${ppeIds[0]}` : `/projects/${projectId}/analyses/${groupId}`;
}
