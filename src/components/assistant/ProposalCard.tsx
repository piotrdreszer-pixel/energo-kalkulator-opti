import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Check, Loader2, RefreshCw, Undo2, X } from 'lucide-react';
import { buildProposalPreview, isProposalStale, PROPOSAL_FIELDS, PROPOSAL_SOURCE_LABELS } from '@/lib/assistant-proposal';
import { formatCurrency, formatNumber } from '@/lib/calculation-utils';
import { ESTIMATE_FIELD_LABELS } from '@/lib/invoice-gaps';

const KIND_TITLE: Record<string, string> = { po: 'Propozycja zmiany PO', period: 'Zmiana okresu analizy (z faktur)', estimate: 'Szacunek brakującego okresu', estimate_replace: 'Zastąpienie szacunku fakturą' };
const label = (f: string) => PROPOSAL_FIELDS[f as keyof typeof PROPOSAL_FIELDS]?.label ?? ESTIMATE_FIELD_LABELS[f] ?? f;

const db = supabase as any;
const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? 'brak'
  : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('.')
  : Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 4 }));

export function ProposalCard({ proposalId, dirtyFor, onSaveForm }: { proposalId: string; dirtyFor?: string | null; onSaveForm?: () => Promise<boolean> }) {
  const qc = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [askSave, setAskSave] = useState(false);

  const q = useQuery({
    queryKey: ['ai-proposal', proposalId],
    queryFn: async () => {
      const { data: p, error } = await db.from('ai_proposals').select('*').eq('id', proposalId).maybeSingle();
      if (error || !p) throw new Error('Brak dostępu do propozycji');
      const [{ data: row }, { data: ch }] = await Promise.all([
        supabase.from('energy_analyses').select('*').eq('id', p.analysis_id).maybeSingle(),
        p.applied_change_id ? db.from('ai_applied_changes').select('*').eq('id', p.applied_change_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!row) throw new Error('Brak dostępu do PPE');
      return { p, row: row as Record<string, unknown>, ch };
    },
  });

  if (q.isPending) return <div className="mt-2"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (q.error || !q.data) return <p className="mt-2 text-xs text-destructive">Propozycja jest niedostępna (brak uprawnień lub została usunięta).</p>;
  const { p, row, ch } = q.data;
  const changes = (p.changes ?? []) as { field: string; value: number }[];
  const stale = p.status === 'pending' && isProposalStale(row.updated_at as string, p.base_updated_at);
  const preview = buildProposalPreview(row, p.status === 'pending' ? changes : []);
  const appliedPreview = p.status === 'applied' ? buildProposalPreview(row, []) : null;
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['ai-proposal', proposalId] }),
      qc.invalidateQueries({ queryKey: ['analysis', p.analysis_id] }),
      qc.invalidateQueries({ queryKey: ['ai-group-ppes'] }), qc.invalidateQueries({ queryKey: ['group-ppe'] }),
      qc.invalidateQueries({ queryKey: ['analyses'] }), qc.invalidateQueries({ queryKey: ['analysis-estimates'] }), qc.invalidateQueries({ queryKey: ['invoice-facts'] }), qc.invalidateQueries({ queryKey: ['ai-history'] }),
    ]);
  };
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ text: (e as Error).message || 'Operacja nie powiodła się.', error: true }); }
    finally { lock.current = false; setBusy(false); }
  };

  const apply = () => run(async () => {
    if (dirtyFor === p.analysis_id && !askSave) { setAskSave(true); return; }
    const { data, error } = await db.rpc('ai_apply_proposal', { _id: proposalId, _expected_updated_at: row.updated_at });
    if (error) throw new Error(error.message);
    await refresh();
    if (data?.status === 'stale') setMsg({ text: 'Dane PPE zmieniły się od przygotowania propozycji. Przelicz podgląd i zatwierdź ponownie.', error: true });
    else if (data?.status === 'applied' || data?.status === 'already_applied') setMsg({ text: 'Zastosowano zmianę. Wynik poniżej odczytano ponownie z zapisanych danych.' });
  });
  const saveThenApply = () => run(async () => {
    const saved = await onSaveForm?.();
    setAskSave(false);
    if (!saved) throw new Error('Formularz nie został zapisany — propozycji nie zastosowano.');
    await refresh();
    setMsg({ text: 'Formularz zapisano. Dane się zmieniły, więc przelicz podgląd i zatwierdź ponownie.' });
  });
  const rebase = () => run(async () => { const { error } = await db.rpc('ai_refresh_proposal', { _id: proposalId }); if (error) throw new Error(error.message); await refresh(); });
  const reject = () => run(async () => { const { error } = await db.rpc('ai_reject_proposal', { _id: proposalId }); if (error) throw new Error(error.message); await refresh(); });
  const undo = () => run(async () => {
    const { data, error } = await db.rpc('ai_undo_change', { _id: ch.id });
    if (error) throw new Error(error.message);
    await refresh();
    if (data?.status === 'conflict') setMsg({ text: `Nie cofnięto: pola zmieniono później (${(data.fields as string[]).map(label).join(', ')}). Nowsza praca pozostała bez zmian.`, error: true });
    else setMsg({ text: 'Cofnięto zmianę — przywrócono poprzednie wartości tych pól.' });
  });

  const status = { pending: stale ? 'Nieaktualna' : 'Oczekuje na decyzję', applied: 'Zastosowano', rejected: 'Odrzucona', undone: 'Cofnięta' }[p.status as string];
  const fields = p.status === 'pending' ? preview.fields : changes.map(c => ({ field: c.field, label: buildProposalPreview(row, [c]).fields[0].label, unit: buildProposalPreview(row, [c]).fields[0].unit,
    current: ch?.fields?.[c.field]?.before ?? p.before?.[c.field], proposed: c.value, replaces: null as string | null }));

  return <div className="mt-3 min-w-0 max-w-full rounded-md border bg-background p-3 text-xs space-y-2" data-testid="ai-proposal">
    <div className="flex justify-between gap-2"><span className="font-semibold">{KIND_TITLE[p.kind ?? 'po'] ?? KIND_TITLE.po}</span><span className="text-muted-foreground">{status}</span></div>
    <p className="text-muted-foreground">PPE {String(row.ppe_number || row.name || '')}</p>
    <ul className="space-y-1">{fields.map(f => <li key={f.field}>{f.label}: <b>{fmt(f.current)} → {fmt(f.proposed)}</b> {f.unit}
      {f.replaces && <span className="block text-destructive">Zastąpi {f.replaces}.</span>}</li>)}</ul>
    <p>Źródło: {PROPOSAL_SOURCE_LABELS[p.source as keyof typeof PROPOSAL_SOURCE_LABELS] ?? p.source}{p.assumption ? ` — ${p.assumption}` : ''}</p>
    {(p.kind === 'estimate') && <p className="text-destructive">Wartość szacunkowa (średnia dobowa z sąsiednich rozliczeń) — przechowywana osobno od danych z faktur; nie potwierdza Pmax ani bezpiecznej mocy umownej.</p>}
    {p.is_simulation && <p className="text-destructive">Zmiana mocy to symulacja — jej wystarczalność nie została potwierdzona.</p>}
    {p.status === 'pending' && <div className="space-y-0.5 border-t pt-2">
      <p>Okres: {String(preview.periodFrom ?? 'brak')} – {String(preview.periodTo ?? 'brak')} ({preview.periodMonths} mies.)</p>
      <p>Obecny koszt PO: {formatCurrency(preview.currentAfter)}</p>
      <p>Proponowany koszt PO: <b>{formatCurrency(preview.proposedAfter)}</b></p>
      <p>Różnica względem obecnego PO: <b className={preview.extraBenefit >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(Math.abs(preview.extraBenefit))} {preview.extraBenefit >= 0 ? 'mniej' : 'więcej'}</b></p>
      <p>{preview.savingsAvailable ? 'Łączna oszczędność względem PRZED po zmianie:' : ''} <b className={preview.savingsAfterChange >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(Math.abs(preview.savingsAfterChange))}{preview.savingsPercentAfterChange !== null ? ` (${formatNumber(Math.abs(preview.savingsPercentAfterChange), 2)}%)` : ''}</b></p>
      {preview.issues.length > 0 && <div className="text-destructive"><p>Braki danych — wynik niepełny:</p><ul className="list-disc pl-4">{preview.issues.map(i => <li key={i}>{i}</li>)}</ul></div>}
    </div>}
    {appliedPreview && <div className="border-t pt-2"><p>Potwierdzony wynik po zapisie: PO {formatCurrency(appliedPreview.currentAfter)}, oszczędność względem PRZED {formatCurrency(Math.abs(appliedPreview.savingsAfterChange))}</p></div>}
    {stale && !msg && <p className="text-destructive">Dane PPE zmieniły się od przygotowania propozycji — przelicz podgląd i zatwierdź ponownie.</p>}
    {msg && <p role="status" className={msg.error ? 'text-destructive' : 'text-success'}>{msg.text}</p>}
    {p.status === 'pending' && askSave && <div className="rounded border p-2 space-y-2"><p>Formularz ma niezapisane zmiany. Zapisz je najpierw albo zrezygnuj z zastosowania.</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={saveThenApply} disabled={busy}>Zapisz formularz</Button><Button size="sm" variant="outline" onClick={() => setAskSave(false)} disabled={busy}>Nie stosuj teraz</Button></div></div>}
    {p.status === 'pending' && !askSave && <div className="flex flex-wrap gap-2 pt-1">
      {stale ? <Button size="sm" onClick={rebase} disabled={busy}><RefreshCw className="h-3 w-3 mr-1" />Przelicz na aktualnych danych</Button>
        : <Button size="sm" onClick={apply} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}{(p.kind ?? 'po') === 'po' ? 'Zastosuj do PO' : 'Zastosuj'}</Button>}
      <Button size="sm" variant="outline" onClick={reject} disabled={busy}><X className="h-3 w-3 mr-1" />Odrzuć</Button></div>}
    {p.status === 'applied' && ch && !ch.undone_at && <Button size="sm" variant="outline" onClick={undo} disabled={busy}><Undo2 className="h-3 w-3 mr-1" />Cofnij zmianę</Button>}
  </div>;
}
