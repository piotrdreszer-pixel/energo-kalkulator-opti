import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, ArrowLeft, ClipboardList, Loader2, Sparkles } from 'lucide-react';
import type { EnergyAnalysis } from '@/types/database';
import { buildSettlement, settlementProposals, matchesStored, type Component } from '@/lib/invoice-settlement';
import type { ValueSources } from '@/lib/value-sources';
import { formatCurrency } from '@/lib/calculation-utils';
import { requireFeature, useGroupFeatureAccess } from '@/hooks/useFeatureAccess';
import { loadGroupInvoices, useActiveEstimates } from '@/hooks/useInvoiceFacts';
import { gapMessage, itemStatus } from '@/lib/invoice-summary';
import { summarizeDocs } from '@/lib/invoice-upload';
import { openAssistant } from '@/components/assistant/AssistantPanel';

const fmt = (v: number | null | undefined, d = 3) =>
  v == null ? 'brak danych' : v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: d });
const per = (a: string | null, b: string | null) => `${a ?? '?'} – ${b ?? '?'}`;
const STREAM: Record<string, string> = { sales: 'sprzedaż', distribution: 'dystrybucja', both: 'kompleksowa' };

const OPEN_EVENT = 'open-invoice-summary';
/** Otwiera „Podsumowanie danych z faktur” (np. po zakończeniu odczytu paczki albo z formularza PPE). */
export function openInvoiceSummary(ppeId?: string) { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { ppeId } })); }

interface Props { projectId: string; groupId: string; ppes: EnergyAnalysis[]; onApplied: () => void }

export default function InvoiceSettlementDialog({ projectId, groupId, ppes, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [ppeId, setPpeId] = useState<string>('');
  const navigate = useNavigate();
  useEffect(() => {
    const h = (e: Event) => { const id = (e as CustomEvent).detail?.ppeId; setPpeId(id || ''); setOpen(true); };
    window.addEventListener(OPEN_EVENT, h); return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);
  useEffect(() => { if (open && !ppeId && ppes.length === 1) setPpeId(ppes[0].id); }, [open, ppes, ppeId]);

  const data = useQuery({
    queryKey: ['group-settlement', groupId],
    enabled: open,
    queryFn: () => loadGroupInvoices(groupId),
  });

  const all = useMemo(() => {
    if (!data.data) return [];
    return ppes.map((a) => ({ a, s: buildSettlement({ ppeNumber: a.ppe_number || '', analysisId: a.id, ...data.data }) }));
  }, [data.data, ppes]);
  const current = all.find((x) => x.a.id === ppeId);
  const docSum = summarizeDocs(data.data?.docs || []);
  const openReview = (docId: string) => { setOpen(false); navigate(`/projects/${projectId}/analyses/${groupId}?review=${docId}`); };
  const goToAnalysis = (id: string) => { setOpen(false); navigate(`/projects/${projectId}/analysis/${id}`); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ClipboardList className="mr-2 h-4 w-4" />Podsumowanie danych z faktur</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Podsumowanie danych z faktur</DialogTitle>
          <DialogDescription>
            Zestawienie z faktur tej analizy (netto). Nowe dane nie trafiają do kalkulatora same — zastosujesz je przyciskiem „Zastosuj do PRZED”. To nie jest wynik kalkulatora „według stawek”.
          </DialogDescription>
        </DialogHeader>
        {data.isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : data.error ? (
          <p className="text-destructive">Nie udało się wczytać danych z faktur.</p>
        ) : (
          <div className="space-y-6 min-w-0">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge>zatwierdzone: {docSum.approved}</Badge>
              {docSum.toReview > 0 && <Badge variant="secondary">nowe, do zatwierdzenia: {docSum.toReview}</Badge>}
              {docSum.reading > 0 && <Badge variant="secondary">w odczycie: {docSum.reading}</Badge>}
              {docSum.errors > 0 && <Badge variant="destructive">nieodczytane: {docSum.errors}</Badge>}
            </div>
            {(docSum.errors > 0 || docSum.reading > 0) && (
              <p className="text-sm flex gap-1 items-start"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                Część dokumentów nie została odczytana — zestawienie jest niepełne.
                {(data.data?.docs || []).filter((d) => d.status === 'error').map((d) => <button key={d.id} type="button" className="underline ml-1" onClick={() => openReview(d.id)}>{d.file_name}</button>)}
              </p>
            )}
            {current ? (
              <>
                {ppes.length > 1 && <Button variant="ghost" size="sm" onClick={() => setPpeId('')}><ArrowLeft className="mr-1 h-4 w-4" />Wszystkie PPE</Button>}
                <PpeSettlement analysis={current.a} s={current.s} onOpenReview={openReview} onGoToAnalysis={() => goToAnalysis(current.a.id)}
                  onApplied={() => { onApplied(); data.refetch(); }} onAssistant={() => setOpen(false)} />
              </>
            ) : (
              <>
                <PpeList rows={all} onOpen={setPpeId} />
                <MultiSummary rows={all} />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PpeList({ rows, onOpen }: { rows: { a: EnergyAnalysis; s: ReturnType<typeof buildSettlement> }[]; onOpen: (id: string) => void }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Brak PPE w tej analizie.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground text-xs"><th>PPE</th><th>Adres</th><th>Okres z faktur</th><th>Status</th><th /></tr></thead>
      <tbody>
        {rows.map(({ a, s }) => {
          const has = s.entries.length || s.pending.length;
          const status = !has ? <Badge variant="outline">brak faktur</Badge>
            : s.issues.length || s.blocked.length || s.gaps.length ? <Badge variant="secondary">niepełne / do decyzji</Badge>
            : s.pending.length ? <Badge variant="secondary">nowe do zatwierdzenia</Badge> : <Badge>kompletne</Badge>;
          return (
            <tr key={a.id} className="border-t align-top">
              <td className="py-1 break-all">{a.ppe_number || a.name}</td>
              <td className="break-words">{a.ppe_address || '—'}</td>
              <td className="whitespace-nowrap">{s.proposedPeriod ? per(s.proposedPeriod.from, s.proposedPeriod.to) : '—'}</td>
              <td>{status}</td>
              <td className="text-right"><Button size="sm" variant="outline" onClick={() => onOpen(a.id)}>Szczegóły</Button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MultiSummary({ rows }: { rows: { a: EnergyAnalysis; s: ReturnType<typeof buildSettlement> }[] }) {
  const sel = rows.filter((r) => r.a.include_in_project_report && r.s.entries.some((e) => e.included));
  if (!sel.length) return null;
  const periods = new Set(sel.map((r) => r.s.proposedPeriod ? `${r.s.proposedPeriod.from}|${r.s.proposedPeriod.to}` : '?'));
  const incomplete = sel.some((r) => r.s.issues.length > 0) || periods.size > 1;
  const total = sel.reduce((s, r) => s + r.s.totalNet, 0);
  return (
    <div className="rounded-md border p-3 text-sm">
      <p className="font-medium mb-2">Podsumowanie PPE wybranych do raportu tej analizy</p>
      <table className="w-full">
        <tbody>
          {sel.map((r) => (
            <tr key={r.a.id} className="border-t">
              <td className="py-1">{r.a.name}</td>
              <td>{r.s.proposedPeriod ? per(r.s.proposedPeriod.from, r.s.proposedPeriod.to) : 'brak okresu'}</td>
              <td>{r.s.issues.length ? <Badge variant="secondary">braki/konflikty: {r.s.issues.length}</Badge> : <Badge>kompletne</Badge>}</td>
              <td className="text-right">{formatCurrency(r.s.totalNet)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="py-1" colSpan={3}>Suma kosztów z faktur (netto)</td>
            <td className="text-right">{formatCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
      {incomplete && (
        <p className="mt-2 text-warning-foreground flex gap-1 items-start text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Suma niepełna lub z różnych okresów{periods.size > 1 ? ' (PPE mają różne okresy)' : ''} — nie jest kompletnym wynikiem rocznym.
        </p>
      )}
    </div>
  );
}

function Components({ list, onOpenReview }: { list: Component[]; onOpenReview: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div>
      <button type="button" className="text-xs text-primary underline" onClick={() => setOpen(!open)}>{open ? 'Ukryj składniki' : 'Pokaż składniki'}</button>
      {open && (
        <table className="w-full text-xs mt-1">
          <tbody>
            {list.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-2">{c.docName}</td>
                <td className="pr-2 whitespace-nowrap">{per(c.period_from, c.period_to)}</td>
                <td className="pr-2">{c.label}</td>
                <td className="pr-2 text-right whitespace-nowrap">{c.value == null ? 'brak kwoty' : `${fmt(c.value, 4)} ${c.unit}`}</td>
                <td><button type="button" className="text-primary underline" onClick={() => onOpenReview(c.docId)}>Edytuj import</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PpeSettlement({ analysis, s, onOpenReview, onApplied, onGoToAnalysis, onAssistant }: {
  analysis: EnergyAnalysis; s: ReturnType<typeof buildSettlement>; onOpenReview: (id: string) => void; onApplied: () => void;
  onGoToAnalysis: () => void; onAssistant: () => void;
}) {
  const { toast } = useToast();
  const access = useGroupFeatureAccess(analysis.analysis_group_id);
  const estimates = useActiveEstimates(analysis.id);
  const [busy, setBusy] = useState(false);
  const [confirmPeriod, setConfirmPeriod] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [overrideManual, setOverrideManual] = useState<Set<string>>(new Set());
  const proposals = settlementProposals(s);
  const sources = (analysis.value_sources || {}) as ValueSources;
  const a = analysis as unknown as Record<string, unknown>;
  const estBy = (field: string) => (estimates.data || []).filter((e) => e.field === field);
  // Szacunek jest osobną częścią wartości przyjętej do analizy: łącznie = z faktur + szacunek (nie nadpisujemy go wartością z samych faktur).
  const rows = proposals.map((p) => {
    const est = estBy(p.field);
    const estimated = /_mwh$/.test(p.field) || /^(capacity_charge|reactive_energy_cost)_before$/.test(p.field) ? est.reduce((x, e) => x + Number(e.value), 0) : 0;
    const total = est.length && estimated ? p.value + estimated : p.value;
    const cur = a[p.field];
    const manual = sources[p.field]?.source === 'manual' && cur != null && !matchesStored(p.field, total, cur);
    const status = itemStatus({ hasInvoiceValue: true, estimated: est.length > 0, conflict: manual });
    return { ...p, invoiceValue: p.value, estimated: est.length ? estimated : null, value: total, current: cur, manual, status };
  });
  const gapText = gapMessage(s.proposedPeriod, s.gaps);
  const hasEstimates = (estimates.data || []).length > 0;
  const osd = Array.from(new Set(s.entries.map((e) => e.record.osd_name).filter(Boolean)));
  const needDecision = s.entries.filter((e) => !e.included).length;
  const askAssistant = () => {
    onAssistant();
    openAssistant(`Uzupełnij brakujący okres dla PPE ${analysis.ppe_number || analysis.name} na podstawie podsumowania danych z faktur. ${gapText ?? ''} Najpierw zaproponuj symulację: jaki okres uzupełniasz, na podstawie których rozliczeń, jaką metodą, jakie wartości możesz oszacować i które koszty pozostaną nieuzupełnione. Nic nie zapisuj bez mojej akceptacji.`);
  };

  if (!s.entries.length && !s.pending.length) {
    return <p className="text-sm text-muted-foreground">Brak faktur przypisanych do tego PPE w tej analizie.</p>;
  }

  const applyPeriod = async () => {
    if (!s.proposedPeriod || !access.canImport) return;
    setBusy(true);
    const { error } = await supabase.rpc('apply_invoice_period', { _analysis_id: analysis.id, _from: s.proposedPeriod.from, _to: s.proposedPeriod.to });
    setBusy(false); setConfirmPeriod(false);
    if (error) toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zapisać okresu.' });
    else { toast({ title: 'Zastosowano okres z faktur' }); onApplied(); }
  };

  const applyBefore = async () => {
    if (!access.canImport) return;
    try { await requireFeature('invoice_import', analysis.analysis_group_id); }
    catch { toast({ variant: 'destructive', title: 'Brak dostępu do zastosowania faktur' }); return; }
    const write: Record<string, unknown> = {};
    const nextSources: ValueSources = { ...sources };
    for (const r of rows) {
      if (r.manual && !overrideManual.has(r.field)) continue;
      write[r.field] = r.value;
      nextSources[r.field] = { source: 'document', item_ref: 'settlement' };
    }
    if (!Object.keys(write).length) { toast({ title: 'Brak zmian do zapisania' }); return; }
    setBusy(true);
    const { error } = await supabase.from('energy_analyses').update({ ...write, value_sources: nextSources } as never).eq('id', analysis.id);
    if (error) { setBusy(false); toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zapisać wartości.' }); return; }
    const { data: back } = await supabase.from('energy_analyses').select(Object.keys(write).join(',')).eq('id', analysis.id).maybeSingle();
    setBusy(false);
    const rb = (back as unknown as Record<string, unknown> | null) ?? {};
    const bad = Object.entries(write).filter(([f, v]) => !matchesStored(f, v as number | null, rb[f]));
    const label = (f: string) => rows.find((r) => r.field === f)?.label ?? f;
    const unit = (f: string) => (/_mwh$/.test(f) ? ' MWh' : '');
    if (bad.length) toast({
      variant: 'destructive', title: 'Odczyt kontrolny niezgodny',
      description: bad.map(([f, v]) => `${label(f)}: próbowano zapisać ${fmt(v as number, 6)}${unit(f)}, odczytano ${rb[f] == null ? 'brak' : fmt(Number(rb[f]), 6)}${unit(f)}`).join('; ')
        + '. Zapis został wykonany — sprawdź wartości w formularzu. Ponowne zastosowanie nadpisze je (nie doda).',
    });
    else toast({ title: 'Zastosowano zestawienie do PRZED', description: `Zapisano ${Object.keys(write).length} pól (zużycie z dokładnością 0,0001 MWh, kwoty 0,01 zł). Wariant PO bez zmian.` });
    setShowApply(false);
    onApplied();
  };

  const periodDiffers = s.proposedPeriod && (analysis.period_from !== s.proposedPeriod.from || analysis.period_to !== s.proposedPeriod.to);

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="font-semibold mb-2">Dokumenty i okresy rozliczenia</h3>
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground text-left"><th>Dokument</th><th>Rodzaj</th><th>Okres</th><th>Taryfa</th><th>Moc umowna</th><th>Pmax</th><th>Status</th></tr></thead>
          <tbody>
            {s.entries.map((e) => (
              <tr key={e.record.id} className="border-t align-top">
                <td className="py-1"><button type="button" className="underline" onClick={() => onOpenReview(e.doc.id)}>{e.doc.file_name}</button></td>
                <td>{STREAM[e.stream]}{e.doc.doc_type === 'korekta' ? ' (korekta)' : ''}</td>
                <td className="whitespace-nowrap">{per(e.record.period_from, e.record.period_to)}</td>
                <td>{e.record.tariff_code ?? '—'}</td>
                <td>{e.record.contracted_power_kw != null ? `${fmt(e.record.contracted_power_kw)} kW` : 'brak'}</td>
                <td>{e.record.max_power_kw != null ? `${fmt(e.record.max_power_kw)} kW` : 'brak'}</td>
                <td>
                  {e.included ? <Badge>wliczone</Badge> : <Badge variant="destructive">pominięte</Badge>}
                  {e.notes.map((n, i) => <p key={i} className="text-muted-foreground mt-1">{n}</p>)}
                </td>
              </tr>
            ))}
            {s.pending.map(({ doc, record }) => (
              <tr key={record.id} className="border-t">
                <td className="py-1"><button type="button" className="underline" onClick={() => onOpenReview(doc.id)}>{doc.file_name}</button></td>
                <td colSpan={5}>{per(record.period_from, record.period_to)}</td>
                <td><Badge variant="secondary">niezatwierdzony — nie wliczono</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {(s.issues.length > 0 || s.blocked.length > 0) && (
        <section className="rounded-md border border-warning/50 bg-warning/10 p-3">
          <h3 className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Braki, konflikty i korekty</h3>
          <ul className="list-disc pl-5 space-y-0.5">
            {[...s.blocked, ...s.issues].map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-semibold mb-1">Okres</h3>
        {s.proposedPeriod ? (
          <div className="flex flex-wrap items-center gap-3">
            <span>Proponowany z dat rozliczenia: <b>{per(s.proposedPeriod.from, s.proposedPeriod.to)}</b></span>
            <span className="text-muted-foreground">Analiza: {per(analysis.period_from, analysis.period_to)}</span>
            {access.canImport && periodDiffers && !confirmPeriod && <Button size="sm" variant="outline" onClick={() => setConfirmPeriod(true)}>Zastosuj okres z faktur</Button>}
            {access.canImport && confirmPeriod && (
              <span className="flex items-center gap-2">
                Zmienić okres analizy? <Button size="sm" onClick={applyPeriod} disabled={busy}>Tak, zmień</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmPeriod(false)}>Anuluj</Button>
              </span>
            )}
          </div>
        ) : <p className="text-muted-foreground">Brak okresów w zatwierdzonych rozliczeniach.</p>}
        {s.tariffs.length > 1 && <p className="mt-1">Taryfy: {s.tariffs.map((t) => `${t.code} (${per(t.period_from, t.period_to)})`).join(', ')}</p>}
        {s.contractedPower.length > 1 && <p className="mt-1">Moc umowna: {s.contractedPower.map((c) => `${fmt(c.kw)} kW (${per(c.period_from, c.period_to)})`).join(', ')}</p>}
        <p className="mt-1">Najwyższa dostępna Pmax: {s.pmax ? `${fmt(s.pmax.kw)} kW (${per(s.pmax.period_from, s.pmax.period_to)})` : 'brak danych'}{s.pmaxMissing ? ` — brak odczytu w ${s.pmaxMissing} rozliczeniach` : ''}</p>
      </section>

      {s.zoneSummaries.length > 0 && (
        <section>
          <h3 className="font-semibold mb-1">Zużycie i cena energii czynnej wg stref</h3>
          <div className="space-y-2">
            {s.zoneSummaries.map((z) => (
              <div key={z.zone} className="border-t pt-1">
                <div className="flex flex-wrap gap-4">
                  <span className="font-medium">Strefa {z.zone}</span>
                  <span>Zużycie: {fmt(z.mwh, 6)} MWh{z.incomplete ? ' (niepełne)' : ''}</span>
                  <span>Koszt energii: {z.activeCost != null ? formatCurrency(z.activeCost) : 'brak danych'}</span>
                  <span>Cena zbiorcza: {z.price != null ? `${fmt(z.price, 2)} zł/MWh` : z.priceNote}</span>
                </div>
                <Components list={[...z.components, ...z.costComponents]} onOpenReview={onOpenReview} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="font-semibold mb-1">Koszty wg składników (netto)</h3>
        {s.costs.map((c) => (
          <div key={c.kind} className="border-t pt-1">
            <div className="flex justify-between">
              <span>{c.label}{c.missingAmounts ? ` (brak kwoty w ${c.missingAmounts} poz.)` : ''}</span>
              <span className="font-medium">{formatCurrency(c.total)}</span>
            </div>
            <Components list={c.components} onOpenReview={onOpenReview} />
          </div>
        ))}
        <div className="border-t pt-1 flex justify-between font-semibold">
          <span>Razem za wybrany okres{s.issues.length ? ' (niepełne)' : ''}</span><span>{formatCurrency(s.totalNet)}</span>
        </div>
        {s.handling && <p className="mt-1 text-muted-foreground">Abonament / opłata handlowa: koszt za okres {formatCurrency(s.handling.totalNet)}. {s.handling.note}</p>}
      </section>

      {access.canImport && <section className="rounded-md border p-3">
        {!showApply ? (
          <Button onClick={() => setShowApply(true)} disabled={!rows.length}>Zastosuj zestawienie do PRZED</Button>
        ) : (
          <div className="space-y-2">
            <p className="font-medium">Podgląd zapisu (tylko PRZED; PO bez zmian)</p>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th>Pole</th><th>Obecnie</th><th>Proponowane</th><th>Uwagi</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.field} className="border-t align-top">
                    <td className="py-1">{r.label}</td>
                    <td>{r.current == null ? '—' : fmt(Number(r.current), 4)}</td>
                    <td>{fmt(r.value, 4)}</td>
                    <td>
                      {r.note}
                      {r.manual && (
                        <label className="flex items-center gap-1 text-destructive">
                          <Checkbox checked={overrideManual.has(r.field)} onCheckedChange={(v) => setOverrideManual((prev) => { const n = new Set(prev); v ? n.add(r.field) : n.delete(r.field); return n; })} />
                          Wartość ręczna — zastąp
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              Okres źródeł: {s.proposedPeriod ? per(s.proposedPeriod.from, s.proposedPeriod.to) : '?'}; dokumenty: {s.entries.filter((e) => e.included).length}.
              Taryfa, moc i składniki sieciowe nie są zapisywane automatycznie{s.blocked.length ? ' — patrz konflikty powyżej' : ''}.
            </p>
            <div className="flex gap-2">
              <Button onClick={applyBefore} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Zapisz do PRZED</Button>
              <Button variant="ghost" onClick={() => setShowApply(false)}>Anuluj</Button>
            </div>
          </div>
        )}
      </section>}
    </div>
  );
}
