import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Loader2,
  AlertCircle,
  Printer,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
} from 'lucide-react';
import type { EnergyAnalysis, ClientProject, ResolvedRates } from '@/types/database';
import { TARIFF_CODES, getZonesCount, getZoneLabels, validateContractedPower, calculatePeriodMonths, getDefaultDistribution } from '@/lib/tariff-utils';
import { normalizeTariffCode } from '@/lib/invoice-import';
import { calculateEnergyCosts, formatCurrency, formatPercent, formatNumber } from '@/lib/calculation-utils';
import { ReactiveEnergyInput } from '@/components/analysis/ReactiveEnergyInput';
import { RatesInputPanel } from '@/components/analysis/RatesInputPanel';
import { ConsumptionMapping } from '@/components/analysis/ConsumptionMapping';
import { ConsumptionMappingBefore } from '@/components/analysis/ConsumptionMappingBefore';
import { ComparisonSummary } from '@/components/analysis/ComparisonSummary';
import { InvoiceGapsNotice, IncompletePoNotice } from '@/components/analysis/InvoiceGapsNotice';
import { useOsdOperators } from '@/hooks/useOsdOperators';
import { useRatesResolver } from '@/hooks/useRatesResolver';
import { useVisibleTariffsForOsd } from '@/hooks/useVisibleTariffsForOsd';
import { cn } from '@/lib/utils';
import { useGroupFeatureAccess, requireFeature } from '@/hooks/useFeatureAccess';
import { MULTI_PPE_LOCK_MESSAGE } from '@/lib/feature-access';
import { AssistantPanel, AssistantContextButton, openAssistant } from '@/components/assistant/AssistantPanel';
import { assistantIssues } from '@/lib/assistant-context';
import { Bot } from 'lucide-react';
import { initialRatesYear, canAutoApplyRates, markSources, rateBaseFields, type ValueSources, type RatesSourceSnapshot } from '@/lib/value-sources';

// Signature of the parameters rates were last fetched for (used to auto-fetch
// only when OSD / tariff / season / rates year actually change).
const ratesSignature = (
  osdId: unknown,
  tariff: unknown,
  season: unknown,
  year: string
) => `${osdId ?? ''}|${String(tariff ?? '').toUpperCase()}|${season ?? 'ALL'}|${year}`;

const WIZARD_STEPS = [
  { id: 'client', label: 'Klient', description: 'Dane klienta' },
  { id: 'osd', label: 'OSD', description: 'Operator i okres' },
  { id: 'power', label: 'Moc', description: 'Parametry techniczne' },
  { id: 'before', label: 'PRZED', description: 'Stan obecny' },
  { id: 'after', label: 'PO', description: 'Stan po zmianie' },
  { id: 'summary', label: 'Podsumowanie', description: 'Porównanie' },
] as const;

type StepId = typeof WIZARD_STEPS[number]['id'];

export default function AnalysisFormRoute() {
  const { analysisId } = useParams<{ analysisId: string }>();
  // Remount per analysis so a newly added PPE never inherits state from the previous one.
  return <AnalysisForm key={analysisId} />;
}

function AnalysisForm() {
  const { projectId, analysisId } = useParams<{ projectId: string; analysisId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState<StepId>('client');
  const [formData, setFormData] = useState<Partial<EnergyAnalysis>>({
    name: 'Nowa analiza',
    tariff_code_before: 'C11',
    tariff_code_after: 'C11',
    zones_count_before: 1,
    zones_count_after: 1,
    contracted_power_before_kw: 0,
    contracted_power_after_kw: 0,
    shared_power_mode: true,
    season_before: 'ALL',
    season_after: 'ALL',
    osd_id: null,
    rates_date: new Date().toISOString().split('T')[0],
    rates_overridden_before: {},
    rates_overridden_after: {},
    fixed_distribution_before_total: 0,
    variable_distribution_before_zone1_rate: 0,
    variable_distribution_before_zone2_rate: 0,
    variable_distribution_before_zone3_rate: 0,
    reactive_energy_cost_before: 0,
    capacity_charge_before: 0,
    contracted_power_charge_rate_before: 0,
    reactive_monthly_mode_before: false,
    fixed_distribution_after_total: 0,
    variable_distribution_after_zone1_rate: 0,
    variable_distribution_after_zone2_rate: 0,
    variable_distribution_after_zone3_rate: 0,
    reactive_energy_cost_after: 0,
    capacity_charge_after: 0,
    contracted_power_charge_rate_after: 0,
    reactive_monthly_mode_after: false,
    active_energy_price_before_zone1: 0,
    active_energy_price_before_zone2: 0,
    active_energy_price_before_zone3: 0,
    consumption_before_zone1_mwh: 0,
    consumption_before_zone2_mwh: 0,
    consumption_before_zone3_mwh: 0,
    consumption_after_zone1_mwh: 0,
    consumption_after_zone2_mwh: 0,
    consumption_after_zone3_mwh: 0,
    consumption_zone1_mwh: 0,
    consumption_zone2_mwh: 0,
    consumption_zone3_mwh: 0,
    active_energy_price_after_zone1: 0,
    active_energy_price_after_zone2: 0,
    active_energy_price_after_zone3: 0,
    handling_fee_before: 0,
    handling_fee_after: 0,
    consultant_notes: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [resolvedRatesBefore, setResolvedRatesBefore] = useState<ResolvedRates | null>(null);
  const [resolvedRatesAfter, setResolvedRatesAfter] = useState<ResolvedRates | null>(null);
  const [isManualModeBefore, setIsManualModeBefore] = useState(false);
  const [isManualModeAfter, setIsManualModeAfter] = useState(false);
  const [overriddenBefore, setOverriddenBefore] = useState<Record<string, number>>({});
  const [overriddenAfter, setOverriddenAfter] = useState<Record<string, number>>({});
  const [isAutoConsumptionMode, setIsAutoConsumptionMode] = useState(true);
  const [zoneDistribution, setZoneDistribution] = useState<number[]>(() => getDefaultDistribution(1));
  const [isAutoConsumptionModeBefore, setIsAutoConsumptionModeBefore] = useState(true);
  const [zoneDistributionBefore, setZoneDistributionBefore] = useState<number[]>(() => getDefaultDistribution(1));
  const [totalConsumptionBefore, setTotalConsumptionBefore] = useState<number>(0);
  const [ratesYearBefore, setRatesYearBefore] = useState<string>(() => String(new Date().getFullYear()));
  const [ratesYearAfter, setRatesYearAfter] = useState<string>(() => String(new Date().getFullYear()));
  const yearTouchedBefore = React.useRef(false);
  const yearTouchedAfter = React.useRef(false);
  const hydratedRef = React.useRef(false);
  const lastFetchedBeforeRef = React.useRef('');
  const lastFetchedAfterRef = React.useRef('');
  const [pendingRatesBefore, setPendingRatesBefore] = useState(false);
  const [pendingRatesAfter, setPendingRatesAfter] = useState(false);

  const { data: osdOperators } = useOsdOperators();
  const { visibleCodes } = useVisibleTariffsForOsd(formData.osd_id);
  const visibleTariffs = React.useMemo(
    () => (visibleCodes ? TARIFF_CODES.filter(t => visibleCodes.has(t.code.toUpperCase())) : TARIFF_CODES),
    [visibleCodes]
  );
  const { resolveRates, isLoading: isResolvingRates } = useRatesResolver();

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

  const access = useGroupFeatureAccess(analysis?.analysis_group_id);
  const { data: aiGroup } = useQuery({
    queryKey: ['ai-group-ppes', analysis?.analysis_group_id], enabled: !!analysis?.analysis_group_id && access.aiAssistant,
    queryFn: async () => {
      const gid = analysis!.analysis_group_id!;
      const [{ data: g }, { data: list }] = await Promise.all([
        supabase.from('analysis_groups').select('name').eq('id', gid).maybeSingle(),
        supabase.from('energy_analyses').select('id,name,ppe_number').eq('analysis_group_id', gid).order('created_at'),
      ]);
      return { name: g?.name ?? null, ppes: list ?? [] };
    },
  });

  useEffect(() => {
    if (analysis) {
      // Kody taryf zapisane inną wielkością liter (np. „C22B” z importu) → kod ze słownika i jego liczba stref.
      const tb = normalizeTariffCode(analysis.tariff_code_before).code;
      const ta = normalizeTariffCode(analysis.tariff_code_after).code;
      setFormData({
        ...analysis,
        ...(tb && tb !== analysis.tariff_code_before ? { tariff_code_before: tb, zones_count_before: getZonesCount(tb) } : {}),
        ...(ta && ta !== analysis.tariff_code_after ? { tariff_code_after: ta, zones_count_after: getZonesCount(ta) } : {}),
        rates_overridden_before: (analysis.rates_overridden_before as Record<string, number>) || {},
        rates_overridden_after: (analysis.rates_overridden_after as Record<string, number>) || {},
      });
      setOverriddenBefore((analysis.rates_overridden_before as Record<string, number>) || {});
      setOverriddenAfter((analysis.rates_overridden_after as Record<string, number>) || {});
      // Mark the stored parameters as "already fetched" so opening a saved
      // analysis never re-triggers the auto-fetch.
      const yb = initialRatesYear(analysis.rates_year_before, analysis.rates_date);
      const ya = initialRatesYear(analysis.rates_year_after, analysis.rates_date);
      if (yb.fromSaved) { yearTouchedBefore.current = true; setRatesYearBefore(yb.year); }
      if (ya.fromSaved) { yearTouchedAfter.current = true; setRatesYearAfter(ya.year); }
      lastFetchedBeforeRef.current = ratesSignature(
        analysis.osd_id,
        analysis.tariff_code_before,
        analysis.season_before,
        yb.year
      );
      lastFetchedAfterRef.current = ratesSignature(
        analysis.osd_id,
        analysis.tariff_code_after,
        analysis.season_after,
        ya.year
      );
      // Restore saved consumption split so defaults never overwrite saved values.
      const restoreSplit = (vals: number[], zones: number) => {
        const v = vals.slice(0, zones).map(x => Number(x) || 0);
        const sum = v.reduce((a, b) => a + b, 0);
        return { sum, dist: sum > 0 ? v.map(x => (x / sum) * 100) : getDefaultDistribution(zones) };
      };
      const zb = (tb ? getZonesCount(tb) : analysis.zones_count_before) || 1;
      const za = (ta ? getZonesCount(ta) : analysis.zones_count_after) || 1;
      const before = restoreSplit([
        analysis.consumption_before_zone1_mwh, analysis.consumption_before_zone2_mwh, analysis.consumption_before_zone3_mwh,
      ], zb);
      const after = restoreSplit([
        analysis.consumption_after_zone1_mwh, analysis.consumption_after_zone2_mwh, analysis.consumption_after_zone3_mwh,
      ], za);
      setZoneDistributionBefore(before.dist);
      if (before.sum > 0) setTotalConsumptionBefore(before.sum);
      setZoneDistribution(after.dist);
      if (after.sum > 0 && Math.abs(after.sum - before.sum) > 1e-6) {
        // Manually entered values that don't match PRZED total — keep them as-is.
        setIsAutoConsumptionMode(false);
      }
      hydratedRef.current = true;
    }
  }, [analysis]);

  // Auto-select the rates year from the analysis period (both PRZED and PO).
  // When the period spans two calendar years (e.g. 2025-12 → 2026-01),
  // the year choice stays manual.
  useEffect(() => {
    const from = formData.period_from;
    const to = formData.period_to;
    if (!from || !to) return;
    const fromYear = String(from).slice(0, 4);
    const toYear = String(to).slice(0, 4);
    if (fromYear !== toYear) return;
    if (!yearTouchedBefore.current) setRatesYearBefore(fromYear);
    if (!yearTouchedAfter.current) setRatesYearAfter(fromYear);
  }, [formData.period_from, formData.period_to]);

  const handleSetRatesYearBefore = (year: string) => {
    yearTouchedBefore.current = true;
    setRatesYearBefore(year);
  };
  const handleSetRatesYearAfter = (year: string) => {
    yearTouchedAfter.current = true;
    setRatesYearAfter(year);
  };

  // Auto-fetch rates for PRZED and PO whenever OSD, tariff, season or the
  // rates year change — no need to press "Pobierz stawki". Skipped in manual
  // mode and right after loading a saved analysis (params already fetched).
  useEffect(() => {
    if (!hydratedRef.current || !formData.osd_id) return;
    const sigBefore = ratesSignature(
      formData.osd_id,
      formData.tariff_code_before,
      formData.season_before,
      ratesYearBefore
    );
    const sigAfter = ratesSignature(
      formData.osd_id,
      formData.tariff_code_after,
      formData.season_after,
      ratesYearAfter
    );
    const sources = (formData.value_sources || {}) as ValueSources;
    if (sigBefore !== lastFetchedBeforeRef.current) {
      if (canAutoApplyRates({ manualMode: isManualModeBefore, overriddenCount: Object.keys(overriddenBefore).length, sources, prefix: 'before' })) {
        lastFetchedBeforeRef.current = sigBefore;
        fetchRates('before', { silent: true });
      } else {
        setPendingRatesBefore(true);
      }
    }
    if (sigAfter !== lastFetchedAfterRef.current) {
      if (canAutoApplyRates({ manualMode: isManualModeAfter, overriddenCount: Object.keys(overriddenAfter).length, sources, prefix: 'after' })) {
        lastFetchedAfterRef.current = sigAfter;
        fetchRates('after', { silent: true });
      } else {
        setPendingRatesAfter(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydratedRef.current,
    formData.osd_id,
    formData.tariff_code_before,
    formData.tariff_code_after,
    formData.season_before,
    formData.season_after,
    ratesYearBefore,
    ratesYearAfter,
    isManualModeBefore,
    isManualModeAfter,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (analysis?.analysis_group_id) {
        const { data, error } = await supabase.rpc('can_edit_feature_group', { _group_id: analysis.analysis_group_id });
        if (error || data !== true) throw new Error(MULTI_PPE_LOCK_MESSAGE);
      }
      const dataToSave = {
        ...formData,
        rates_year_before: Number(ratesYearBefore) || null,
        rates_year_after: Number(ratesYearAfter) || null,
        rates_overridden_before: overriddenBefore,
        rates_overridden_after: overriddenAfter,
      };
      const { error } = await supabase
        .from('energy_analyses')
        .update(dataToSave as never)
        .eq('id', analysisId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
      queryClient.invalidateQueries({ queryKey: ['group-ppe'] });
      toast({ title: 'Zapisano', description: 'Analiza została zapisana.' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Nie udało się zapisać analizy.' });
    },
  });

  const handleTariffChange = (field: 'tariff_code_before' | 'tariff_code_after', value: string) => {
    const zonesField = field === 'tariff_code_before' ? 'zones_count_before' : 'zones_count_after';
    const zones = getZonesCount(value);
    setFormData(prev => ({ ...prev, [field]: value, [zonesField]: zones }));
    
    const powerField = field === 'tariff_code_before' ? 'contracted_power_before_kw' : 'contracted_power_after_kw';
    const power = Number(formData[powerField]) || 0;
    const validation = validateContractedPower(value, power);
    if (!validation.valid) {
      setValidationErrors(prev => ({ ...prev, [powerField]: validation.error! }));
    } else {
      setValidationErrors(prev => {
        const { [powerField]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handlePowerChangeBefore = (value: number) => {
    setFormData(prev => ({ ...prev, contracted_power_before_kw: value }));
    
    const validation = validateContractedPower(formData.tariff_code_before || 'C11', value);
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (!validation.valid) {
        newErrors.contracted_power_before_kw = validation.error!;
      } else {
        delete newErrors.contracted_power_before_kw;
      }
      return newErrors;
    });
  };

  const handlePowerChangeAfter = (value: number) => {
    setFormData(prev => ({ ...prev, contracted_power_after_kw: value }));
    
    const validation = validateContractedPower(formData.tariff_code_after || 'C11', value);
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (!validation.valid) {
        newErrors.contracted_power_after_kw = validation.error!;
      } else {
        delete newErrors.contracted_power_after_kw;
      }
      return newErrors;
    });
  };

  const getPowerHint = (tariffCode: string): string => {
    const isLow = tariffCode.startsWith('C1') || tariffCode.startsWith('B1') || tariffCode.startsWith('G');
    const isHigh = tariffCode.startsWith('C2') || tariffCode.startsWith('B2');
    if (isLow) return 'Dla taryf C1/B1/G moc umowna musi być ≤ 40 kW';
    if (isHigh) return 'Dla taryf C2/B2 moc umowna musi być > 40 kW';
    return '';
  };

  const handleInputChange = useCallback((field: keyof EnergyAnalysis, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const fetchRates = async (scenario: 'before' | 'after', options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!formData.osd_id) {
      if (!silent) {
        toast({ variant: 'destructive', title: 'Błąd', description: 'Wybierz najpierw OSD.' });
      }
      return;
    }

    const tariffCode = scenario === 'before' ? formData.tariff_code_before : formData.tariff_code_after;
    const season = scenario === 'before' ? formData.season_before : formData.season_after;
    const ratesYear = scenario === 'before' ? ratesYearBefore : ratesYearAfter;
    const ratesDate = `${ratesYear}-01-01`;

    // Get OSD name for error message
    const selectedOsd = osdOperators?.find(o => o.id === formData.osd_id);
    const osdName = selectedOsd?.name || 'wybranego OSD';

    const result = await resolveRates(
      formData.osd_id,
      tariffCode || 'C11',
      season || 'ALL',
      ratesDate
    );

    if (result.notFound) {
      if (!silent) {
        toast({
          variant: 'destructive',
          title: 'Taryfa niedostępna',
          description: `Taryfa ${tariffCode?.toUpperCase()} nie jest dostępna dla ${osdName} w roku ${ratesYear}. Wybierz inną taryfę lub wprowadź stawki ręcznie.`
        });
      }
      return;
    }

    if (result.error) {
      if (!silent) {
        toast({
          variant: 'destructive',
          title: 'Błąd',
          description: result.error
        });
      }
      return;
    }

    const rates = result.rates;
    if (rates) {
      const sig = ratesSignature(formData.osd_id, tariffCode, season, ratesYear);
      if (scenario === 'before') {
        lastFetchedBeforeRef.current = sig;
        setResolvedRatesBefore(rates);
        // Apply rates to form
        setFormData(prev => ({
          ...prev,
          contracted_power_charge_rate_before: rates.rates.fixedNetworkRate || 0,
          variable_distribution_before_zone1_rate: rates.rates.variableRates[0]?.rate || 0,
          variable_distribution_before_zone2_rate: rates.rates.variableRates[1]?.rate || 0,
          variable_distribution_before_zone3_rate: rates.rates.variableRates[2]?.rate || 0,
          capacity_charge_before: rates.rates.capacityFee || 0,
          rate_card_id_before: rates.rateCardId,
          rates_year_before: Number(ratesYear),
          rates_source_before: {
            rate_card_id: rates.rateCardId,
            rate_card_name: rates.rateCardName,
            valid_from: rates.validFrom,
            valid_to: rates.validTo,
            year: Number(ratesYear),
            applied_at: new Date().toISOString(),
          } satisfies RatesSourceSnapshot,
          value_sources: markSources((prev.value_sources || {}) as ValueSources, rateBaseFields('before'), { source: 'rate_base', rate_card_id: rates.rateCardId }),
        }));
        setOverriddenBefore({});
        setPendingRatesBefore(false);
      } else {
        lastFetchedAfterRef.current = sig;
        setResolvedRatesAfter(rates);
        setFormData(prev => ({
          ...prev,
          contracted_power_charge_rate_after: rates.rates.fixedNetworkRate || 0,
          variable_distribution_after_zone1_rate: rates.rates.variableRates[0]?.rate || 0,
          variable_distribution_after_zone2_rate: rates.rates.variableRates[1]?.rate || 0,
          variable_distribution_after_zone3_rate: rates.rates.variableRates[2]?.rate || 0,
          capacity_charge_after: rates.rates.capacityFee || 0,
          rate_card_id_after: rates.rateCardId,
          rates_year_after: Number(ratesYear),
          rates_source_after: {
            rate_card_id: rates.rateCardId,
            rate_card_name: rates.rateCardName,
            valid_from: rates.validFrom,
            valid_to: rates.validTo,
            year: Number(ratesYear),
            applied_at: new Date().toISOString(),
          } satisfies RatesSourceSnapshot,
          value_sources: markSources((prev.value_sources || {}) as ValueSources, rateBaseFields('after'), { source: 'rate_base', rate_card_id: rates.rateCardId }),
        }));
        setOverriddenAfter({});
        setPendingRatesAfter(false);
      }
      if (!silent) {
        toast({ title: 'Pobrano stawki', description: `Stawki dla ${rates.rateCardName} zostały załadowane.` });
      }
    }
  };

  const handleFetchRates = (scenario: 'before' | 'after') => {
    const overridden = scenario === 'before' ? overriddenBefore : overriddenAfter;
    const sources = (formData.value_sources || {}) as ValueSources;
    const protectedCount = Object.keys(overridden).length + rateBaseFields(scenario).filter(f => {
      const src = sources[f]?.source;
      return (src === 'manual' || src === 'document') && !(f in overridden);
    }).length;
    if (protectedCount > 0 && !window.confirm(
      'Zastosowanie stawek z bazy zastąpi ręczne korekty (lub wartości z dokumentów) w tym wariancie. Kontynuować?'
    )) return;
    fetchRates(scenario);
  };

  const handleRatesPanelInput = (field: keyof EnergyAnalysis, value: number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
      value_sources: typeof value === 'number'
        ? markSources((prev.value_sources || {}) as ValueSources, [String(field)], { source: 'manual' })
        : prev.value_sources,
    }));
  };

  const handleResetRates = (scenario: 'before' | 'after') => {
    if (scenario === 'before') {
      setOverriddenBefore({});
      if (resolvedRatesBefore) {
        setFormData(prev => ({
          ...prev,
          contracted_power_charge_rate_before: resolvedRatesBefore.rates.fixedNetworkRate || 0,
          variable_distribution_before_zone1_rate: resolvedRatesBefore.rates.variableRates[0]?.rate || 0,
          variable_distribution_before_zone2_rate: resolvedRatesBefore.rates.variableRates[1]?.rate || 0,
          variable_distribution_before_zone3_rate: resolvedRatesBefore.rates.variableRates[2]?.rate || 0,
        }));
      }
    } else {
      setOverriddenAfter({});
      if (resolvedRatesAfter) {
        setFormData(prev => ({
          ...prev,
          contracted_power_charge_rate_after: resolvedRatesAfter.rates.fixedNetworkRate || 0,
          variable_distribution_after_zone1_rate: resolvedRatesAfter.rates.variableRates[0]?.rate || 0,
          variable_distribution_after_zone2_rate: resolvedRatesAfter.rates.variableRates[1]?.rate || 0,
          variable_distribution_after_zone3_rate: resolvedRatesAfter.rates.variableRates[2]?.rate || 0,
        }));
      }
    }
  };

  const addingNextRef = React.useRef(false);
  const [isAddingNext, setIsAddingNext] = useState(false);
  const handleSaveAndAddNext = async () => {
    if (addingNextRef.current || !access.multiPpe || access.readOnly) return;
    try { await requireFeature('multi_ppe', formData.analysis_group_id); }
    catch { toast({ variant: 'destructive', title: 'Brak dostępu do funkcji Analizy wielu PPE' }); return; }
    const errors = Object.values(validationErrors);
    if (errors.length > 0) {
      toast({ variant: 'destructive', title: 'Błąd walidacji', description: errors[0] || 'Popraw błędy w formularzu.' });
      return;
    }
    addingNextRef.current = true;
    setIsAddingNext(true);
    try {
      try {
        await saveMutation.mutateAsync();
      } catch {
        return; // save failed — stay on the current analysis
      }
      const groupId = formData.analysis_group_id;
      if (!groupId) {
        toast({ variant: 'destructive', title: 'Błąd', description: 'Nie można ustalić analizy, do której należy ten punkt.' });
        return;
      }
      const { data: existing } = await supabase
        .from('energy_analyses')
        .select('id')
        .eq('client_project_id', projectId!)
        .eq('analysis_group_id', groupId);
      const count = existing?.length ?? 0;
      const { data, error } = await supabase
        .from('energy_analyses')
        .insert({ client_project_id: projectId!, analysis_group_id: groupId, name: `PPE ${(count || 0) + 1}` })
        .select('id')
        .single();
      if (error || !data) {
        toast({ variant: 'destructive', title: 'Błąd', description: 'Analiza zapisana, ale nie udało się dodać kolejnego PPE.' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
      queryClient.invalidateQueries({ queryKey: ['group-ppe', groupId] });
      navigate(`/projects/${projectId}/analysis/${data.id}`);
    } finally {
      addingNextRef.current = false;
      setIsAddingNext(false);
    }
  };

  const handleSave = () => {
    const errors = Object.values(validationErrors);
    if (errors.length > 0) {
      toast({ 
        variant: 'destructive', 
        title: 'Błąd walidacji', 
        description: errors[0] || 'Popraw błędy w formularzu.' 
      });
      return;
    }
    saveMutation.mutate();
  };

  const currentStepIndex = WIZARD_STEPS.findIndex(s => s.id === currentStep);
  const canGoNext = currentStepIndex < WIZARD_STEPS.length - 1;
  const canGoPrev = currentStepIndex > 0;

  const goToStep = (stepId: StepId) => setCurrentStep(stepId);
  const goNext = () => canGoNext && setCurrentStep(WIZARD_STEPS[currentStepIndex + 1].id);
  const goPrev = () => canGoPrev && setCurrentStep(WIZARD_STEPS[currentStepIndex - 1].id);

  const results = calculateEnergyCosts(access.readOnly ? analysis || {} : formData);
  const groupPath = formData.analysis_group_id
    ? `/projects/${projectId}/analyses/${formData.analysis_group_id}`
    : `/projects/${projectId}`;
  const zonesCountBefore = formData.zones_count_before || 1;
  const zonesCountAfter = formData.zones_count_after || 1;
  const zoneLabelsBefore = getZoneLabels(zonesCountBefore);
  const zoneLabelsAfter = getZoneLabels(zonesCountAfter);
  const periodMonths = calculatePeriodMonths(formData.period_from || null, formData.period_to || null);

  if (isLoading || access.loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (access.readOnly) return <AppLayout><div className="content-container py-8"><Button variant="outline" asChild><Link to={groupPath}>Wróć do listy PPE</Link></Button><p role="status" className="my-6 text-muted-foreground">{MULTI_PPE_LOCK_MESSAGE}</p><h1 className="text-2xl font-semibold mb-4">{analysis?.name}</h1><dl className="grid grid-cols-2 gap-4"><dt>PPE</dt><dd>{analysis?.ppe_number || '—'}</dd><dt>PRZED</dt><dd>{formatCurrency(results.totalCostBefore)}</dd><dt>PO</dt><dd>{formatCurrency(results.totalCostAfter)}</dd><dt>Oszczędność</dt><dd>{formatCurrency(results.savingsValue)}</dd></dl><Button variant="outline" className="mt-6" asChild><Link to={`/projects/${projectId}/analysis/${analysisId}/report`}>Raport PPE</Link></Button></div></AppLayout>;

  return (
    <AppLayout>
      <div className="content-container max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild aria-label="Wróć do listy PPE">
              <Link to={groupPath}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">
                {formData.name || 'Analiza'}
              </h1>
              <p className="text-muted-foreground text-sm">
                <Link to={`/projects/${projectId}`} className="hover:underline">{project?.client_name}</Link>
                {' › '}
                <Link to={groupPath} className="hover:underline">Lista PPE</Link>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {access.aiAssistant && <Button variant="outline" onClick={() => openAssistant()}><Bot className="h-4 w-4 mr-2" />Asystent AI</Button>}
            <Button variant="outline" asChild>
              <Link to={`/projects/${projectId}/analysis/${analysisId}/report`}>
                <Printer className="h-4 w-4 mr-2" />
                Raport
              </Link>
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Zapisz
            </Button>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
          {WIZARD_STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                onClick={() => goToStep(step.id)}
                className={cn(
                  'flex flex-col items-center min-w-[80px] transition-colors',
                  currentStep === step.id
                    ? 'text-primary'
                    : index < currentStepIndex
                    ? 'text-muted-foreground hover:text-foreground'
                    : 'text-muted-foreground/50'
                )}
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-1 transition-colors',
                    currentStep === step.id
                      ? 'bg-primary text-primary-foreground'
                      : index < currentStepIndex
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {index < currentStepIndex ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span className="text-xs font-medium">{step.label}</span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2',
                    index < currentStepIndex ? 'bg-primary/40' : 'bg-muted'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[400px]">
          {/* Step 1: Client */}
          {currentStep === 'client' && (
            <Card>
              <CardHeader>
                <CardTitle>Dane klienta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nazwa obiektu (PPE)</Label>
                    <Input
                      value={formData.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ppe_number">Numer PPE (opcjonalnie)</Label>
                    <Input
                      id="ppe_number"
                      value={formData.ppe_number || ''}
                      placeholder="np. 590243..."
                      onChange={(e) => handleInputChange('ppe_number' as any, e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ppe_address">Adres PPE (opcjonalnie)</Label>
                    <Input
                      id="ppe_address"
                      value={formData.ppe_address || ''}
                      onChange={(e) => handleInputChange('ppe_address' as any, e.target.value)}
                    />
                  </div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Klient</p>
                  <p className="font-medium">{project?.client_name}</p>
                  <p className="text-sm text-muted-foreground">NIP: {project?.client_nip}</p>
                  {project?.client_address && (
                    <p className="text-sm text-muted-foreground">{project.client_address}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: OSD and Period */}
          {currentStep === 'osd' && (
            <Card>
              <CardHeader>
                <CardTitle>Operator Sieci Dystrybucyjnej i okres</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>OSD (Operator)</Label>
                    <Select
                      value={formData.osd_id || ''}
                      onValueChange={(v) => handleInputChange('osd_id', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz OSD" />
                      </SelectTrigger>
                      <SelectContent>
                        {osdOperators?.map((osd) => (
                          <SelectItem key={osd.id} value={osd.id}>
                            {osd.name} ({osd.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Okres od</Label>
                    <Input
                      type="date"
                      value={formData.period_from || ''}
                      onChange={(e) => handleInputChange('period_from', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Okres do</Label>
                    <Input
                      type="date"
                      value={formData.period_to || ''}
                      onChange={(e) => handleInputChange('period_to', e.target.value)}
                    />
                  </div>
                </div>
                <InvoiceGapsNotice groupId={analysis?.analysis_group_id} row={analysis as unknown as Record<string, unknown>} canImport={access.canImport} />
                {formData.period_from && formData.period_to && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm">
                      Okres analizy: <span className="font-medium">{periodMonths} {periodMonths === 1 ? 'miesiąc' : periodMonths < 5 ? 'miesiące' : 'miesięcy'}</span>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Power - Taryfy i moce */}
          {currentStep === 'power' && access.aiAssistant && <div className="flex justify-end mb-3"><AssistantContextButton label="Omów wariant" prompt="Omów wariant taryfy i mocy umownej PRZED i PO dla tego PPE. Rozróżnij dane potwierdzone od symulacji." /></div>}
          {currentStep === 'power' && (
            <Card>
              <CardHeader>
                <CardTitle>Taryfy i moce umowne</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* PRZED */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                  <h3 className="font-semibold text-lg">Stan PRZED</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Taryfa obecna</Label>
                      <Select
                        value={formData.tariff_code_before}
                        onValueChange={(v) => handleTariffChange('tariff_code_before', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleTariffs.map((t) => (
                            <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Moc umowna PRZED [kW]</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formData.contracted_power_before_kw || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(',', '.');
                          handlePowerChangeBefore(parseFloat(value) || 0);
                        }}
                      />
                      {validationErrors.contracted_power_before_kw ? (
                        <p className="text-sm text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {validationErrors.contracted_power_before_kw}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {getPowerHint(formData.tariff_code_before || 'C11')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* PO */}
                <div className="p-4 bg-primary/5 rounded-lg space-y-4">
                  <h3 className="font-semibold text-lg">Stan PO</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Taryfa rekomendowana</Label>
                      <Select
                        value={formData.tariff_code_after}
                        onValueChange={(v) => handleTariffChange('tariff_code_after', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleTariffs.map((t) => (
                            <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Moc umowna PO [kW]</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formData.contracted_power_after_kw || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(',', '.');
                          handlePowerChangeAfter(parseFloat(value) || 0);
                        }}
                      />
                      {validationErrors.contracted_power_after_kw ? (
                        <p className="text-sm text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {validationErrors.contracted_power_after_kw}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {getPowerHint(formData.tariff_code_after || 'C11')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Before (Current State) */}
          {currentStep === 'before' && access.aiAssistant && <div className="flex justify-end mb-3"><AssistantContextButton label="Sprawdź dane" prompt="Sprawdź kompletność i źródła danych PRZED dla tego PPE. Wskaż braki i wartości wpisane ręcznie." /></div>}
          {currentStep === 'before' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Stan obecny – Zużycie i stawki</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Podsumowanie wybranej taryfy i mocy */}
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Wybrana taryfa</p>
                        <p className="font-semibold">{formData.tariff_code_before}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Select
                          value={formData.tariff_code_before}
                          onValueChange={(v) => handleTariffChange('tariff_code_before', v)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {visibleTariffs.map((t) => (
                              <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={formData.season_before || 'ALL'}
                          onValueChange={(v) => handleInputChange('season_before', v)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">Cały rok</SelectItem>
                            <SelectItem value="SUMMER">Lato</SelectItem>
                            <SelectItem value="WINTER">Zima</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-muted">
                      <div>
                        <p className="text-sm text-muted-foreground">Moc umowna</p>
                        <p className="font-semibold">{formData.contracted_power_before_kw || 0} kW</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={formData.contracted_power_before_kw || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace(',', '.');
                            handlePowerChangeBefore(parseFloat(value) || 0);
                          }}
                          className="w-[120px]"
                          placeholder="kW"
                        />
                        {validationErrors.contracted_power_before_kw ? (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {validationErrors.contracted_power_before_kw}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {getPowerHint(formData.tariff_code_before || 'C11')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ConsumptionMappingBefore
                zonesCount={zonesCountBefore}
                formData={formData}
                onInputChange={handleInputChange}
                isAutoMode={isAutoConsumptionModeBefore}
                setIsAutoMode={setIsAutoConsumptionModeBefore}
                zoneDistribution={zoneDistributionBefore}
                setZoneDistribution={setZoneDistributionBefore}
                totalConsumption={totalConsumptionBefore}
                setTotalConsumption={setTotalConsumptionBefore}
              />

              <RatesInputPanel
                prefix="before"
                formData={formData}
                onInputChange={handleRatesPanelInput}
                ratesSource={(formData.rates_source_before as RatesSourceSnapshot | null) ?? null}
                pendingReapply={pendingRatesBefore}
                zonesCount={zonesCountBefore}
                resolvedRates={resolvedRatesBefore}
                onFetchRates={() => handleFetchRates('before')}
                onResetRates={() => handleResetRates('before')}
                isFetching={isResolvingRates}
                isManualMode={isManualModeBefore}
                setIsManualMode={setIsManualModeBefore}
                overriddenFields={overriddenBefore}
                setOverriddenFields={setOverriddenBefore}
                ratesYear={ratesYearBefore}
                setRatesYear={handleSetRatesYearBefore}
              />
            </div>
          )}

          {/* Step 5: After (Proposed State) */}
          {currentStep === 'after' && access.aiAssistant && <div className="flex justify-end mb-3"><AssistantContextButton label="Sprawdź założenia PO" prompt="Sprawdź założenia PO: niespójności z PRZED, puste koszty PO występujące w PRZED i brakujące dane." /></div>}
          {currentStep === 'after' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Stan po zmianie – Zużycie i stawki</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Podsumowanie wybranej taryfy i mocy */}
                  <div className="p-3 bg-primary/5 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Wybrana taryfa</p>
                        <p className="font-semibold">{formData.tariff_code_after}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Select
                          value={formData.tariff_code_after}
                          onValueChange={(v) => handleTariffChange('tariff_code_after', v)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {visibleTariffs.map((t) => (
                              <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={formData.season_after || 'ALL'}
                          onValueChange={(v) => handleInputChange('season_after', v)}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">Cały rok</SelectItem>
                            <SelectItem value="SUMMER">Lato</SelectItem>
                            <SelectItem value="WINTER">Zima</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                      <div>
                        <p className="text-sm text-muted-foreground">Moc umowna</p>
                        <p className="font-semibold">{formData.contracted_power_after_kw || 0} kW</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={formData.contracted_power_after_kw || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace(',', '.');
                            handlePowerChangeAfter(parseFloat(value) || 0);
                          }}
                          className="w-[120px]"
                          placeholder="kW"
                        />
                        {validationErrors.contracted_power_after_kw ? (
                          <p className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {validationErrors.contracted_power_after_kw}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {getPowerHint(formData.tariff_code_after || 'C11')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ConsumptionMapping
                zonesBefore={zonesCountBefore}
                zonesAfter={zonesCountAfter}
                sameTariff={
                  !!formData.tariff_code_before &&
                  (formData.tariff_code_before || '').toUpperCase() ===
                    (formData.tariff_code_after || '').toUpperCase()
                }
                formData={formData}
                onInputChange={handleInputChange}
                isAutoMode={isAutoConsumptionMode}
                setIsAutoMode={setIsAutoConsumptionMode}
                zoneDistribution={zoneDistribution}
                setZoneDistribution={setZoneDistribution}
              />


              <RatesInputPanel
                prefix="after"
                formData={formData}
                onInputChange={handleRatesPanelInput}
                ratesSource={(formData.rates_source_after as RatesSourceSnapshot | null) ?? null}
                pendingReapply={pendingRatesAfter}
                zonesCount={zonesCountAfter}
                resolvedRates={resolvedRatesAfter}
                onFetchRates={() => handleFetchRates('after')}
                onResetRates={() => handleResetRates('after')}
                isFetching={isResolvingRates}
                isManualMode={isManualModeAfter}
                setIsManualMode={setIsManualModeAfter}
                overriddenFields={overriddenAfter}
                setOverriddenFields={setOverriddenAfter}
                ratesYear={ratesYearAfter}
                setRatesYear={handleSetRatesYearAfter}
              />
            </div>
          )}

          {/* Step 6: Summary */}
          {currentStep === 'summary' && access.aiAssistant && <div className="flex justify-end mb-3"><AssistantContextButton label="Wyjaśnij wynik" prompt="Wyjaśnij wynik kalkulatora: z czego wynikają sumy PRZED i PO oraz oszczędność, i jakie braki ograniczają ocenę." /></div>}
          {currentStep === 'summary' && <div className="mb-3"><IncompletePoNotice row={formData as Record<string, unknown>} /></div>}
          {currentStep === 'summary' && (
            <ComparisonSummary
              costBefore={results.totalCostBefore}
              costAfter={results.totalCostAfter}
              periodMonths={periodMonths}
              consultantNotes={formData.consultant_notes || ''}
              onNotesChange={(notes) => handleInputChange('consultant_notes', notes)}
              hiddenComponents={formData.report_hidden_components || []}
              onHiddenComponentsChange={(keys) => handleInputChange('report_hidden_components', keys as never)}
              excludedComponents={formData.report_excluded_components || []}
              onExcludedComponentsChange={(keys) => handleInputChange('report_excluded_components', keys as never)}

              breakdown={{
                distributionBefore: results.distributionCostBefore,
                distributionAfter: results.distributionCostAfter,
                activeEnergyBefore: results.activeEnergyCostBefore,
                activeEnergyAfter: results.activeEnergyCostAfter,
                contractedPowerBefore: results.contractedPowerChargeBefore,
                contractedPowerAfter: results.contractedPowerChargeAfter,
                reactiveBefore: results.reactiveEnergyCostBefore,
                reactiveAfter: results.reactiveEnergyCostAfter,
                handlingBefore: results.handlingFeeBefore,
                handlingAfter: results.handlingFeeAfter,
                capacityBefore: results.capacityChargeBefore,
                capacityAfter: results.capacityChargeAfter,
                fixedDistributionBefore: Number(formData.fixed_distribution_before_total) || 0,
                fixedDistributionAfter: Number(formData.fixed_distribution_after_total) || 0,
              }}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={!canGoPrev}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Wstecz
          </Button>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to={groupPath}>Wróć do listy PPE</Link>
            </Button>
            {access.multiPpe && <Button variant="secondary" onClick={handleSaveAndAddNext} disabled={isAddingNext || saveMutation.isPending}>
              {isAddingNext ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Zapisz i dodaj kolejne PPE
            </Button>}
            {currentStep === 'summary' ? (
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Zapisz analizę
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canGoNext}>
                Dalej
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
      {access.aiAssistant && analysis?.analysis_group_id && <AssistantPanel groupId={analysis.analysis_group_id} clientName={project?.client_name} groupName={aiGroup?.name}
        ppes={aiGroup?.ppes ?? [{ id: analysisId!, name: formData.name || 'PPE', ppe_number: formData.ppe_number }]} currentPpeId={analysisId} allowAll={access.multiPpe} invoiceImport={access.canImport}
        step={WIZARD_STEPS.find(s => s.id === currentStep)?.label} draft={formData as Record<string, unknown>} saved={analysis as unknown as Record<string, unknown>}
        results={results as unknown as Record<string, unknown>} issues={assistantIssues(formData as Record<string, unknown>)}
        onSaveForm={async () => { if (Object.keys(validationErrors).length) { handleSave(); return false; } try { await saveMutation.mutateAsync(); return true; } catch { return false; } }} />}
    </AppLayout>
  );
}