import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Loader2, Download } from 'lucide-react';
import type { EnergyAnalysis, ClientProject } from '@/types/database';
import { calculateEnergyCosts, formatCurrency, formatPercent, formatNumber } from '@/lib/calculation-utils';
import { getZoneLabels } from '@/lib/tariff-utils';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import logo from '@/assets/logo.png';
import { useAuth } from '@/contexts/AuthContext';
import { exportElementToPdf } from '@/lib/pdf-export';

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
  const zonesCountBefore = analysis.zones_count_before || 1;
  const zonesCountAfter = analysis.zones_count_after || 1;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!reportContentRef.current) return;
    
    setIsGeneratingPdf(true);
    try {
      await exportElementToPdf(reportContentRef.current, {
        filename: pdfTitle,
        marginMm: 10,
        scale: 2,
        // Kluczowe: nie dziel sekcji oznaczonych jako print-avoid-break (m.in. Podsumowanie)
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
          <div className="flex gap-2">
            {/* Przycisk Drukuj ukryty na życzenie użytkownika - można przywrócić w razie potrzeby */}
            {/* <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Drukuj
            </Button> */}
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
      </div>

      {/* Report Content */}
      <div ref={reportContentRef} className="max-w-4xl mx-auto px-8 py-8 print:py-4 print:px-6 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-primary/20">
          <div className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Optienergia" 
              className="h-12 w-auto"
            />
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Raport z analizy</p>
            <p className="font-medium">{format(new Date(), 'd MMMM yyyy', { locale: pl })}</p>
            <p className="mt-1">Przygotował: {profile?.name || user?.email || 'Nieznany'}</p>
            {profile?.name && user?.email && <p className="text-xs">{user.email}</p>}
          </div>
        </div>

        {/* Client Info */}
        <section className="mb-8 print-avoid-break">
          <h2 className="text-lg font-display font-semibold mb-4 text-primary">Dane klienta</h2>
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Nazwa klienta</p>
              <p className="font-medium">{project.client_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">NIP</p>
              <p className="font-medium">{project.client_nip}</p>
            </div>
            {project.client_address && (
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Adres</p>
                <p className="font-medium">{project.client_address}</p>
              </div>
            )}
          </div>
        </section>

        {/* Analysis Info */}
        <section className="mb-8 print-avoid-break">
          <h2 className="text-lg font-display font-semibold mb-4 text-primary">Informacje o analizie</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Nazwa analizy</p>
              <p className="font-medium">{analysis.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Okres analizy</p>
              <p className="font-medium">
                {analysis.period_from && analysis.period_to
                  ? `${format(new Date(analysis.period_from), 'd.MM.yyyy')} - ${format(new Date(analysis.period_to), 'd.MM.yyyy')} (${results.periodMonths} mies.)`
                  : 'Nie określono'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Taryfa PRZED</p>
              <p className="font-medium">{analysis.tariff_code_before}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Taryfa PO</p>
              <p className="font-medium">{analysis.tariff_code_after}</p>
            </div>
          </div>
        </section>

        {/* Cost Comparison Table */}
        <section className="mb-8 print-avoid-break">
          <h2 className="text-lg font-display font-semibold mb-4 text-primary">Porównanie kosztów za okres analizy</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border border-border px-4 py-3 text-left font-semibold">Składnik kosztu</th>
                  <th className="border border-border px-4 py-3 text-right font-semibold">PRZED [zł]</th>
                  <th className="border border-border px-4 py-3 text-right font-semibold">PO [zł]</th>
                  <th className="border border-border px-4 py-3 text-right font-semibold">Różnica [zł]</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Energia czynna</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.activeEnergyCostBefore)}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.activeEnergyCostAfter)}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${results.activeEnergyCostBefore - results.activeEnergyCostAfter > 0 ? 'text-success' : results.activeEnergyCostBefore - results.activeEnergyCostAfter < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.activeEnergyCostBefore - results.activeEnergyCostAfter))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Składnik zmienny stawki sieciowej</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.distributionCostBefore)}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.distributionCostAfter)}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${results.distributionCostBefore - results.distributionCostAfter > 0 ? 'text-success' : results.distributionCostBefore - results.distributionCostAfter < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.distributionCostBefore - results.distributionCostAfter))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Opłata za moc umowną ({results.periodMonths} mies.)</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.contractedPowerChargeBefore)}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.contractedPowerChargeAfter)}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${results.contractedPowerChargeBefore - results.contractedPowerChargeAfter > 0 ? 'text-success' : results.contractedPowerChargeBefore - results.contractedPowerChargeAfter < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.contractedPowerChargeBefore - results.contractedPowerChargeAfter))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Opłata mocowa</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.capacityChargeBefore)}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.capacityChargeAfter)}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${results.capacityChargeBefore - results.capacityChargeAfter > 0 ? 'text-success' : results.capacityChargeBefore - results.capacityChargeAfter < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.capacityChargeBefore - results.capacityChargeAfter))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Energia bierna</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.reactiveEnergyCostBefore)}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.reactiveEnergyCostAfter)}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${results.reactiveEnergyCostBefore - results.reactiveEnergyCostAfter > 0 ? 'text-success' : results.reactiveEnergyCostBefore - results.reactiveEnergyCostAfter < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.reactiveEnergyCostBefore - results.reactiveEnergyCostAfter))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Opłata handlowa</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.handlingFeeBefore)}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(results.handlingFeeAfter)}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${results.handlingFeeBefore - results.handlingFeeAfter > 0 ? 'text-success' : results.handlingFeeBefore - results.handlingFeeAfter < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.handlingFeeBefore - results.handlingFeeAfter))}
                  </td>
                </tr>
                <tr>
                  <td className="border border-border px-4 py-2 font-medium">Suma pozostałych opłat</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(Number(analysis.fixed_distribution_before_total))}</td>
                  <td className="border border-border px-4 py-2 text-right">{formatCurrency(Number(analysis.fixed_distribution_after_total))}</td>
                  <td className={`border border-border px-4 py-2 text-right font-medium ${Number(analysis.fixed_distribution_before_total) - Number(analysis.fixed_distribution_after_total) > 0 ? 'text-success' : Number(analysis.fixed_distribution_before_total) - Number(analysis.fixed_distribution_after_total) < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(Number(analysis.fixed_distribution_before_total) - Number(analysis.fixed_distribution_after_total)))}
                  </td>
                </tr>
                <tr className="bg-primary/10 font-bold">
                  <td className="border border-border px-4 py-3">RAZEM</td>
                  <td className="border border-border px-4 py-3 text-right">{formatCurrency(results.totalCostBefore)}</td>
                  <td className="border border-border px-4 py-3 text-right">{formatCurrency(results.totalCostAfter)}</td>
                  <td className={`border border-border px-4 py-3 text-right ${results.savingsValue > 0 ? 'text-success' : results.savingsValue < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(Math.abs(results.savingsValue))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Parameters Summary */}
        <section className="mb-8 print-avoid-break">
          <h2 className="text-lg font-display font-semibold mb-4 text-primary">Parametry analizy</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2 text-muted-foreground">Moc umowna</h3>
              <div className="space-y-1 text-sm">
                <p>PRZED: <span className="font-medium">{formatNumber(Number(analysis.contracted_power_before_kw))} kW × {formatNumber(Number(analysis.contracted_power_charge_rate_before))} zł/kW/mies.</span></p>
                <p>PO: <span className="font-medium">{formatNumber(Number(analysis.contracted_power_after_kw))} kW × {formatNumber(Number(analysis.contracted_power_charge_rate_after))} zł/kW/mies.</span></p>
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2 text-muted-foreground">Zużycie energii PRZED [MWh]</h3>
              <div className="space-y-1 text-sm">
                <p>Strefa 1: <span className="font-medium">{formatNumber(Number(analysis.consumption_before_zone1_mwh), 2)} MWh</span></p>
                {zonesCountBefore >= 2 && (
                  <p>Strefa 2: <span className="font-medium">{formatNumber(Number(analysis.consumption_before_zone2_mwh), 2)} MWh</span></p>
                )}
                {zonesCountBefore >= 3 && (
                  <p>Strefa 3: <span className="font-medium">{formatNumber(Number(analysis.consumption_before_zone3_mwh), 2)} MWh</span></p>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2 text-muted-foreground">Zużycie energii PO [MWh]</h3>
              <div className="space-y-1 text-sm">
                <p>Strefa 1: <span className="font-medium">{formatNumber(Number(analysis.consumption_after_zone1_mwh), 2)} MWh</span></p>
                {zonesCountAfter >= 2 && (
                  <p>Strefa 2: <span className="font-medium">{formatNumber(Number(analysis.consumption_after_zone2_mwh), 2)} MWh</span></p>
                )}
                {zonesCountAfter >= 3 && (
                  <p>Strefa 3: <span className="font-medium">{formatNumber(Number(analysis.consumption_after_zone3_mwh), 2)} MWh</span></p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Summary Box */}
        <section className="print-avoid-break">
          <div className="p-6 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border-2 border-primary/20">
            <h2 className="text-xl font-display font-bold mb-4 text-center">Podsumowanie</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-background rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Koszt PRZED</p>
                <p className="text-xl font-bold">{formatCurrency(results.totalCostBefore)}</p>
                <p className="text-xs text-muted-foreground">za okres</p>
              </div>
              <div className="p-4 bg-background rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Koszt PO</p>
                <p className="text-xl font-bold">{formatCurrency(results.totalCostAfter)}</p>
                <p className="text-xs text-muted-foreground">za okres</p>
              </div>
              <div className="p-4 bg-background rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Oszczędność</p>
                <p className={`text-xl font-bold ${results.savingsValue > 0 ? 'text-success' : results.savingsValue < 0 ? 'text-destructive' : ''}`}>
                  {formatCurrency(Math.abs(results.savingsValue))}
                </p>
                <p className="text-xs text-muted-foreground">za okres</p>
              </div>
              <div className="p-4 bg-background rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Oszczędność</p>
                <p className={`text-xl font-bold ${results.savingsValue > 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatPercent(results.savingsPercent)}
                </p>
                <p className="text-xs text-muted-foreground">procentowo</p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src={logo} alt="Optienergia" className="h-6 w-auto" />
            <span>• {format(new Date(), 'd MMMM yyyy, HH:mm', { locale: pl })}</span>
          </div>
          <p className="mb-1">
            <a href="https://www.optienergia.pl" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              www.optienergia.pl
            </a>
          </p>
          <p>Niniejszy dokument ma charakter informacyjny i nie stanowi oferty handlowej.</p>
        </footer>
      </div>
    </div>
  );
}
