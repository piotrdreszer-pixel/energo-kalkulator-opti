import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastAction } from '@/components/ui/toast';
import { useOsdOperators } from '@/hooks/useOsdOperators';
import { matchOsd } from '@/lib/osd-match';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Loader2, RefreshCw, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import type { EnergyAnalysis } from '@/types/database';
import {
  proposeMatch, diffAgainstAnalysis, canApplyRecord,
  type InvoicePpeRecord, type ImportableField, IMPORT_FIELD_LABELS,
} from '@/lib/invoice-import';
import { formatCurrency } from '@/lib/calculation-utils';
import { getZonesCount } from '@/lib/tariff-utils';
import {
  mapLineItems, isCleanMapping, LINE_TARGET_LABELS, planOtherCharges, OTHER_SUM_TARGET, CAPACITY_TARGET, capacityGroup, capacityBlockReason, PO_ONLY_WARNING, type OtherContribution, type OtherSumMode, type OtherSumPlan, type LineMapping, type LineTarget, type LineItemInput,
} from '@/lib/invoice-line-mapping';

const fmtNum = (v: number, max = 6) => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: max }).format(v);

interface AnalysisDocument {
  id: string;
  analysis_group_id: string;
  file_path: string;
  file_name: string;
  file_hash: string | null;
  mime_type: string | null;
  status: 'pending' | 'processing' | 'needs_review' | 'approved' | 'error';
  doc_type: string | null;
  issuer: string | null;
  document_number: string | null;
  buyer_nip: string | null;
  corrected_document_number: string | null;
  extracted: { warnings?: string[] } | null;
  error: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<AnalysisDocument['status'], string> = {
  pending: 'Oczekuje',
  processing: 'Przetwarzanie',
  needs_review: 'Wymaga sprawdzenia',
  approved: 'Zatwierdzony',
  error: 'Błąd',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  sprzedaz: 'Sprzedaż',
  dystrybucja: 'Dystrybucja',
  kompleksowa: 'Kompleksowa',
  korekta: 'Korekta',
  prognoza: 'Prognoza',
};

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Props {
  projectId: string;
  groupId: string;
  ppes: EnergyAnalysis[];
  onApplied: () => void;
}

export default function ImportInvoicesDialog({ projectId, groupId, ppes, onApplied }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(searchParams.get('import') === '1');
  const [uploading, setUploading] = useState(false);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('import') === '1') {
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('import');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleDocApplied = async (docId: string, analysisIds: string[]) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['analysis-documents', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['document-ppe', docId] }),
      ...analysisIds.map((id) => queryClient.invalidateQueries({ queryKey: ['analysis', id] })),
    ]);
    onApplied();
    const { data: docs } = await supabase
      .from('analysis_documents').select('id,status').eq('analysis_group_id', groupId);
    const pending = (docs || []).filter((d) => d.id !== docId && (d.status === 'needs_review' || d.status === 'pending' || d.status === 'processing')).length;
    setReviewDocId(null);
    setOpen(false);
    const back = `/projects/${projectId}/analyses/${groupId}?import=1`;
    toast({
      title: 'Zaimportowano dane z faktury',
      description: pending
        ? `Zastosowano dane dla ${analysisIds.length} PPE. ${pending} dokument(y) nadal czeka na zatwierdzenie.`
        : `Zastosowano dane dla ${analysisIds.length} PPE.`,
      action: pending ? (
        <ToastAction altText="Wróć do importu" onClick={() => navigate(back)}>Wróć do importu</ToastAction>
      ) : undefined,
    });
    if (analysisIds.length === 1) navigate(`/projects/${projectId}/analysis/${analysisIds[0]}`);
    else navigate(`/projects/${projectId}/analyses/${groupId}?highlight=${analysisIds.join(',')}`, { replace: true });
  };

  const docsQuery = useQuery({
    queryKey: ['analysis-documents', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_documents')
        .select('*')
        .eq('analysis_group_id', groupId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AnalysisDocument[];
    },
    enabled: open,
    // Odczyt AI działa w tle — odświeżaj, dopóki jakiś dokument jest w trakcie.
    refetchInterval: (query) => {
      const data = query.state.data as AnalysisDocument[] | undefined;
      return data?.some((d) => d.status === 'processing' || d.status === 'pending') ? 4000 : false;
    },
  });

  const invalidateDocs = () => queryClient.invalidateQueries({ queryKey: ['analysis-documents', groupId] });

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const existing = docsQuery.data || [];
      for (const file of Array.from(files)) {
        const ext = file.name.toLowerCase();
        if (!ext.endsWith('.pdf') && !ext.endsWith('.jpg') && !ext.endsWith('.jpeg') && !ext.endsWith('.png')) {
          toast({ variant: 'destructive', title: 'Nieobsługiwany format', description: `${file.name}: dozwolone PDF, JPG, PNG` });
          continue;
        }
        const hash = await sha256(file);
        if (existing.some((d) => d.file_hash === hash)) {
          toast({ variant: 'destructive', title: 'Duplikat pliku', description: `${file.name} został już przesłany do tej analizy.` });
          continue;
        }
        const docId = crypto.randomUUID();
        const path = `${groupId}/${docId}/${file.name}`;
        const { error: upError } = await supabase.storage.from('invoice-documents').upload(path, file);
        if (upError) throw upError;
        const { error: insError } = await supabase.from('analysis_documents').insert({
          id: docId,
          analysis_group_id: groupId,
          file_path: path,
          file_name: file.name,
          file_hash: hash,
          mime_type: file.type || null,
          status: 'pending',
        } as never);
        if (insError) throw insError;
        // Odczyt AI
        const { error: fnError } = await supabase.functions.invoke('parse-invoice', { body: { documentId: docId } });
        if (fnError) {
          toast({ variant: 'destructive', title: 'Błąd odczytu', description: `${file.name}: sprawdź status dokumentu i spróbuj ponownie.` });
        }
      }
      invalidateDocs();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Błąd przesyłania', description: e instanceof Error ? e.message : 'Nieznany błąd' });
    } finally {
      setUploading(false);
    }
  };

  const retryMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.functions.invoke('parse-invoice', { body: { documentId } });
      if (error) throw error;
    },
    onSuccess: invalidateDocs,
    onError: () => toast({ variant: 'destructive', title: 'Błąd', description: 'Ponowny odczyt nie powiódł się' }),
  });

  const reviewDoc = docsQuery.data?.find((d) => d.id === reviewDocId) || null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp className="mr-2 h-4 w-4" />
          Importuj faktury
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import faktur energetycznych</DialogTitle>
          <DialogDescription>
            Prześlij faktury (PDF, JPG, PNG). AI odczyta dane, a Ty zatwierdzisz, co trafi do kalkulatora.
            Nic nie zostanie zapisane bez Twojego zatwierdzenia. Odczyt AI jest rozliczany z kredytów workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            disabled={uploading}
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
            aria-label="Wybierz pliki faktur"
          />
          {uploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>

        {docsQuery.data?.length ? (
          <div className="space-y-2 mt-2">
            {docsQuery.data.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[d.doc_type && DOC_TYPE_LABELS[d.doc_type], d.document_number && `nr ${d.document_number}`, d.issuer]
                      .filter(Boolean).join(' • ') || '—'}
                  </p>
                </div>
                <Badge variant={d.status === 'approved' ? 'default' : d.status === 'error' ? 'destructive' : 'secondary'}>
                  {STATUS_LABELS[d.status]}
                </Badge>
                {d.status === 'needs_review' && (
                  <Button size="sm" onClick={() => setReviewDocId(d.id)}>Sprawdź i zatwierdź</Button>
                )}
                {d.status === 'error' && (
                  <Button size="sm" variant="outline" onClick={() => retryMutation.mutate(d.id)} disabled={retryMutation.isPending}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Ponów
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">Brak przesłanych dokumentów w tej analizie.</p>
        )}

        {reviewDoc && (
          <InvoiceReview
            document={reviewDoc}
            ppes={ppes}
            projectId={projectId}
            groupId={groupId}
            onClose={() => { setReviewDocId(null); invalidateDocs(); onApplied(); }}
            onApplied={(ids) => handleDocApplied(reviewDoc.id, ids)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceReview({ document: doc, ppes, projectId, groupId, onClose, onApplied }: {
  document: AnalysisDocument;
  ppes: EnergyAnalysis[];
  projectId: string;
  groupId: string;
  onClose: () => void;
  onApplied: (analysisIds: string[]) => void;
}) {
  const { toast } = useToast();
  const { data: osdOperators = [] } = useOsdOperators();
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<ImportableField>>>({});
  const [matchChoice, setMatchChoice] = useState<Record<string, string>>({});
  const [osdChoice, setOsdChoice] = useState<Record<string, string>>({});
  const [osdApply, setOsdApply] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [lineOverrides, setLineOverrides] = useState<Record<string, Record<string, LineTarget | null>>>({});
  const [lineSelected, setLineSelected] = useState<Record<string, Set<string>>>({});
  const [otherMode, setOtherMode] = useState<Record<string, OtherSumMode>>({});
  const [periodAck, setPeriodAck] = useState<Record<string, boolean>>({});

  /** OSD: '' = wymagany wybór, '__keep__' = nie zmieniaj, id = operator. */
  const osdStateFor = (rec: InvoicePpeRecord, target: EnergyAnalysis | null) => {
    const m = matchOsd(rec.osd_name, osdOperators);
    const choice = osdChoice[rec.id] ?? (m.status === 'matched' ? m.osdId! : '');
    const apply = osdApply[rec.id] ?? (m.status === 'matched' && (!target || target.osd_id !== m.osdId));
    const current = target?.osd_id || null;
    const conflict = !!current && !!choice && choice !== '__keep__' && choice !== current;
    return { match: m, choice, apply, current, conflict };
  };
  const osdName = (id: string | null) => osdOperators.find((o) => o.id === id)?.name || '—';

  const mappingsFor = (rec: InvoicePpeRecord, target: EnergyAnalysis | null): LineMapping[] => {
    const recItems = items.filter((li: { ppe_record_id?: string }) => li.ppe_record_id === rec.id) as unknown as LineItemInput[];
    return mapLineItems(recItems, rec, target, lineOverrides[rec.id] || {});
  };
  const selectedLinesFor = (recId: string, maps: LineMapping[]) =>
    lineSelected[recId] ?? new Set(maps.filter(isCleanMapping).map((m) => m.item.id));
  const toggleLine = (recId: string, itemId: string, maps: LineMapping[]) => {
    setLineSelected((prev) => {
      const cur = new Set(prev[recId] ?? selectedLinesFor(recId, maps));
      if (cur.has(itemId)) cur.delete(itemId); else cur.add(itemId);
      return { ...prev, [recId]: cur };
    });
  };

  const recordsQuery = useQuery({
    queryKey: ['document-ppe', doc.id],
    queryFn: async () => {
      const { data: records, error } = await supabase
        .from('document_ppe_records').select('*').eq('document_id', doc.id);
      if (error) throw error;
      const { data: items, error: iError } = await supabase
        .from('document_line_items').select('*').eq('document_id', doc.id);
      if (iError) throw iError;
      return { records: (records || []) as unknown as InvoicePpeRecord[], items: items || [] };
    },
  });

  const records = recordsQuery.data?.records || [];
  const items = recordsQuery.data?.items || [];

  const proposals = useMemo(() => {
    const map: Record<string, ReturnType<typeof proposeMatch>> = {};
    for (const r of records) map[r.id] = proposeMatch(r, ppes);
    return map;
  }, [records, ppes]);

  const toggleField = (recId: string, field: ImportableField, defaults: Set<ImportableField>) => {
    setSelectedFields((prev) => {
      const cur = new Set(prev[recId] ?? defaults);
      if (cur.has(field)) cur.delete(field); else cur.add(field);
      return { ...prev, [recId]: cur };
    });
  };

  // Stałe identyfikatory nowych PPE — ponowienie po błędzie nie tworzy duplikatu.
  const [newIds] = useState<Record<string, string>>({});
  const newIdFor = (recId: string) => (newIds[recId] ??= crypto.randomUUID());

  const planFor = (rec: InvoicePpeRecord) => {
    const proposal = proposals[rec.id];
    const choice = matchChoice[rec.id] ?? (proposal.status === 'matched' ? proposal.analysisId! : proposal.status === 'new' ? '__new__' : '');
    const target = choice && choice !== '__new__' ? ppes.find((p) => p.id === choice) || null : null;
    const diffs = diffAgainstAnalysis(rec, target);
    const defaults = new Set(diffs.filter((d) => d.changed).map((d) => d.field));
    const fields = selectedFields[rec.id] ?? defaults;
    const maps = mappingsFor(rec, target);
    const selLines = selectedLinesFor(rec.id, maps);
    const lines = maps.filter((m) => selLines.has(m.item.id) && m.status === 'mapped' && m.target && m.target !== OTHER_SUM_TARGET && m.target !== CAPACITY_TARGET && m.converted != null);
    const osd = osdStateFor(rec, target);
    const osdId = osd.apply && osd.choice && osd.choice !== '__keep__' ? osd.choice : null;
    const prevVs = (target?.value_sources as Record<string, { breakdown?: OtherContribution[] }> | undefined)?.[OTHER_SUM_TARGET];
    const other = planOtherCharges({
      maps, selected: selLines, documentId: doc.id,
      period: { from: rec.period_from, to: rec.period_to },
      current: target?.fixed_distribution_before_total, previous: prevVs?.breakdown, mode: otherMode[rec.id] ?? null,
    });
    const capacity = planOtherCharges({
      maps, selected: selLines, documentId: doc.id, period: { from: rec.period_from, to: rec.period_to },
      current: target?.capacity_charge_before, previous: null, mode: 'replace', target: CAPACITY_TARGET,
    });
    const analysisFrom = fields.has('period_from') ? rec.period_from : target?.period_from ?? null;
    const analysisTo = fields.has('period_to') ? rec.period_to : target?.period_to ?? null;
    const periodMismatch = other.items.length > 0 && (analysisFrom !== rec.period_from || analysisTo !== rec.period_to);
    return { choice, target, diffs, fields, lines, osd, osdId, other, capacity, periodMismatch, analysisFrom, analysisTo };
  };

  /** Zapis jednego rekordu. Zwraca id PPE zwrócone przez zapis. Rzuca wyjątek przy błędzie. */
  const applyRecord = async (rec: InvoicePpeRecord): Promise<string> => {
    const { choice, diffs, fields, lines, osdId, other, capacity } = planFor(rec);
    const update: Record<string, unknown> = {};
    for (const d of diffs) if (fields.has(d.field)) update[d.field] = d.incoming;
    if (typeof update.tariff_code_before === 'string') update.zones_count_before = getZonesCount(update.tariff_code_before) || 1;
    if (osdId) update.osd_id = osdId;
    for (const m of lines) update[m.target!] = m.converted;
    if (other.result != null) update[OTHER_SUM_TARGET] = other.result;
    if (capacity.result != null) update[CAPACITY_TARGET] = capacity.result;
    const docSources = (vs: Record<string, unknown>) => {
      for (const f of fields) vs[f] = { source: 'document', document_id: doc.id, page: rec.source_pages?.[0] ?? null };
      if (osdId) vs.osd_id = { source: 'document', document_id: doc.id, page: rec.source_pages?.[0] ?? null };
      for (const m of lines) vs[m.target!] = { source: 'document', document_id: doc.id, page: m.item.page, item_ref: m.item.id };
      if (capacity.result != null) vs[CAPACITY_TARGET] = { source: 'document', document_id: doc.id, breakdown: capacity.breakdown };
      if (other.result != null) vs[OTHER_SUM_TARGET] = { source: 'document', document_id: doc.id, breakdown: other.breakdown };
      return vs;
    };
    const appliedList = [...Array.from(fields), ...(osdId ? ['osd_id'] : []), ...lines.map((m) => `line:${m.item.id}->${m.target}`), ...other.items.map((i) => `line:${i.item_ref}->${OTHER_SUM_TARGET}`), ...capacity.items.map((i) => `line:${i.item_ref}->${CAPACITY_TARGET}`)];

    let analysisId = choice;
    if (choice === '__new__') {
      const newId = newIdFor(rec.id);
      const { data: exists } = await supabase.from('energy_analyses').select('id').eq('id', newId).maybeSingle();
      if (!exists) {
        const name = rec.ppe_number ? `PPE ${rec.ppe_number}` : `PPE ${ppes.length + 1}`;
        const { data, error } = await supabase
          .from('energy_analyses')
          .insert({ id: newId, client_project_id: projectId, analysis_group_id: groupId, name, ...update, value_sources: docSources({}) } as never)
          .select('id').single();
        if (error) throw error;
        analysisId = data.id;
      } else {
        analysisId = exists.id;
      }
    } else {
      const { data: cur, error: curErr } = await supabase.from('energy_analyses').select('value_sources').eq('id', choice).single();
      if (curErr) throw curErr;
      const vs = docSources({ ...((cur?.value_sources as Record<string, unknown>) || {}) });
      const { error } = await supabase.from('energy_analyses').update({ ...update, value_sources: vs } as never).eq('id', choice);
      if (error) throw error;
    }

    const { error: recError } = await supabase
      .from('document_ppe_records')
      .update({
        matched_analysis_id: analysisId,
        match_status: choice === '__new__' ? 'new' : 'matched',
        applied_fields: appliedList,
        applied_at: new Date().toISOString(),
      } as never)
      .eq('id', rec.id)
      .is('applied_at', null);
    if (recError) throw recError;
    return analysisId;
  };

  const applyAll = async () => {
    if (applying) return;
    const pending = records.filter(canApplyRecord);
    for (const rec of pending) {
      const p = planFor(rec);
      const label = rec.ppe_number || 'PPE bez numeru';
      if (!p.choice) {
        toast({ variant: 'destructive', title: 'Wymagane przypisanie', description: `${label}: wybierz punkt PPE lub utwórz nowy.` });
        return;
      }
      if (!p.osd.choice) {
        toast({ variant: 'destructive', title: 'Wybierz operatora (OSD)', description: `${label}: operator nie został jednoznacznie rozpoznany — wybierz go lub „Nie zmieniaj”.` });
        return;
      }
      if (p.other.items.length && p.other.result == null) {
        toast({ variant: 'destructive', title: 'Suma pozostałych opłat', description: `${label}: pole ma już kwotę — wybierz „Zastąp obecną wartość” lub „Dodaj do obecnej wartości”.` });
        return;
      }
      if (p.periodMismatch && !periodAck[rec.id]) {
        toast({ variant: 'destructive', title: 'Okres się różni', description: `${label}: okres faktury różni się od okresu analizy — potwierdź pod tabelą opłat lub odznacz pozycje sumy.` });
        return;
      }
      if (!p.fields.size && !p.lines.length && !p.osdId && !p.other.items.length && !p.capacity.items.length) {
        toast({ variant: 'destructive', title: 'Brak wybranych pól', description: `${label}: zaznacz pola do zastosowania.` });
        return;
      }
    }
    setApplying(true);
    try {
      const ids: string[] = records.filter((r) => !canApplyRecord(r) && r.matched_analysis_id).map((r) => r.matched_analysis_id!);
      for (const rec of pending) ids.push(await applyRecord(rec));
      const { error } = await supabase.from('analysis_documents').update({ status: 'approved' } as never).eq('id', doc.id);
      if (error) throw error;
      onApplied(Array.from(new Set(ids)));
    } catch (e) {
      await recordsQuery.refetch(); // zapisane rekordy są oznaczone — ponowienie ich nie zdubluje
      toast({ variant: 'destructive', title: 'Błąd zapisu', description: `${e instanceof Error ? e.message : 'Nieznany błąd'}. Twoje wybory zostały zachowane — spróbuj ponownie.` });
      setApplying(false);
    }
  };

  const warnings = doc.extracted?.warnings || [];

  return (
    <div className="mt-4 border-t pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Podgląd: {doc.file_name}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Zamknij podgląd</Button>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" /> {w}
            </p>
          ))}
        </div>
      )}
      {doc.corrected_document_number && (
        <p className="text-sm text-muted-foreground">Korekta faktury: {doc.corrected_document_number}</p>
      )}

      {recordsQuery.isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nie rozpoznano żadnego punktu PPE w tym dokumencie.</p>
      ) : (
        records.map((rec) => {
          const proposal = proposals[rec.id];
          const applied = !canApplyRecord(rec);
          const choice = matchChoice[rec.id] ?? (proposal.status === 'matched' ? proposal.analysisId! : proposal.status === 'new' ? '__new__' : '');
          const target = choice && choice !== '__new__' ? ppes.find((p) => p.id === choice) || null : null;
          const diffs = diffAgainstAnalysis(rec, target);
          const defaults = new Set(diffs.filter((d) => d.changed).map((d) => d.field));
          const fields = selectedFields[rec.id] ?? defaults;
          const maps = mappingsFor(rec, target);
          const selLines = selectedLinesFor(rec.id, maps);
          const selCount = maps.filter((m) => selLines.has(m.item.id) && m.status === 'mapped' && m.converted != null).length;
          const plan = planFor(rec);

          return (
            <div key={rec.id} className="rounded-md border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">
                  {rec.ppe_number || 'PPE bez numeru'}
                  {rec.ppe_address && <span className="text-muted-foreground font-normal"> — {rec.ppe_address}</span>}
                </p>
                {applied && <Badge><CheckCircle2 className="h-3 w-3 mr-1" /> Zastosowano</Badge>}
                {rec.source_pages?.length ? (
                  <span className="text-xs text-muted-foreground">strony: {rec.source_pages.join(', ')}</span>
                ) : null}
              </div>

              {!applied && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Przypisz do:</span>
                  <Select value={choice} onValueChange={(v) => setMatchChoice((p) => ({ ...p, [rec.id]: v }))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Wybierz punkt PPE" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">Utwórz nowy PPE</SelectItem>
                      {ppes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}{p.ppe_number ? ` (${p.ppe_number})` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {proposal.status === 'ambiguous' && (
                    <span className="text-xs text-warning">Niejednoznaczny numer — wymagany ręczny wybór.</span>
                  )}
                </div>
              )}

              {!applied && diffs.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2">Zastosuj</th>
                      <th className="py-1 pr-2">Pole</th>
                      <th className="py-1 pr-2">Obecnie</th>
                      <th className="py-1">Z faktury</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((d) => (
                      <tr key={d.field} className={d.changed ? '' : 'opacity-60'}>
                        <td className="py-1 pr-2">
                          <Checkbox
                            checked={fields.has(d.field)}
                            onCheckedChange={() => toggleField(rec.id, d.field, defaults)}
                            aria-label={`Zastosuj ${d.label}`}
                          />
                        </td>
                        <td className="py-1 pr-2">{d.label}</td>
                        <td className="py-1 pr-2">{d.current ?? '—'}</td>
                        <td className="py-1 font-medium">{String(d.incoming)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!applied && (() => {
                const o = osdStateFor(rec, target);
                return (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Checkbox
                        checked={o.apply}
                        disabled={!o.choice || o.choice === '__keep__'}
                        onCheckedChange={(v) => setOsdApply((p) => ({ ...p, [rec.id]: v === true }))}
                        aria-label="Zastosuj Operator sieci (OSD)"
                      />
                      <span>Operator sieci (OSD)</span>
                      <span className="text-muted-foreground">{osdName(o.current)} →</span>
                      <Select
                        value={o.choice}
                        onValueChange={(v) => {
                          setOsdChoice((p) => ({ ...p, [rec.id]: v }));
                          setOsdApply((p) => ({ ...p, [rec.id]: v !== '__keep__' }));
                        }}
                      >
                        <SelectTrigger className="w-64 h-8"><SelectValue placeholder="Wybierz operatora" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__keep__">Nie zmieniaj OSD</SelectItem>
                          {osdOperators.map((op) => <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Odczytano: {rec.osd_name || 'brak wskazania operatora'}
                      {o.match.status !== 'matched' && ' — nie rozpoznano jednoznacznie, wybierz operatora ręcznie.'}
                    </p>
                    {o.conflict && o.apply && (
                      <p className="text-xs text-warning flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        Konflikt: punkt ma obecnie {osdName(o.current)}, faktura wskazuje {osdName(o.choice)}. Zatwierdzenie zmieni OSD.
                      </p>
                    )}
                  </div>
                );
              })()}

              {!applied && capacityGroup(maps).length > 0 && (
                <CapacityGroup
                  maps={capacityGroup(maps)}
                  selected={selLines}
                  plan={plan.capacity}
                  period={[rec.period_from, rec.period_to]}
                  onToggleAll={(on) => {
                    const group = capacityGroup(maps);
                    const ids = group.filter((m) => m.item.net_value != null).map((m) => m.item.id);
                    if (on) {
                      setLineOverrides((p) => ({ ...p, [rec.id]: { ...(p[rec.id] || {}), ...Object.fromEntries(group.map((m) => [m.item.id, CAPACITY_TARGET])) } }));
                    }
                    setLineSelected((p) => {
                      const cur = new Set(p[rec.id] ?? selLines);
                      for (const id of ids) on ? cur.add(id) : cur.delete(id);
                      return { ...p, [rec.id]: cur };
                    });
                  }}
                />
              )}

              {maps.length > 0 && (
                <LineItemsTable
                  maps={maps}
                  selected={selLines}
                  applied={applied}
                  target={target}
                  onToggle={(id) => toggleLine(rec.id, id, maps)}
                  onSelectClean={() => setLineSelected((p) => ({ ...p, [rec.id]: new Set(maps.filter(isCleanMapping).map((m) => m.item.id)) }))}
                  onAssign={(id, t) => setLineOverrides((p) => ({ ...p, [rec.id]: { ...(p[rec.id] || {}), [id]: t } }))}
                />
              )}

              {!applied && plan.other.items.length > 0 && (
                <OtherSumSummary
                  plan={plan.other}
                  mode={otherMode[rec.id] ?? null}
                  onMode={(m) => setOtherMode((p) => ({ ...p, [rec.id]: m }))}
                  periodMismatch={plan.periodMismatch}
                  invoicePeriod={[rec.period_from, rec.period_to]}
                  analysisPeriod={[plan.analysisFrom, plan.analysisTo]}
                  ack={!!periodAck[rec.id]}
                  onAck={(v) => setPeriodAck((p) => ({ ...p, [rec.id]: v }))}
                />
              )}

              {!applied && (
                <p className="text-xs text-muted-foreground">
                  Do zastosowania: {fields.size} pól PPE{osdStateFor(rec, target).apply && osdStateFor(rec, target).choice && osdStateFor(rec, target).choice !== '__keep__' ? ', operator OSD' : ''}, {selCount} stawek i opłat.
                </p>
              )}
            </div>
          );
        })
      )}
      {records.some(canApplyRecord) && (
        <Button onClick={applyAll} disabled={applying}>
          {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {applying ? 'Zapisywanie…' : 'Zatwierdź i zastosuj'}
        </Button>
      )}
    </div>
  );
}

function LineItemsTable({ maps, selected, applied, target, onToggle, onSelectClean, onAssign }: {
  maps: LineMapping[];
  selected: Set<string>;
  applied: boolean;
  target: EnergyAnalysis | null;
  onToggle: (itemId: string) => void;
  onSelectClean: () => void;
  onAssign: (itemId: string, t: LineTarget | null) => void;
}) {
  const current = (t: LineTarget | null) => {
    if (!t || !target) return '—';
    const v = (target as unknown as Record<string, unknown>)[t];
    return v == null ? '—' : fmtNum(Number(v));
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Ceny i opłaty z faktury → pola PRZED</p>
        {!applied && (
          <Button size="sm" variant="outline" onClick={onSelectClean}>Zaznacz wszystkie poprawnie przypisane</Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2">Zastosuj</th>
              <th className="py-1 pr-2">Pozycja faktury</th>
              <th className="py-1 pr-2">Pole kalkulatora</th>
              <th className="py-1 pr-2">Obecnie</th>
              <th className="py-1 pr-2">Odczytano</th>
              <th className="py-1">Po przeliczeniu</th>
            </tr>
          </thead>
          <tbody>
            {maps.map((m) => {
              const li = m.item;
              const canApply = m.status === 'mapped' && m.converted != null;
              return (
                <React.Fragment key={li.id}>
                  <tr className="border-t align-top">
                    <td className="py-1 pr-2">
                      <Checkbox
                        checked={canApply && selected.has(li.id)}
                        disabled={applied || !canApply}
                        onCheckedChange={() => onToggle(li.id)}
                        aria-label={`Zastosuj ${li.name}`}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      {li.name}
                      {li.page != null && <span className="text-muted-foreground"> (str. {li.page})</span>}
                      <div className="text-muted-foreground">
                        {li.quantity != null ? `${fmtNum(li.quantity)} ${li.unit || ''}` : '—'} · netto {li.net_value != null ? formatCurrency(li.net_value) : '—'}
                      </div>
                    </td>
                    <td className="py-1 pr-2 min-w-[12rem]">
                      {m.status === 'unsupported' ? (
                        <Badge variant="secondary">Nie dotyczy</Badge>
                      ) : m.allowedTargets.length > 0 && !applied ? (
                        <Select value={m.target ?? '__none__'} onValueChange={(v) => onAssign(li.id, v === '__none__' ? null : (v as LineTarget))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Wymaga przypisania</SelectItem>
                            {m.allowedTargets.map((t) => <SelectItem key={t} value={t}>{LINE_TARGET_LABELS[t]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : m.target ? LINE_TARGET_LABELS[m.target] : 'Wymaga przypisania'}
                    </td>
                    <td className="py-1 pr-2">{current(m.target)}</td>
                    <td className="py-1 pr-2">{li.rate != null ? `${fmtNum(li.rate)} zł/${li.unit || '?'}` : '—'}</td>
                    <td className="py-1 font-medium">{m.converted != null ? `${fmtNum(m.converted)} ${m.convertedUnit}` : '—'}</td>
                  </tr>
                  {(m.reason || m.warnings.length > 0 || m.info.length > 0) && (
                    <tr>
                      <td />
                      <td colSpan={5} className="pb-2 space-y-0.5">
                        {m.reason && (!canApply || m.target === OTHER_SUM_TARGET) && <p className="text-muted-foreground">{m.reason}</p>}
                        {m.warnings.map((w, i) => (
                          <p key={i} className="flex items-start gap-1 text-warning"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{w}</p>
                        ))}
                        {m.info.map((w, i) => <p key={i} className="text-muted-foreground">ℹ {w}</p>)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Przeniesienie stawek nie gwarantuje odtworzenia kwoty faktury — kalkulator liczy koszty dla całego okresu analizy według własnego sposobu naliczania. Wariant PO nie jest zmieniany.
      </p>
    </div>
  );
}

function OtherSumSummary({ plan, mode, onMode, periodMismatch, invoicePeriod, analysisPeriod, ack, onAck }: {
  plan: OtherSumPlan;
  mode: OtherSumMode | null;
  onMode: (m: OtherSumMode) => void;
  periodMismatch: boolean;
  invoicePeriod: [string | null, string | null];
  analysisPeriod: [string | null, string | null];
  ack: boolean;
  onAck: (v: boolean) => void;
}) {
  const per = (p: [string | null, string | null]) => `${p[0] || '?'} – ${p[1] || '?'}`;
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-xs">
      <p className="text-sm font-medium">Suma pozostałych opłat PRZED — kwota za okres</p>
      <ul className="space-y-0.5">
        {plan.items.map((i) => (
          <li key={i.item_ref} className="flex justify-between gap-2">
            <span>{i.name}{i.page != null ? ` (str. ${i.page})` : ''}</span>
            <span>{formatCurrency(i.net_value)}</span>
          </li>
        ))}
      </ul>
      <p>Okres pozycji: {per(invoicePeriod)}</p>
      <p className="font-medium">Łącznie netto: {formatCurrency(plan.total)}</p>
      <p>Obecna wartość pola: {formatCurrency(plan.current)}
        {plan.previousSameDoc > 0 && ` (w tym ${formatCurrency(plan.previousSameDoc)} z wcześniejszego importu tego dokumentu)`}</p>
      {plan.needsMode && (
        <div className="flex flex-wrap gap-3">
          {(['replace', 'add'] as const).map((m) => (
            <label key={m} className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name={`mode-${plan.items[0]?.item_ref}`} checked={mode === m} onChange={() => onMode(m)} />
              {m === 'replace' ? 'Zastąp obecną wartość' : 'Dodaj do obecnej wartości'}
            </label>
          ))}
        </div>
      )}
      <p className="font-medium">Po zastosowaniu: {plan.result != null ? formatCurrency(plan.result) : 'wybierz sposób zapisu'}</p>
      {plan.needsMode && mode === 'add' && plan.previousSameDoc > 0 && (
        <p className="text-muted-foreground">Wcześniejszy wkład tego dokumentu zostanie przeliczony, a nie dodany drugi raz.</p>
      )}
      {periodMismatch && (
        <label className="flex items-start gap-2 text-warning cursor-pointer">
          <Checkbox checked={ack} onCheckedChange={(v) => onAck(v === true)} aria-label="Potwierdź różnicę okresu" />
          <span>Okres faktury ({per(invoicePeriod)}) różni się od okresu analizy ({per(analysisPeriod)}). Kwota nie zostanie przeskalowana — potwierdzam, że wpisuję koszt tylko za okres faktury.</span>
        </label>
      )}
      <p className="text-muted-foreground flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{PO_ONLY_WARNING}</p>
    </div>
  );
}

function CapacityGroup({ maps, selected, plan, period, onToggleAll }: {
  maps: LineMapping[];
  selected: Set<string>;
  plan: OtherSumPlan;
  period: [string | null, string | null];
  onToggleAll: (on: boolean) => void;
}) {
  const usable = maps.filter((m) => capacityBlockReason(m) == null || m.target !== CAPACITY_TARGET);
  const eligible = usable.filter((m) => m.item.net_value != null);
  const chosen = maps.filter((m) => m.target === CAPACITY_TARGET && m.converted != null && selected.has(m.item.id));
  const all = eligible.length > 0 && chosen.length === eligible.length;
  const state: boolean | 'indeterminate' = all ? true : chosen.length > 0 ? 'indeterminate' : false;
  const blocked = maps.map((m) => ({ m, r: capacityBlockReason(m) })).filter((x) => x.r);
  return (
    <div className="rounded-md border p-3 space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <Checkbox checked={state} disabled={!eligible.length} onCheckedChange={() => onToggleAll(!all)} aria-label="Zaznacz wszystkie opłaty mocowe" />
          Opłata mocowa — {all ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
        </label>
        <span className="text-muted-foreground">Wybrano {chosen.length} z {maps.length} pozycji</span>
        <span className="font-medium">Suma: {formatCurrency(plan.total)}</span>
      </div>
      {plan.items.length > 0 && (
        <p>Do pola „{LINE_TARGET_LABELS[CAPACITY_TARGET]}”: {formatCurrency(plan.total)} za okres {period[0] || '?'} – {period[1] || '?'}
          {plan.current ? ` (zastąpi obecne ${formatCurrency(plan.current)})` : ''}. Suma kwot netto — bez ponownego mnożenia przez miesiące ani MWh.</p>
      )}
      {blocked.map(({ m, r }) => (
        <p key={m.item.id} className="text-warning flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{m.item.name}: {r}</p>
      ))}
    </div>
  );
}
