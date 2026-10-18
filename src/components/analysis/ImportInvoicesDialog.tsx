import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);

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
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvoiceReview({ document: doc, ppes, projectId, groupId, onClose }: {
  document: AnalysisDocument;
  ppes: EnergyAnalysis[];
  projectId: string;
  groupId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<ImportableField>>>({});
  const [matchChoice, setMatchChoice] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);

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

  const applyRecord = async (rec: InvoicePpeRecord) => {
    if (!canApplyRecord(rec)) return;
    const proposal = proposals[rec.id];
    const choice = matchChoice[rec.id] ?? (proposal.status === 'matched' ? proposal.analysisId! : proposal.status === 'new' ? '__new__' : '');
    if (!choice) {
      toast({ variant: 'destructive', title: 'Wymagane przypisanie', description: 'Wybierz punkt PPE lub utwórz nowy.' });
      return;
    }
    const target = choice === '__new__' ? null : ppes.find((p) => p.id === choice) || null;
    const diffs = diffAgainstAnalysis(rec, target);
    const defaults = new Set(diffs.filter((d) => d.changed).map((d) => d.field));
    const fields = selectedFields[rec.id] ?? defaults;
    if (!fields.size) {
      toast({ variant: 'destructive', title: 'Brak wybranych pól', description: 'Zaznacz pola do zastosowania.' });
      return;
    }

    setApplying(true);
    try {
      const update: Record<string, unknown> = {};
      for (const d of diffs) if (fields.has(d.field)) update[d.field] = d.incoming;

      let analysisId = choice;
      if (choice === '__new__') {
        const name = rec.ppe_number ? `PPE ${rec.ppe_number}` : `PPE ${ppes.length + 1}`;
        const vs: Record<string, unknown> = {};
        for (const f of fields) vs[f] = { source: 'document', document_id: doc.id };
        const { data, error } = await supabase
          .from('energy_analyses')
          .insert({ client_project_id: projectId, analysis_group_id: groupId, name, ...update, value_sources: vs } as never)
          .select('id').single();
        if (error) throw error;
        analysisId = data.id;
      } else {
        // value_sources: oznacz pola jako odczytane z dokumentu
        const { data: cur } = await supabase.from('energy_analyses').select('value_sources').eq('id', choice).single();
        const vs = { ...((cur?.value_sources as Record<string, unknown>) || {}) };
        for (const f of fields) vs[f] = { source: 'document', document_id: doc.id };
        const { error } = await supabase.from('energy_analyses').update({ ...update, value_sources: vs } as never).eq('id', choice);
        if (error) throw error;
      }

      const { error: recError } = await supabase
        .from('document_ppe_records')
        .update({
          matched_analysis_id: analysisId,
          match_status: choice === '__new__' ? 'new' : 'matched',
          applied_fields: Array.from(fields),
          applied_at: new Date().toISOString(),
        } as never)
        .eq('id', rec.id)
        .is('applied_at', null); // idempotentność: nie nadpisuj zastosowanego rekordu
      if (recError) throw recError;

      // Dokument zatwierdzony, gdy wszystkie rekordy zastosowane
      const remaining = records.filter((r) => r.id !== rec.id && !r.applied_at);
      if (!remaining.length) {
        await supabase.from('analysis_documents').update({ status: 'approved' } as never).eq('id', doc.id);
      }
      toast({ title: 'Zastosowano dane', description: `${rec.ppe_number || 'PPE'}: ${fields.size} pól.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Błąd zapisu', description: e instanceof Error ? e.message : 'Spróbuj ponownie — nic nie zostało zdublowane.' });
    } finally {
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
          const recItems = items.filter((li: { ppe_record_id?: string }) => li.ppe_record_id === rec.id);

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

              {recItems.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Pozycje kosztowe z faktury ({recItems.length}) — do porównania, nie są przenoszone automatycznie</summary>
                  <table className="w-full mt-2 text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2">Nazwa</th>
                        <th className="py-1 pr-2">Ilość</th>
                        <th className="py-1 pr-2">Stawka</th>
                        <th className="py-1">Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recItems.map((li: { id: string; name: string; quantity: number | null; unit: string | null; rate: number | null; net_value: number | null }) => (
                        <tr key={li.id}>
                          <td className="py-1 pr-2">{li.name}</td>
                          <td className="py-1 pr-2">{li.quantity ?? '—'} {li.unit || ''}</td>
                          <td className="py-1 pr-2">{li.rate ?? '—'}</td>
                          <td className="py-1">{li.net_value != null ? formatCurrency(li.net_value) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}

              {!applied && (
                <Button size="sm" onClick={() => applyRecord(rec)} disabled={applying}>
                  {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Zatwierdź i zastosuj ({fields.size} pól)
                </Button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
