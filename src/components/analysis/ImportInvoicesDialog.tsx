import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastAction } from '@/components/ui/toast';
import { useOsdOperators } from '@/hooks/useOsdOperators';
import { matchOsd } from '@/lib/osd-match';
import { supabase } from '@/integrations/supabase/client';
import { requireFeature, useGroupFeatureAccess } from '@/hooks/useFeatureAccess';
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
  proposeMatch, diffAgainstAnalysis, canApplyRecord, normalizeTariffCode, tariffConflict, mapConsumptionZones,
  type InvoicePpeRecord, type ImportableField, IMPORT_FIELD_LABELS,
} from '@/lib/invoice-import';
import { formatCurrency } from '@/lib/calculation-utils';
import { getZonesCount, getZoneLabels, TARIFF_CODES } from '@/lib/tariff-utils';
import { planReapply, type ReviewState } from '@/lib/invoice-reedit';
import {
  mapLineItems, isCleanMapping, LINE_TARGET_LABELS, planOtherCharges, OTHER_SUM_TARGET, CAPACITY_TARGET, capacityGroup, capacityBlockReason, selectionProblems, planHandling, HANDLING_TARGET, PO_ONLY_WARNING, type OtherContribution, type OtherSumMode, type OtherSumPlan, type LineMapping, type LineTarget, type LineItemInput,
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
  const access = useGroupFeatureAccess(groupId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(searchParams.get('import') === '1');
  const [uploading, setUploading] = useState(false);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);

  useEffect(() => {
    const review = searchParams.get('review');
    if (searchParams.get('import') === '1' || review) {
      setOpen(true);
      if (review) setReviewDocId(review);
      const next = new URLSearchParams(searchParams);
      next.delete('import');
      next.delete('review');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleDocApplied = async (docId: string, analysisIds: string[]) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['analysis-documents', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['document-ppe', docId] }),
      queryClient.invalidateQueries({ queryKey: ['group-ppe-records', groupId] }),
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

  const [items, setItems] = useState<UploadItem[]>([]);
  const patch = (key: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const [hadImport, setHadImport] = useState(false);
  useEffect(() => { if (open && access.canImport) setHadImport(true); if (!open) setHadImport(false); }, [open, access.canImport]);
  const revoked = open && hadImport && !access.loading && !access.canImport;

  const processItem = async (item: UploadItem) => {
    const { key, file, docId } = item;
    const path = `${groupId}/${docId}/${file.name}`;
    try {
      patch(key, { stage: item.uploaded ? 'saving' : 'uploading', message: undefined });
      await requireFeature('invoice_import', groupId);
      const hash = item.hash ?? (await sha256(file));
      patch(key, { hash });
      if (!item.saved) {
        const { data: dup } = await supabase.from('analysis_documents').select('id').eq('analysis_group_id', groupId).eq('file_hash', hash).neq('id', docId).limit(1);
        if (dup?.length) { patch(key, { stage: 'error', message: 'Ten plik został już przesłany do tej analizy.' }); return; }
      }
      if (!item.uploaded) {
        const { error } = await supabase.storage.from('invoice-documents').upload(path, file, { upsert: false });
        if (error && !/exists|duplicate/i.test(error.message)) throw new Error(storageErrorMessage(error));
        item = { ...item, uploaded: true }; patch(key, { uploaded: true, stage: 'saving' });
      }
      if (!item.saved) {
        const { error } = await supabase.from('analysis_documents').insert({
          id: docId, analysis_group_id: groupId, file_path: path, file_name: file.name, file_hash: hash, mime_type: file.type || null, status: 'pending',
        } as never);
        if (error && error.code !== '23505') throw new Error(storageErrorMessage(error));
        item = { ...item, saved: true }; patch(key, { saved: true });
      }
      invalidateDocs();
      patch(key, { stage: 'reading' });
      await requireFeature('invoice_import', groupId);
      const { error: fnError } = await supabase.functions.invoke('parse-invoice', { body: { documentId: docId } });
      if (fnError) {
        const res = (fnError as { context?: Response }).context;
        let body: unknown = null;
        try { body = res && typeof res.json === 'function' ? await res.json() : null; } catch { /* brak treści */ }
        throw new Error(functionErrorMessage(res?.status, body));
      }
      patch(key, { stage: 'done' });
    } catch (e) {
      patch(key, { stage: 'error', message: e instanceof Error ? e.message : 'Nieznany błąd' });
    } finally {
      invalidateDocs();
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    // Kopia przed wyczyszczeniem pola — reset value opróżnia FileList (wcześniej import kończył się po cichu).
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    const fresh: UploadItem[] = [];
    for (const file of files) {
      const key = crypto.randomUUID();
      if (!isAllowedFile(file.name)) {
        fresh.push({ key, file, name: file.name, docId: key, stage: 'error', uploaded: false, saved: false, message: 'Nieobsługiwany format — dozwolone PDF, JPG, PNG.' });
      } else fresh.push({ key, file, name: file.name, docId: crypto.randomUUID(), stage: 'queued', uploaded: false, saved: false });
    }
    setItems((list) => [...fresh, ...list]);
    setUploading(true);
    try {
      for (const it of fresh) if (it.stage === 'queued') await processItem(it);
    } finally {
      setUploading(false);
    }
  };

  const retryItem = async (item: UploadItem) => {
    setUploading(true);
    try { await processItem(item); } finally { setUploading(false); }
  };

  const retryMutation = useMutation({
    mutationFn: async (documentId: string) => {
      await requireFeature('invoice_import', groupId);
      const { error } = await supabase.functions.invoke('parse-invoice', { body: { documentId } });
      if (error) {
        const res = (error as { context?: Response }).context;
        let body: unknown = null;
        try { body = res && typeof res.json === 'function' ? await res.json() : null; } catch { /* brak treści */ }
        throw new Error(functionErrorMessage(res?.status, body));
      }
    },
    onSuccess: invalidateDocs,
    onError: (e) => { invalidateDocs(); toast({ variant: 'destructive', title: 'Ponowny odczyt nie powiódł się', description: e instanceof Error ? e.message : undefined }); },
  });

  const reviewDoc = docsQuery.data?.find((d) => d.id === reviewDocId) || null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp className="mr-2 h-4 w-4" />
          {access.canImport ? 'Importuj faktury' : 'Podgląd faktur'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{access.canImport ? 'Import faktur energetycznych' : 'Podgląd faktur'}</DialogTitle>
          <DialogDescription>
            {access.canImport ? 'Prześlij faktury (PDF, JPG, PNG). Odczyt AI jest rozliczany z kredytów workspace; zastosowanie danych wymaga Twojego zatwierdzenia.' : 'Wcześniejsze dokumenty i odczytane dane.'}
          </DialogDescription>
        </DialogHeader>

        {revoked && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Uprawnienie „Import faktur” zostało odebrane. Przesyłanie i odczyt nowych faktur są zablokowane.
          </div>
        )}

        {access.canImport && <div className="flex items-center gap-3">
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            disabled={uploading || !access.canImport}
            onChange={(e) => { const f = e.target.files; handleUpload(f ? (Array.from(f) as unknown as FileList) : null); e.target.value = ''; }}
            aria-label="Wybierz pliki faktur"
          />
          {uploading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>}

        {items.length > 0 && (
          <div className="space-y-2" aria-label="Postęp przesyłania">
            {items.map((it) => (
              <div key={it.key} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm">
                {it.stage === 'error' ? <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  : it.stage === 'done' ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  : <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                <span className="font-medium truncate max-w-[45%]">{it.name}</span>
                <Badge variant={it.stage === 'error' ? 'destructive' : 'secondary'}>{STAGE_LABELS[it.stage]}</Badge>
                {it.message && <span className="text-destructive text-xs flex-1 min-w-[200px]">{it.message}</span>}
                {it.stage === 'error' && access.canImport && isAllowedFile(it.name) && (
                  <Button size="sm" variant="outline" onClick={() => retryItem(it)} disabled={uploading}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Ponów
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        </div>}

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
                  <Button size="sm" onClick={() => setReviewDocId(d.id)}>{access.canImport ? 'Sprawdź i zatwierdź' : 'Podgląd'}</Button>
                )}
                {d.status === 'approved' && (
                  <Button size="sm" variant="outline" onClick={() => setReviewDocId(d.id)}>{access.canImport ? 'Przejrzyj i zmień' : 'Podgląd'}</Button>
                )}
                {d.status === 'error' && access.canImport && (
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
            key={reviewDoc.id}
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

const NOT_NULL_FIELDS = new Set(['tariff_code_before', 'zones_count_before']);
const SUM_FIELDS = [OTHER_SUM_TARGET as string, CAPACITY_TARGET as string];
const fieldLabel = (f: string) =>
  (IMPORT_FIELD_LABELS as Record<string, string>)[f] || (LINE_TARGET_LABELS as Record<string, string>)[f] ||
  (f === 'osd_id' ? 'Operator sieci (OSD)' : f === 'zones_count_before' ? 'Liczba stref PRZED' : f);
const showVal = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : String(v));

function InvoiceReview({ document: doc, ppes, projectId, groupId, onClose, onApplied }: {
  document: AnalysisDocument;
  ppes: EnergyAnalysis[];
  projectId: string;
  groupId: string;
  onClose: () => void;
  onApplied: (analysisIds: string[]) => void;
}) {
  const { toast } = useToast();
  const access = useGroupFeatureAccess(groupId);
  const [singleRecord, setSingleRecord] = useState('');
  const editing = doc.status === 'approved';
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
  const [tariffChoice, setTariffChoice] = useState<Record<string, string>>({});
  const [replaceManual, setReplaceManual] = useState<Record<string, Set<string>>>({});
  const [hydrated, setHydrated] = useState(false);

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
  // Rekordy wszystkich faktur tej analizy — wykrywanie różnych taryf jednego PPE.
  const groupRecordsQuery = useQuery({
    queryKey: ['group-ppe-records', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_ppe_records')
        .select('ppe_number,tariff_code,period_from,period_to,document_id,analysis_documents!inner(analysis_group_id)')
        .eq('analysis_documents.analysis_group_id', groupId);
      if (error) throw error;
      return (data || []) as unknown as Pick<InvoicePpeRecord, 'ppe_number' | 'tariff_code' | 'period_from' | 'period_to'>[];
    },
  });

  const records = recordsQuery.data?.records || [];
  const items = recordsQuery.data?.items || [];

  // Przywrócenie zapisanych wyborów (bez ponownego odczytu AI).
  useEffect(() => {
    if (hydrated || !recordsQuery.data) return;
    const sf: Record<string, Set<ImportableField>> = {}, mc: Record<string, string> = {}, oc: Record<string, string> = {};
    const oa: Record<string, boolean> = {}, lo: Record<string, Record<string, LineTarget | null>> = {}, ls: Record<string, Set<string>> = {};
    const om: Record<string, OtherSumMode> = {}, pa: Record<string, boolean> = {}, tc: Record<string, string> = {};
    for (const r of recordsQuery.data.records) {
      const st = r.review_state as ReviewState | null | undefined;
      if (!st) continue;
      if (st.selectedFields) sf[r.id] = new Set(st.selectedFields as ImportableField[]);
      if (st.choice) mc[r.id] = st.choice;
      if (st.osdChoice != null) oc[r.id] = st.osdChoice;
      if (st.osdApply != null) oa[r.id] = st.osdApply;
      if (st.lineOverrides) lo[r.id] = st.lineOverrides as Record<string, LineTarget | null>;
      if (st.lineSelected) ls[r.id] = new Set(st.lineSelected);
      if (st.otherMode) om[r.id] = st.otherMode;
      if (st.periodAck) pa[r.id] = true;
      if (st.tariffChoice) tc[r.id] = st.tariffChoice;
    }
    setSelectedFields(sf); setMatchChoice(mc); setOsdChoice(oc); setOsdApply(oa);
    setLineOverrides(lo); setLineSelected(ls); setOtherMode(om); setPeriodAck(pa); setTariffChoice(tc);
    setHydrated(true);
  }, [recordsQuery.data, hydrated]);

  const proposals = useMemo(() => {
    const map: Record<string, ReturnType<typeof proposeMatch>> = {};
    for (const r of records) map[r.id] = proposeMatch(r, ppes);
    return map;
  }, [records, ppes]);

  /** Taryfa: dopasowanie ze słownika; konflikt między fakturami lub brak dopasowania = wybór ręczny. */
  const tariffStateFor = (rec: InvoicePpeRecord) => {
    const match = normalizeTariffCode(rec.tariff_code);
    const conflict = tariffConflict(rec.ppe_number, groupRecordsQuery.data || []);
    const chosen = tariffChoice[rec.id];
    const code = chosen ?? (conflict ? null : match.code);
    return { match, conflict, code };
  };

  /** OSD: '' = wymagany wybór, '__keep__' = nie zmieniaj, id = operator. */
  const osdStateFor = (rec: InvoicePpeRecord, target: EnergyAnalysis | null) => {
    const m = matchOsd(rec.osd_name, osdOperators);
    const choice = osdChoice[rec.id] ?? (m.status === 'matched' ? m.osdId! : rec.applied_at ? '__keep__' : '');
    const apply = osdApply[rec.id] ?? (m.status === 'matched' && (!target || target.osd_id !== m.osdId));
    const current = target?.osd_id || null;
    const conflict = !!current && !!choice && choice !== '__keep__' && choice !== current;
    return { match: m, choice, apply, current, conflict };
  };
  const osdName = (id: string | null) => osdOperators.find((o) => o.id === id)?.name || '—';

  const mappingsFor = (rec: InvoicePpeRecord, target: EnergyAnalysis | null, tariff: string | null): LineMapping[] => {
    const recItems = items.filter((li: { ppe_record_id?: string }) => li.ppe_record_id === rec.id) as unknown as LineItemInput[];
    return mapLineItems(recItems, { ...rec, tariff_code: tariff ?? target?.tariff_code_before ?? null }, target, lineOverrides[rec.id] || {});
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

  const choiceFor = (rec: InvoicePpeRecord) => {
    if (rec.applied_at && rec.matched_analysis_id) return rec.matched_analysis_id; // zatwierdzony: punkt stały
    const proposal = proposals[rec.id];
    return matchChoice[rec.id] ?? (proposal.status === 'matched' ? proposal.analysisId! : proposal.status === 'new' ? '__new__' : '');
  };

  const planFor = (rec: InvoicePpeRecord) => {
    const choice = choiceFor(rec);
    const target = choice && choice !== '__new__' ? ppes.find((p) => p.id === choice) || null : null;
    const tariff = tariffStateFor(rec);
    const diffs = diffAgainstAnalysis(rec, target, tariff.code);
    const prevState = (rec.review_state as ReviewState | null | undefined) || null;
    const defaults = new Set(diffs.filter((d) => d.changed || (prevState?.applied && d.field in prevState.applied)).map((d) => d.field));
    const fields = selectedFields[rec.id] ?? defaults;
    const consumption = mapConsumptionZones(rec.consumption, getZonesCount(tariff.code || target?.tariff_code_before || 'C11'));
    const maps = mappingsFor(rec, target, tariff.code);
    const selLines = selectedLinesFor(rec.id, maps);
    const lines = maps.filter((m) => selLines.has(m.item.id) && m.status === 'mapped' && m.target && m.target !== OTHER_SUM_TARGET && m.target !== CAPACITY_TARGET && m.target !== HANDLING_TARGET && m.converted != null);
    const handling = planHandling(maps, selLines);
    const osd = osdStateFor(rec, target);
    const osdId = osd.apply && osd.choice && osd.choice !== '__keep__' ? osd.choice : null;
    const vsAll = (target?.value_sources as Record<string, { breakdown?: OtherContribution[] }> | undefined) || {};
    const other = planOtherCharges({
      maps, selected: selLines, documentId: doc.id,
      period: { from: rec.period_from, to: rec.period_to },
      current: target?.fixed_distribution_before_total, previous: vsAll[OTHER_SUM_TARGET]?.breakdown, mode: otherMode[rec.id] ?? null,
    });
    const capPrev = vsAll[CAPACITY_TARGET]?.breakdown;
    const capacity = planOtherCharges({
      maps, selected: selLines, documentId: doc.id, period: { from: rec.period_from, to: rec.period_to },
      current: target?.capacity_charge_before, previous: capPrev,
      mode: (capPrev || []).some((p) => p.document_id === doc.id) ? 'add' : 'replace', target: CAPACITY_TARGET,
    });
    const analysisFrom = fields.has('period_from') ? rec.period_from : target?.period_from ?? null;
    const analysisTo = fields.has('period_to') ? rec.period_to : target?.period_to ?? null;
    const periodMismatch = other.items.length > 0 && (analysisFrom !== rec.period_from || analysisTo !== rec.period_to);

    const desired: Record<string, unknown> = {};
    for (const d of diffs) if (fields.has(d.field)) desired[d.field] = d.incoming;
    if (typeof desired.tariff_code_before === 'string') desired.zones_count_before = getZonesCount(desired.tariff_code_before) || 1;
    if (osdId) desired.osd_id = osdId;
    for (const m of lines) desired[m.target!] = m.converted;
    if (other.result != null) desired[OTHER_SUM_TARGET] = other.result;
    if (capacity.result != null) desired[CAPACITY_TARGET] = capacity.result;
    if (handling.total != null) desired[HANDLING_TARGET] = handling.total;
    const reapply = planReapply({
      desired,
      current: (target as unknown as Record<string, unknown>) || {},
      currentSources: vsAll as Record<string, unknown>,
      previous: prevState?.applied,
      additive: SUM_FIELDS,
      replaceManual: replaceManual[rec.id],
    });
    // Pola NOT NULL nie wracają do pustej wartości (nowy PPE) — zostają.
    for (const f of NOT_NULL_FIELDS) if (f in reapply.write && reapply.write[f] == null) delete reapply.write[f];
    return { choice, target, tariff, diffs, defaults, fields, consumption, maps, selLines, lines, osd, osdId, other, capacity, handling, periodMismatch, analysisFrom, analysisTo, reapply, prevState };
  };

  /** Zapis jednego rekordu. Zwraca id PPE. Rzuca wyjątek przy błędzie. */
  const applyRecord = async (rec: InvoicePpeRecord): Promise<string> => {
    await requireFeature('invoice_import', groupId);
    const p = planFor(rec);
    const { choice, fields, lines, osdId, other, capacity, reapply } = p;
    const update = reapply.write;
    const docSources = (vs: Record<string, unknown>) => {
      const page = rec.source_pages?.[0] ?? null;
      for (const f of Object.keys(update)) {
        if (reapply.restored.includes(f)) {
          const before = p.prevState?.applied?.[f]?.beforeSource;
          if (before) vs[f] = before; else delete vs[f];
          continue;
        }
        vs[f] = { source: 'document', document_id: doc.id, page };
      }
      for (const m of lines) if (m.target! in update) vs[m.target!] = { source: 'document', document_id: doc.id, page: m.item.page, item_ref: m.item.id };
      if (HANDLING_TARGET in update && !reapply.restored.includes(HANDLING_TARGET)) vs[HANDLING_TARGET] = { source: 'document', document_id: doc.id, page: rec.source_pages?.[0] ?? null, item_ref: p.handling.components.flatMap((c) => c.itemIds).join(','), components: p.handling.components };
      if (CAPACITY_TARGET in update) vs[CAPACITY_TARGET] = { source: 'document', document_id: doc.id, breakdown: capacity.breakdown };
      if (OTHER_SUM_TARGET in update) vs[OTHER_SUM_TARGET] = { source: 'document', document_id: doc.id, breakdown: other.breakdown };
      return vs;
    };
    const appliedList = [...Object.keys(update).filter((f) => !reapply.restored.includes(f))];
    const reviewState: ReviewState = {
      version: 1,
      choice,
      selectedFields: Array.from(fields),
      lineOverrides: lineOverrides[rec.id] || {},
      lineSelected: Array.from(p.selLines),
      otherMode: otherMode[rec.id] ?? null,
      osdChoice: p.osd.choice,
      osdApply: p.osd.apply,
      tariffChoice: tariffChoice[rec.id] ?? null,
      periodAck: !!periodAck[rec.id],
      // Migawka: pola zasilane teraz przez ten dokument (+ sumy jako wkład).
      applied: {
        ...reapply.applied,
        ...Object.fromEntries(reapply.manual.filter((m) => m.incoming !== undefined && p.prevState?.applied?.[m.field])
          .map((m) => [m.field, p.prevState!.applied![m.field]])),
      },
    };

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
    } else if (Object.keys(update).length) {
      const { data: cur, error: curErr } = await supabase.from('energy_analyses').select('value_sources').eq('id', choice).single();
      if (curErr) throw curErr;
      const vs = docSources({ ...((cur?.value_sources as Record<string, unknown>) || {}) });
      const { error } = await supabase.from('energy_analyses').update({ ...update, value_sources: vs } as never).eq('id', choice);
      if (error) throw error;
    }

    let q = supabase
      .from('document_ppe_records')
      .update({
        matched_analysis_id: analysisId,
        match_status: rec.applied_at ? rec.match_status : choice === '__new__' ? 'new' : 'matched',
        applied_fields: appliedList,
        applied_at: new Date().toISOString(),
        review_state: reviewState,
      } as never)
      .eq('id', rec.id);
    // Idempotencja: pierwszy zapis tylko gdy nie zastosowano; edycja tylko gdy nikt nie zapisał w międzyczasie.
    q = rec.applied_at ? q.eq('applied_at', rec.applied_at) : q.is('applied_at', null);
    const { error: recError } = await q;
    if (recError) throw recError;
    return analysisId;
  };

  const applyAll = async () => {
    if (applying || !access.canImport) return;
    const candidates = editing ? records.filter((r) => r.applied_at) : records.filter(canApplyRecord);
    const pending = access.multiPpe ? candidates : candidates.filter(r => r.id === (singleRecord || candidates[0]?.id));
    if (!pending.length) return;
    if (!access.multiPpe && pending.some(r => choiceFor(r) === '__new__' && ppes.length > 0)) {
      toast({ variant: 'destructive', title: 'Jeden PPE na analizę', description: 'Wybierz istniejący punkt lub utwórz osobną analizę dla kolejnego PPE.' });
      return;
    }
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
      if (p.fields.has('tariff_code_before' as ImportableField) && !p.tariff.code) {
        toast({ variant: 'destructive', title: 'Wybierz taryfę', description: `${label}: taryfa nie została jednoznacznie dopasowana — wybierz ją z listy.` });
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
      if (p.handling.conflicts.length) {
        toast({ variant: 'destructive', title: 'Opłata handlowa PRZED', description: `${label}: ${p.handling.conflicts.join(' ')}` });
        return;
      }
      const blocked = selectionProblems(p.maps, p.selLines);
      if (blocked.length) {
        toast({ variant: 'destructive', title: 'Nie wszystkie zaznaczone pozycje da się zastosować', description: `${label}: ${blocked.map((b) => `${b.name} — ${b.reason}`).join('; ')}. Odznacz je lub przypisz pole.` });
        return;
      }
      if (!editing && !Object.keys(p.reapply.write).length) {
        toast({ variant: 'destructive', title: 'Brak wybranych pól', description: `${label}: zaznacz pola do zastosowania.` });
        return;
      }
    }
    setApplying(true);
    try {
      const ids: string[] = editing ? [] : records.filter((r) => !canApplyRecord(r) && r.matched_analysis_id).map((r) => r.matched_analysis_id!);
      for (const rec of pending) {
        const id = await applyRecord(rec);
        ids.push(id);
        // Kontrola zapisu: pola sum muszą mieć w bazie dokładnie wyliczoną wartość.
        const w = planFor(rec).reapply.write;
        const sums = SUM_FIELDS.filter((f) => f in w);
        if (sums.length) {
          const { data: back, error: bErr } = await supabase.from('energy_analyses').select(sums.join(',')).eq('id', id).single();
          if (bErr) throw bErr;
          for (const f of sums) {
            if (Math.abs(Number((back as unknown as Record<string, unknown>)[f]) - Number(w[f])) > 0.005) {
              throw new Error(`${fieldLabel(f)}: zapisano ${showVal((back as unknown as Record<string, unknown>)[f])} zamiast ${showVal(w[f])}`);
            }
          }
        }
      }
      if (!editing) {
        const { error } = await supabase.from('analysis_documents').update({ status: 'approved' } as never).eq('id', doc.id);
        if (error) throw error;
      }
      onApplied(Array.from(new Set(ids)));
    } catch (e) {
      await recordsQuery.refetch();
      toast({ variant: 'destructive', title: 'Błąd zapisu', description: `${e instanceof Error ? e.message : 'Nieznany błąd'}. Twoje wybory zostały zachowane — spróbuj ponownie.` });
      setApplying(false);
    }
  };

  const warnings = doc.extracted?.warnings || [];

  return (
    <div className="mt-4 border-t pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{editing ? 'Edycja importu' : 'Podgląd'}: {doc.file_name}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>{editing ? 'Anuluj' : 'Zamknij podgląd'}</Button>
      </div>
      {editing && (
        <p className="text-xs text-muted-foreground">
          Zapisane wybory zostały przywrócone. „Zapisz zmiany i zastosuj” przelicza wkład tej faktury — wartości nie są dodawane drugi raz, a wkład innych faktur zostaje. Anulowanie niczego nie zmienia.
        </p>
      )}

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

      {!access.canImport && <p className="text-muted-foreground text-sm">Podgląd dokumentu — zastosowanie danych wymaga dostępu do funkcji Import faktur oraz prawa edycji analizy.</p>}
      {!access.multiPpe && records.length > 1 && access.canImport && <div className="space-y-2"><p className="text-sm">Bez dostępu do funkcji Analizy wielu PPE możesz zastosować jeden punkt z dokumentu. Pozostałe punkty pozostaną w podglądzie.</p><Select value={singleRecord || (editing ? records.find(r => r.applied_at)?.id : records.find(canApplyRecord)?.id)} onValueChange={setSingleRecord}><SelectTrigger><SelectValue placeholder="Wybierz jeden PPE z faktury" /></SelectTrigger><SelectContent>{records.filter(r => editing ? r.applied_at : canApplyRecord(r)).map(r => <SelectItem key={r.id} value={r.id}>{r.ppe_number || r.ppe_address || 'PPE bez numeru'}</SelectItem>)}</SelectContent></Select></div>}
      {recordsQuery.isLoading || !hydrated ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nie rozpoznano żadnego punktu PPE w tym dokumencie.</p>
      ) : (
        records.map((rec) => {
          const proposal = proposals[rec.id];
          const applied = !canApplyRecord(rec);
          const locked = !access.canImport || (applied && !editing) || (!access.multiPpe && records.length > 1 && rec.id !== (singleRecord || (editing ? records.find(r => r.applied_at)?.id : records.find(canApplyRecord)?.id)));
          const plan = planFor(rec);
          const { choice, target, diffs, defaults, fields, maps, selLines, consumption, tariff } = plan;
          const selCount = maps.filter((m) => selLines.has(m.item.id) && m.status === 'mapped' && m.converted != null).length;
          const zoneLabels = getZoneLabels(consumption.zones);

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

              {!applied && !locked && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Przypisz do:</span>
                  <Select value={choice} onValueChange={(v) => setMatchChoice((p) => ({ ...p, [rec.id]: v }))}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Wybierz punkt PPE" /></SelectTrigger>
                    <SelectContent>
                      {(access.multiPpe || ppes.length === 0) && <SelectItem value="__new__">Utwórz nowy PPE</SelectItem>}
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
              {target && (
                <p className="text-sm rounded bg-muted px-2 py-1">
                  Dane trafią do punktu: <span className="font-semibold">{target.name}</span>
                  {target.ppe_number ? ` (PPE ${target.ppe_number})` : ''}
                </p>
              )}

              {!locked && (
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Taryfa z faktury:</span>
                    <span className="font-medium">{tariff.match.original || 'nie odczytano'}</span>
                    <span className="text-muted-foreground">→</span>
                    <Select value={tariff.code ?? ''} onValueChange={(v) => setTariffChoice((p) => ({ ...p, [rec.id]: v }))}>
                      <SelectTrigger className="w-40 h-8"><SelectValue placeholder="Wybierz taryfę" /></SelectTrigger>
                      <SelectContent>
                        {TARIFF_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {tariff.code && <span className="text-xs text-muted-foreground">{getZonesCount(tariff.code)} strefy/a: {getZoneLabels(getZonesCount(tariff.code)).join(', ')}</span>}
                  </div>
                  {tariff.match.original && !tariff.match.code && (
                    <p className="text-xs text-warning flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />Kodu „{tariff.match.original}” nie ma w słowniku kalkulatora — wybierz taryfę ręcznie.</p>
                  )}
                  {tariff.conflict && (
                    <p className="text-xs text-warning flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      Konflikt: faktury tego PPE podają różne taryfy — {tariff.conflict.map((c) => `${c.code} (${c.period_from || '?'} – ${c.period_to || '?'})`).join(', ')}. Wybierz właściwą.
                    </p>
                  )}
                </div>
              )}

              {diffs.length > 0 && (
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
                            disabled={locked}
                            checked={fields.has(d.field)}
                            onCheckedChange={() => toggleField(rec.id, d.field, defaults)}
                            aria-label={`Zastosuj ${d.label}`}
                          />
                        </td>
                        <td className="py-1 pr-2">{d.label}</td>
                        <td className="py-1 pr-2">{showVal(d.current)}</td>
                        <td className="py-1 font-medium">{showVal(d.incoming)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {consumption.rows.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-xs">
                  <p className="text-sm font-medium">Zużycie energii czynnej z faktury → strefy PRZED</p>
                  <table className="w-full">
                    <thead><tr className="text-left text-muted-foreground"><th className="pr-2">Strefa na fakturze</th><th className="pr-2">Odczytano</th><th className="pr-2">MWh</th><th>Pole kalkulatora</th></tr></thead>
                    <tbody>
                      {consumption.rows.map((r, i) => (
                        <tr key={i} className="align-top">
                          <td className="pr-2">{r.zone_name || '—'}</td>
                          <td className="pr-2">{r.value != null ? `${fmtNum(r.value)} ${r.unit || ''}` : '—'}</td>
                          <td className="pr-2">{r.mwh != null ? fmtNum(r.mwh, 9) : '—'}</td>
                          <td>
                            {r.zone === 'total' ? 'Zużycie łączne (kontrola)' : typeof r.zone === 'number' && r.zone <= consumption.zones ? `Strefa ${r.zone} — ${zoneLabels[r.zone - 1]}` : '—'}
                            {r.note && <span className="block text-warning">{r.note}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {consumption.missing.length > 0 && <p className="text-warning">Brak odczytu dla strefy {consumption.missing.join(', ')} — pole zostaje bez zmian (brak danych, nie zero).</p>}
                  {consumption.conflicts.length > 0 && <p className="text-warning">Strefa {consumption.conflicts.join(', ')}: różne wartości w tym samym okresie — nie zsumowano, wpisz ręcznie.</p>}
                  {consumption.mismatch && consumption.totalMwh != null && (
                    <p className="text-warning">Suma stref ({fmtNum(Object.values(consumption.values).reduce((s, v) => s + (v || 0), 0), 9)} MWh) różni się od zużycia łącznego z faktury ({fmtNum(consumption.totalMwh, 9)} MWh).</p>
                  )}
                </div>
              )}

              {!locked && (() => {
                const o = plan.osd;
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

              {!locked && capacityGroup(maps).length > 0 && (
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
                  applied={locked}
                  target={target}
                  onToggle={(id) => toggleLine(rec.id, id, maps)}
                  onSelectClean={() => setLineSelected((p) => ({ ...p, [rec.id]: new Set([...(p[rec.id] ?? selLines), ...maps.filter(isCleanMapping).map((m) => m.item.id)]) }))}
                  onAssign={(id, t) => setLineOverrides((p) => ({ ...p, [rec.id]: { ...(p[rec.id] || {}), [id]: t } }))}
                />
              )}

              {!locked && (plan.other.items.length > 0 || plan.other.previousSameDoc > 0) && (
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

              {!locked && (plan.handling.components.length > 0 || plan.handling.conflicts.length > 0) && (
                <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-xs">
                  <p className="text-sm font-medium">{LINE_TARGET_LABELS[HANDLING_TARGET]}</p>
                  {plan.handling.components.map((c) => (
                    <p key={c.label} className="flex justify-between"><span>{c.label}{c.itemIds.length > 1 ? ` (${c.itemIds.length} pozycje, ta sama stawka — liczona raz)` : ''}</span><span>{formatCurrency(c.monthly)}/mies.</span></p>
                  ))}
                  {plan.handling.conflicts.map((c) => <p key={c} className="text-warning">{c}</p>)}
                  <p>Obecna wartość pola: {target?.handling_fee_before != null ? `${formatCurrency(Number(target.handling_fee_before))}/mies.` : '—'}</p>
                  <p className="font-medium">Po zastosowaniu: {plan.handling.total != null ? `${formatCurrency(plan.handling.total)}/mies.` : '—'}{plan.handling.components.length > 1 ? ' (suma składników)' : ''}</p>
                </div>
              )}

              {!locked && plan.reapply.manual.length > 0 && (
                <div className="rounded-md border border-warning/50 bg-warning/10 p-3 space-y-2 text-xs">
                  <p className="text-sm font-medium flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-warning" />Ręczne zmiany po imporcie</p>
                  <p>Te pola zmieniono w kalkulatorze po zatwierdzeniu faktury. Domyślnie zostają bez zmian.</p>
                  {plan.reapply.manual.map((m) => {
                    const on = !!replaceManual[rec.id]?.has(m.field);
                    return (
                      <label key={m.field} className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) => setReplaceManual((p) => {
                            const cur = new Set(p[rec.id] || []);
                            if (v === true) cur.add(m.field); else cur.delete(m.field);
                            return { ...p, [rec.id]: cur };
                          })}
                          aria-label={`Zastąp ręczną zmianę: ${fieldLabel(m.field)}`}
                        />
                        <span>
                          <span className="font-medium">{fieldLabel(m.field)}</span>: z faktury zapisano {showVal(m.applied)}, obecnie {showVal(m.current)}
                          {m.incoming === undefined
                            ? ' — pozycja odznaczona. Zaznacz, aby przywrócić wartość sprzed importu.'
                            : ` — zaznacz, aby zastąpić wartością z faktury ${showVal(m.incoming)}.`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {!locked && editing && plan.reapply.restored.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Po zapisie wrócą wartości sprzed importu: {plan.reapply.restored.map(fieldLabel).join(', ')}.
                </p>
              )}

              {!locked && (
                <p className="text-xs text-muted-foreground">
                  Do zastosowania: {fields.size} pól PPE{plan.osdId ? ', operator OSD' : ''}, {selCount} stawek i opłat.
                </p>
              )}
            </div>
          );
        })
      )}
      {access.canImport && (editing ? records.some((r) => r.applied_at) : records.some(canApplyRecord)) && (
        <div className="flex gap-2">
          <Button onClick={applyAll} disabled={applying || !hydrated}>
            {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {applying ? 'Zapisywanie…' : editing ? 'Zapisz zmiany i zastosuj' : 'Zatwierdź i zastosuj'}
          </Button>
          {editing && <Button variant="outline" onClick={onClose} disabled={applying}>Anuluj</Button>}
        </div>
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
      <p>Wybrano pozycji: {plan.items.length}</p>
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
