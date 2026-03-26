import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Download } from 'lucide-react';
import type { EnergyAnalysis, ClientProject } from '@/types/database';
import { calculateEnergyCosts } from '@/lib/calculation-utils';
import { useAuth } from '@/contexts/AuthContext';
import { exportElementToPdf } from '@/lib/pdf-export';
import AnalysisPdfDocument from '@/components/pdf/AnalysisPdfDocument';

export default function AnalysisReport() {
  const { projectId, analysisId } = useParams<{ projectId: string; analysisId: string }>();
  const { profile, user } = useAuth();
  const previousTitleRef = useRef<string>('');
  const reportContentRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      return data as ClientProject | null;
    },
    enabled: !!projectId,
  });

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['analysis', analysisId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('energy_analyses')
        .select('*')
        .eq('id', analysisId)
        .maybeSingle();
      if (error) throw error;
      return data as EnergyAnalysis | null;
    },
    enabled: !!analysisId,
  });

  const pdfTitle = useMemo(() => {
    const nip = project?.client_nip?.trim() || 'brak-NIP';
    const rawName = (profile?.name || user?.email || 'Nieznany')
      .toString()
      .trim();
    // Friendly filename safety: remove filesystem-invalid characters
    const safeName = rawName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return `NIP: ${nip}_raport Optienergia_${safeName}`;
  }, [project?.client_nip, profile?.name, user?.email]);

  // Set dynamic document title for PDF filename
  useEffect(() => {
    // ustawiaj tytuł gdy tylko mamy NIP (nazwa użytkownika ma fallback)
    if (project) document.title = pdfTitle;
  }, [project, pdfTitle]);

  // Upewnij się, że przeglądarka użyje aktualnego tytułu jako nazwy PDF (Chrome/Edge)
  useEffect(() => {
    const handleBeforePrint = () => {
      previousTitleRef.current = document.title;
      if (project) document.title = pdfTitle;
    };
    const handleAfterPrint = () => {
      if (previousTitleRef.current) document.title = previousTitleRef.current;
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [project, pdfTitle]);


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analysis || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Nie znaleziono analizy</p>
          <Button asChild>
            <Link to={`/projects/${projectId}`}>Wróć do projektu</Link>
          </Button>
        </div>
      </div>
    );
  }

  const results = calculateEnergyCosts(analysis);

  const preparerName = profile?.name || user?.email || 'Nieznany';
  const preparerEmail = profile?.name && user?.email ? user.email : undefined;

  const handleDownloadPdf = async () => {
    if (!reportContentRef.current) return;
    setIsGeneratingPdf(true);
    try {
      await exportElementToPdf(reportContentRef.current, {
        filename: pdfTitle,
        marginMm: 0,
        scale: 3,
        avoidBreakSelector: '.print-avoid-break',
        minSliceDomPx: 200,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Print controls */}
      <div className="no-print sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}/analysis/${analysisId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Wróć do edycji
            </Link>
          </Button>
          <Button onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
            {isGeneratingPdf ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Pobierz PDF
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex justify-center py-8 no-print-margin">
        <div ref={reportContentRef} data-pdf-root="true">
          <AnalysisPdfDocument
            analysis={analysis}
            project={project}
            results={results}
            preparerName={preparerName}
            preparerEmail={preparerEmail}
          />
        </div>
      </div>
    </div>
  );
}
