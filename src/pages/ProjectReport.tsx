import React, { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import type { ClientProject, EnergyAnalysis } from '@/types/database';
import { calculateProjectTotals } from '@/lib/project-totals';
import { exportElementToPdf } from '@/lib/pdf-export';
import { useAuth } from '@/contexts/AuthContext';
import { NO_PPE_CONFIRM_KEY } from '@/components/project/ProjectAggregatePanel';
import AnalysisPdfDocument from '@/components/pdf/AnalysisPdfDocument';
import MultiPpePdfDocument from '@/components/pdf/MultiPpePdfDocument';

const safe = (v: string) => v.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Report of one savings analysis (analysis_groups row) covering its selected PPE. */
export default function ProjectReport() {
  const { projectId, groupId } = useParams<{ projectId: string; groupId: string }>();
  const { profile, user } = useAuth();
  const pdfRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const { data: project, isLoading: l1 } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_projects').select('*').eq('id', projectId).maybeSingle();
      if (error) throw error;
      return data as ClientProject | null;
    },
    enabled: !!projectId,
  });
  const { data: analyses, isLoading: l2 } = useQuery({
    queryKey: ['group-ppe', groupId],
    queryFn: async () => {
      const { data, error } = await supabase.from('energy_analyses').select('*').eq('client_project_id', projectId!).eq('analysis_group_id', groupId!).order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as EnergyAnalysis[];
    },
    enabled: !!projectId && !!groupId,
  });
  const { data: group, isLoading: l3 } = useQuery({
    queryKey: ['analysis-group', groupId],
    queryFn: async () => {
      const { data, error } = await supabase.from('analysis_groups').select('*').eq('id', groupId!).eq('client_project_id', projectId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && !!groupId,
  });

  const { data: osdList } = useQuery({
    queryKey: ['osd-operators-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('osd_operators').select('id, name');
      if (error) throw error;
      return data || [];
    },
  });
  const osdNames = useMemo(() => Object.fromEntries((osdList || []).map((o: { id: string; name: string }) => [o.id, o.name])), [osdList]);

  const selected = useMemo(() => (analyses || []).filter((a) => a.include_in_project_report), [analyses]);
  const t = useMemo(() => calculateProjectTotals(selected), [selected]);
  const confirmed = groupId ? sessionStorage.getItem(NO_PPE_CONFIRM_KEY(groupId!)) === '1' : false;
  const needsConfirm = t.withoutPpeNumber > 0 && selected.length > 1;
  const blockedReason =
    selected.length === 0 ? 'Nie wybrano żadnego PPE do raportu tej analizy.'
    : t.duplicatePpe.length ? `Wybrano kilka wariantów tego samego PPE (${t.duplicatePpe.join(', ')}).`
    : t.invalid.length ? `Niekompletne dane w PPE: ${t.invalid.map((e) => e.analysis.name).join(', ')}. Uzupełnij je lub odznacz.`
    : needsConfirm && !confirmed ? 'Potwierdź na stronie analizy, że pozycje bez numeru PPE dotyczą różnych punktów.'
    : null;

  const preparerName = profile?.name || user?.email || 'Nieznany';
  const preparerEmail = profile?.name && user?.email ? user.email : undefined;
  const single = selected.length === 1 ? t.entries[0] : null;

  if (l1 || l2 || l3) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project || !group) return <div className="min-h-screen flex items-center justify-center"><Button asChild><Link to="/projects">Wróć do projektów</Link></Button></div>;

  const download = async () => {
    if (!pdfRef.current) return;
    setBusy(true);
    try {
      await exportElementToPdf(pdfRef.current, {
        filename: `NIP: ${project.client_nip}_${safe(project.client_name)}_${safe(group.name)}_raport Optienergia_${safe(preparerName)}`,
        marginMm: 0, scale: single ? 3 : 2, avoidBreakSelector: '.print-avoid-break', minSliceDomPx: 200,
        ...(single ? {} : { pageSelector: '.print-avoid-break' }),
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}/analyses/${groupId}`}><ArrowLeft className="h-4 w-4 mr-2" />Wróć do analizy</Link>
          </Button>
          <Button onClick={download} disabled={busy || !!blockedReason || (!single && !ready)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Pobierz PDF
          </Button>
        </div>
      </div>

      {blockedReason ? (
        <p className="text-center py-20 text-muted-foreground">{blockedReason}</p>
      ) : (
        <div className="flex justify-center py-8">
          <div ref={pdfRef} data-pdf-root="true">
            {single ? (
              <AnalysisPdfDocument
                analysis={single.analysis as EnergyAnalysis}
                project={project}
                results={single.result}
                preparerName={preparerName}
                preparerEmail={preparerEmail}
                coverSubtitle={<>{group.name}<br /><span style={{ fontSize: 13, opacity: 0.8 }}>{single.analysis.name}{single.analysis.ppe_number ? ` • PPE: ${single.analysis.ppe_number}` : ''}{single.analysis.ppe_address ? ` • ${single.analysis.ppe_address}` : ''}</span></>}
              />
            ) : (
              <MultiPpePdfDocument
                project={project}
                groupName={group.name}
                totals={t}
                osdNames={osdNames}
                preparerName={preparerName}
                preparerEmail={preparerEmail}
                onPaginated={() => setReady(true)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
