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
} from 'lucide-react';
import type { EnergyAnalysis, ClientProject, ResolvedRates } from '@/types/database';
import { TARIFF_CODES, getZonesCount, getZoneLabels, validateContractedPower, calculatePeriodMonths, getDefaultDistribution } from '@/lib/tariff-utils';
import { calculateEnergyCosts, formatCurrency, formatPercent, formatNumber } from '@/lib/calculation-utils';
import { ReactiveEnergyInput } from '@/components/analysis/ReactiveEnergyInput';
import { RatesInputPanel } from '@/components/analysis/RatesInputPanel';
import { ConsumptionMapping } from '@/components/analysis/ConsumptionMapping';
import { ConsumptionMappingBefore } from '@/components/analysis/ConsumptionMappingBefore';
import { ComparisonSummary } from '@/components/analysis/ComparisonSummary';
import { useOsdOperators } from '@/hooks/useOsdOperators';
import { useRatesResolver } from '@/hooks/useRatesResolver';
import { cn } from '@/lib/utils';

const WIZARD_STEPS = [
  { id: 'client', label: 'Klient', description: 'Dane klienta' },
  { id: 'osd', label: 'OSD', description: 'Operator i okres' },
  { id: 'power', label: 'Moc', description: 'Parametry techniczne' },
  { id: 'before', label: 'PRZED', description: 'Stan obecny' },
  { id: 'after', label: 'PO', description: 'Stan po zmianie' },
  { id: 'summary', label: 'Podsumowanie', description: 'Porównanie' },
] as const;

type StepId = typeof WIZARD_STEPS[number]['id'];

export default function AnalysisForm() {
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

  const { data: osdOperators } = useOsdOperators();
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

  useEffect(() => {
    if (analysis) {
      setFormData({
        ...analysis,
        rates_overridden_before: (analysis.rates_overridden_before as Record<string, number>) || {},
        rates_overridden_after: (analysis.rates_overridden_after as Record<string, number>) || {},
      });
      setOverriddenBefore((analysis.rates_overridden_before as Record<string, number>) || {});
      setOverriddenAfter((analysis.rates_overridden_after as Record<string, number>) || {});
    }
  }, [analysis]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const dataToSave = {
        ...formData,
        rates_overridden_before: overriddenBefore,
        rates_overridden_after: overriddenAfter,
      };
      const { error } = await supabase
        .from('energy_analyses')
        .update(dataToSave)
        .eq('id', analysisId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      queryClient.invalidateQueries({ queryKey: ['analyses', projectId] });
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
    const isLow = tariffCode.startsWith('C1') || tariffCode.startsWith('B1');
    const isHigh = tariffCode.startsWith('C2') || tariffCode.startsWith('B2');
    if (isLow) return 'Dla taryf C1/B1 moc umowna musi być ≤ 40 kW';
    if (isHigh) return 'Dla taryf C2/B2 moc umowna musi być > 40 kW';
    return '';
  };

  const handleInputChange = useCallback((field: keyof EnergyAnalysis, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleFetchRates = async (scenario: 'before' | 'after') => {
    if (!formData.osd_id) {
      toast({ variant: 'destructive', title: 'Błąd', description: 'Wybierz najpierw OSD.' });
      return;
    }

    const tariffCode = scenario === 'before' ? formData.tariff_code_before : formData.tariff_code_after;
    const season = scenario === 'before' ? formData.season_before : formData.season_after;

    const rates = await resolveRates(
      formData.osd_id,
      tariffCode || 'C11',
      season || 'ALL',
      formData.rates_date || undefined
    );

    if (rates) {
      if (scenario === 'before') {
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
        }));
        setOverriddenBefore({});
      } else {
        setResolvedRatesAfter(rates);
        setFormData(prev => ({
          ...prev,
          contracted_power_charge_rate_after: rates.rates.fixedNetworkRate || 0,
          variable_distribution_after_zone1_rate: rates.rates.variableRates[0]?.rate || 0,
          variable_distribution_after_zone2_rate: rates.rates.variableRates[1]?.rate || 0,
          variable_distribution_after_zone3_rate: rates.rates.variableRates[2]?.rate || 0,
          capacity_charge_after: rates.rates.capacityFee || 0,
          rate_card_id_after: rates.rateCardId,
        }));
        setOverriddenAfter({});
      }
      toast({ title: 'Pobrano stawki', description: `Stawki dla ${rates.rateCardName} zostały załadowane.` });
    }
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

  const results = calculateEnergyCosts(formData);
  const zonesCountBefore = formData.zones_count_before || 1;
  const zonesCountAfter = formData.zones_count_after || 1;
  const zoneLabelsBefore = getZoneLabels(zonesCountBefore);
  const zoneLabelsAfter = getZoneLabels(zonesCountAfter);
  const periodMonths = calculatePeriodMonths(formData.period_from || null, formData.period_to || null);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="content-container max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/projects/${projectId}`}>
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground">
                {formData.name || 'Analiza'}
              </h1>
              <p className="text-muted-foreground text-sm">{project?.client_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
                    <Label>Nazwa analizy</Label>
                    <Input
                      value={formData.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
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
                  <div className="space-y-2">
                    <Label>Rok obowiązywania stawek</Label>
                    <Select
                      value={formData.rates_date?.substring(0, 4) || '2025'}
                      onValueChange={(year) => handleInputChange('rates_date', `${year}-01-01`)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz rok" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
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
                          {TARIFF_CODES.map((t) => (
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
                          {TARIFF_CODES.map((t) => (
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
                            {TARIFF_CODES.map((t) => (
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
                onInputChange={handleInputChange}
                zonesCount={zonesCountBefore}
                resolvedRates={resolvedRatesBefore}
                onFetchRates={() => handleFetchRates('before')}
                onResetRates={() => handleResetRates('before')}
                isFetching={isResolvingRates}
                isManualMode={isManualModeBefore}
                setIsManualMode={setIsManualModeBefore}
                overriddenFields={overriddenBefore}
                setOverriddenFields={setOverriddenBefore}
              />
            </div>
          )}

          {/* Step 5: After (Proposed State) */}
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
                            {TARIFF_CODES.map((t) => (
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
                onInputChange={handleInputChange}
                zonesCount={zonesCountAfter}
                resolvedRates={resolvedRatesAfter}
                onFetchRates={() => handleFetchRates('after')}
                onResetRates={() => handleResetRates('after')}
                isFetching={isResolvingRates}
                isManualMode={isManualModeAfter}
                setIsManualMode={setIsManualModeAfter}
                overriddenFields={overriddenAfter}
                setOverriddenFields={setOverriddenAfter}
              />
            </div>
          )}

          {/* Step 6: Summary */}
          {currentStep === 'summary' && (
            <ComparisonSummary
              costBefore={results.totalCostBefore}
              costAfter={results.totalCostAfter}
              periodMonths={periodMonths}
              consultantNotes={formData.consultant_notes || ''}
              onNotesChange={(notes) => handleInputChange('consultant_notes', notes)}
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
    </AppLayout>
  );
}