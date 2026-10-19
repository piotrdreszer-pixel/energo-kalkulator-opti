import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, ClipboardList, Loader2 } from 'lucide-react';
import type { EnergyAnalysis } from '@/types/database';
import type { InvoicePpeRecord } from '@/lib/invoice-import';
import { buildSettlement, settlementProposals, matchesStored, type Component, type SettlementDoc, type SettlementItem } from '@/lib/invoice-settlement';
import { sameValue } from '@/lib/invoice-reedit';
import type { ValueSources } from '@/lib/value-sources';
import { formatCurrency } from '@/lib/calculation-utils';

const fmt = (v: number | null | undefined, d = 3) =>
  v == null ? 'brak danych' : v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: d });
const per = (a: string | null, b: string | null) => `${a ?? '?'} – ${b ?? '?'}`;
const STREAM: Record<string, string> = { sales: 'sprzedaż', distribution: 'dystrybucja', both: 'kompleksowa' };

interface Props { projectId: string; groupId: string; ppes: EnergyAnalysis[]; onApplied: () => void }

export default function InvoiceSettlementDialog({ projectId, groupId, ppes, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [ppeId, setPpeId] = useState<string>('');
  const navigate = useNavigate();
  useEffect(() => { if (!ppeId && ppes[0]) setPpeId(ppes[0].id); }, [ppes, ppeId]);

  const data = useQuery({
    queryKey: ['group-settlement', groupId],
    enabled: open,
    queryFn: async () => {
      const { data: docs, error } = await supabase.from('analysis_documents')
        .select('id,file_name,status,doc_type,issuer,document_number,corrected_document_number,file_hash').eq('analysis_group_id', groupId);
      if (error) throw error;
      const ids = (docs || []).map((d) => d.id);
      if (!ids.length) return { docs: [], records: [], items: [] };
      const [r, i] = await Promise.all([
        supabase.from('document_ppe_records').select('*').in('document_id', ids),
        supabase.from('document_line_items').select('id,document_id,ppe_record_id,name,quantity,unit,rate,net_value,category,page').in('document_id', ids),
      ]);
      if (r.error) throw r.error;
      if (i.error) throw i.error;
      return { docs: (docs || []) as SettlementDoc[], records: (r.data || []) as unknown as InvoicePpeRecord[], items: (i.data || []) as SettlementItem[] };
    },
  });

  const all = useMemo(() => {
    if (!data.data) return [];
    return ppes.map((a) => ({ a, s: buildSettlement({ ppeNumber: a.ppe_number || '', analysisId: a.id, ...data.data! }) }));
  }, [data.data, ppes]);
  const current = all.find((x) => x.a.id === ppeId);
  const openReview = (docId: string) => { setOpen(false); navigate(`/projects/${projectId}/analyses/${groupId}?review=${docId}`); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ClipboardList className="mr-2 h-4 w-4" />Rozliczenia z faktur</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rozliczenia z faktur</DialogTitle>
          <DialogDescription>
            Rzeczywiste zestawienie kosztów z zatwierdzonych faktur tej analizy (netto). To nie jest wynik kalkulatora „według stawek”.
          </DialogDescription>
        </DialogHeader>
        {data.isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : data.error ? (
          <p className="text-destructive">Nie udało się wczytać rozliczeń.</p>
        ) : (
          <div className="space-y-6">
            <MultiSummary rows={all} />
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">PPE:</span>
              <Select value={ppeId} onValueChange={setPpeId}>
                <SelectTrigger className="w-[420px]"><SelectValue placeholder="Wybierz PPE" /></SelectTrigger>
                <SelectContent>
                  {ppes.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.ppe_number ? ` — ${p.ppe_number}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {current && <PpeSettlement analysis={current.a} s={current.s} onOpenReview={openReview} onApplied={() => { onApplied(); data.refetch(); }} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function PpeSettlement({ analysis, s, onOpenReview, onApplied }: {
  analysis: EnergyAnalysis; s: ReturnType<typeof buildSettlement>; onOpenReview: (id: string) => void; onApplied: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmPeriod, setConfirmPeriod] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [overrideManual, setOverrideManual] = useState<Set<string>>(new Set());
  const proposals = settlementProposals(s);
  const sources = (analysis.value_sources || {}) as ValueSources;
  const a = analysis as unknown as Record<string, unknown>;
  const rows = proposals.map((p) => {
    const cur = a[p.field];
    const manual = sources[p.field]?.source === 'manual' && cur != null && !matchesStored(p.field, p.value, cur);
    return { ...p, current: cur, manual };
  });

  if (!s.entries.length && !s.pending.length) {
    return <p className="text-sm text-muted-foreground">Brak faktur przypisanych do tego PPE w tej analizie.</p>;
  }

  const applyPeriod = async () => {
    if (!s.proposedPeriod) return;
    setBusy(true);
    const { error } = await supabase.from('energy_analyses')
      .update({ period_from: s.proposedPeriod.from, period_to: s.proposedPeriod.to } as never).eq('id', analysis.id);
    setBusy(false); setConfirmPeriod(false);
    if (error) toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zapisać okresu.' });
    else { toast({ title: 'Zastosowano okres z faktur' }); onApplied(); }
  };

  const applyBefore = async () => {
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
            {periodDiffers && !confirmPeriod && <Button size="sm" variant="outline" onClick={() => setConfirmPeriod(true)}>Zastosuj okres z faktur</Button>}
            {confirmPeriod && (
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

      <section className="rounded-md border p-3">
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
      </section>
    </div>
  );
}
