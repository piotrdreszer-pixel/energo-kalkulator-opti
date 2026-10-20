import { AlertTriangle } from 'lucide-react';
import { useActiveEstimates, useInvoiceFacts } from '@/hooks/useInvoiceFacts';
import { ESTIMATE_FIELD_LABELS, incompletePo } from '@/lib/invoice-gaps';

const d = (s: string) => s.slice(0, 10).split('-').reverse().join('.');
const n = (v: number, unit: string) => `${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: unit === 'MWh' ? 4 : 2 })} ${unit}`;

/** Luki w zatwierdzonych fakturach i aktywne szacunki tego PPE (oznaczenie w formularzu). */
export function InvoiceGapsNotice({ groupId, row, canImport }: { groupId?: string | null; row?: Record<string, unknown> | null; canImport: boolean }) {
  const est = useActiveEstimates(row?.id as string | undefined);
  const facts = useInvoiceFacts(groupId, row, canImport);
  const gaps = facts.data?.settlement.gaps ?? [];
  const list = est.data ?? [];
  if (!gaps.length && !list.length) return null;
  return <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm space-y-1" data-testid="invoice-gaps-notice">
    {gaps.length > 0 && <p className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
      Brak faktur za: {gaps.map(g => `${d(g.from)} – ${d(g.to)}`).join(', ')}.</p>}
    {list.length > 0 && <div><p className="font-medium">Wartości szacunkowe (nie z faktur):</p>
      <ul className="list-disc pl-5">{list.map(e => <li key={e.id}>{ESTIMATE_FIELD_LABELS[e.field] ?? e.field}: w tym szacunek {n(e.value, e.unit)} za {d(e.period_from)} – {d(e.period_to)} (średnia dobowa z sąsiednich rozliczeń)</li>)}</ul>
      <p className="text-xs text-muted-foreground">Szacunek zużycia nie potwierdza Pmax ani bezpiecznej mocy umownej.</p></div>}
  </div>;
}

/** Ostrzeżenie: koszt w PRZED, a pusty w PO — oszczędność pozorna. */
export function IncompletePoNotice({ row }: { row: Record<string, unknown> }) {
  const missing = incompletePo(row);
  if (!missing.length) return null;
  return <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm" data-testid="incomplete-po">
    <p className="font-medium text-destructive">Nie można wyznaczyć oszczędności — uzupełnij wariant PO</p>
    <p>Brakujące dane lub niepotwierdzone zera PO: {missing.join(', ')}. Uzupełnij wariant PO albo wyłącz te składniki z wyliczeń.</p>
  </div>;
}
