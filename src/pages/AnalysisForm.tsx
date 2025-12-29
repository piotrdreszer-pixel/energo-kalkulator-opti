import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Save,
  Loader2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Printer,
} from 'lucide-react';
import type { EnergyAnalysis, ClientProject } from '@/types/database';
import { TARIFF_CODES, getZonesCount, getZoneLabels, validateContractedPower, calculatePeriodMonths } from '@/lib/tariff-utils';
import { calculateEnergyCosts, formatCurrency, formatPercent, formatNumber } from '@/lib/calculation-utils';
import { ReactiveEnergyInput } from '@/components/analysis/ReactiveEnergyInput';

export default function AnalysisForm() {
  const { projectId, analysisId } = useParams<{ projectId: string; analysisId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Partial<EnergyAnalysis>>({
    name: 'Nowa analiza',
    tariff_code_before: 'C11',
    tariff_code_after: 'C11',
    zones_count_before: 1,
    zones_count_after: 1,
    contracted_power_before_kw: 0,
    contracted_power_after_kw: 0,
    fixed_distribution_before_total: 0,
    variable_distribution_before_zone1_rate: 0,
    variable_distribution_before_zone2_rate: 0,
    variable_distribution_before_zone3_rate: 0,
    reactive_energy_cost_before: 0,
    capacity_charge_before: 0,
    contracted_power_charge_rate_before: 0,
    reactive_monthly_mode_before: false,
    reactive_energy_before_month_1: 0,
    reactive_energy_before_month_2: 0,
    reactive_energy_before_month_3: 0,
    reactive_energy_before_month_4: 0,
    reactive_energy_before_month_5: 0,
    reactive_energy_before_month_6: 0,
    reactive_energy_before_month_7: 0,
    reactive_energy_before_month_8: 0,
    reactive_energy_before_month_9: 0,
    reactive_energy_before_month_10: 0,
    reactive_energy_before_month_11: 0,
    reactive_energy_before_month_12: 0,
    fixed_distribution_after_total: 0,
    variable_distribution_after_zone1_rate: 0,
    variable_distribution_after_zone2_rate: 0,
    variable_distribution_after_zone3_rate: 0,
    reactive_energy_cost_after: 0,
    capacity_charge_after: 0,
    contracted_power_charge_rate_after: 0,
    reactive_monthly_mode_after: false,
    reactive_energy_after_month_1: 0,
    reactive_energy_after_month_2: 0,
    reactive_energy_after_month_3: 0,
    reactive_energy_after_month_4: 0,
    reactive_energy_after_month_5: 0,
    reactive_energy_after_month_6: 0,
    reactive_energy_after_month_7: 0,
    reactive_energy_after_month_8: 0,
    reactive_energy_after_month_9: 0,
    reactive_energy_after_month_10: 0,
    reactive_energy_after_month_11: 0,
    reactive_energy_after_month_12: 0,
    active_energy_price_before_zone1: 0,
    active_energy_price_before_zone2: 0,
    active_energy_price_before_zone3: 0,
    consumption_zone1_mwh: 0,
    consumption_zone2_mwh: 0,
    consumption_zone3_mwh: 0,
    active_energy_price_after_zone1: 0,
    active_energy_price_after_zone2: 0,
    active_energy_price_after_zone3: 0,
    handling_fee_before: 0,
    handling_fee_after: 0,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

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
      setFormData(analysis);
    }
  }, [analysis]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('energy_analyses')
        .update(formData)
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
    
    // Validate power
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

  const handlePowerChange = (field: 'contracted_power_before_kw' | 'contracted_power_after_kw', value: number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    const tariffField = field === 'contracted_power_before_kw' ? 'tariff_code_before' : 'tariff_code_after';
    const tariff = formData[tariffField] as string;
    const validation = validateContractedPower(tariff, value);
    
    if (!validation.valid) {
      setValidationErrors(prev => ({ ...prev, [field]: validation.error! }));
    } else {
      setValidationErrors(prev => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleInputChange = (field: keyof EnergyAnalysis, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (Object.keys(validationErrors).length > 0) {
      toast({ variant: 'destructive', title: 'Błąd walidacji', description: 'Popraw błędy w formularzu.' });
      return;
    }
    saveMutation.mutate();
  };

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
      <div className="content-container max-w-5xl">
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

        <div className="space-y-6">
          {/* General Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Dane ogólne</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 lg:col-span-2">
                <Label>Nazwa analizy</Label>
                <Input
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Data od</Label>
                <Input
                  type="date"
                  value={formData.period_from || ''}
                  onChange={(e) => handleInputChange('period_from', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Data do</Label>
                <Input
                  type="date"
                  value={formData.period_to || ''}
                  onChange={(e) => handleInputChange('period_to', e.target.value)}
                />
              </div>
              {formData.period_from && formData.period_to && (
                <div className="lg:col-span-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Okres analizy: <span className="font-medium text-foreground">{periodMonths} {periodMonths === 1 ? 'miesiąc' : periodMonths < 5 ? 'miesiące' : 'miesięcy'}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tariff and Zones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Taryfa</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-4">
                <h4 className="font-medium text-muted-foreground">PRZED zmianami</h4>
                <div className="space-y-2">
                  <Label>Taryfa dystrybucyjna</Label>
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
              </div>
              <div className="space-y-4">
                <h4 className="font-medium text-muted-foreground">PO zmianach</h4>
                <div className="space-y-2">
                  <Label>Taryfa dystrybucyjna</Label>
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
              </div>
            </CardContent>
          </Card>

          {/* Contracted Power */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Moc umowna</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Moc umowna PRZED [kW]</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.contracted_power_before_kw || ''}
                  onChange={(e) => handlePowerChange('contracted_power_before_kw', parseFloat(e.target.value) || 0)}
                />
                {validationErrors.contracted_power_before_kw && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.contracted_power_before_kw}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Stawka miesięczna PRZED [zł/kW/mies.]</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.contracted_power_charge_rate_before || ''}
                  onChange={(e) => handleInputChange('contracted_power_charge_rate_before', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Moc umowna PO [kW]</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.contracted_power_after_kw || ''}
                  onChange={(e) => handlePowerChange('contracted_power_after_kw', parseFloat(e.target.value) || 0)}
                />
                {validationErrors.contracted_power_after_kw && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {validationErrors.contracted_power_after_kw}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Stawka miesięczna PO [zł/kW/mies.]</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.contracted_power_charge_rate_after || ''}
                  onChange={(e) => handleInputChange('contracted_power_charge_rate_after', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="lg:col-span-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Opłata za moc umowną za okres ({periodMonths} mies.): {' '}
                  <span className="font-medium text-foreground">
                    PRZED: {formatCurrency(results.contractedPowerChargeBefore)} → PO: {formatCurrency(results.contractedPowerChargeAfter)}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Distribution Before */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Dystrybucja – przed zmianami</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Suma stałych opłat za okres [zł]</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.fixed_distribution_before_total || ''}
                    onChange={(e) => handleInputChange('fixed_distribution_before_total', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stawka zmienna {zoneLabelsBefore[0]} [zł/kWh]</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.variable_distribution_before_zone1_rate || ''}
                    onChange={(e) => handleInputChange('variable_distribution_before_zone1_rate', parseFloat(e.target.value) || 0)}
                  />
                </div>
                {zonesCountBefore >= 2 && (
                  <div className="space-y-2">
                    <Label>Stawka zmienna {zoneLabelsBefore[1]} [zł/kWh]</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.variable_distribution_before_zone2_rate || ''}
                      onChange={(e) => handleInputChange('variable_distribution_before_zone2_rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}
                {zonesCountBefore >= 3 && (
                  <div className="space-y-2">
                    <Label>Stawka zmienna {zoneLabelsBefore[2]} [zł/kWh]</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.variable_distribution_before_zone3_rate || ''}
                      onChange={(e) => handleInputChange('variable_distribution_before_zone3_rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Opłata mocowa za okres [zł]</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.capacity_charge_before || ''}
                    onChange={(e) => handleInputChange('capacity_charge_before', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              
              {/* Reactive Energy Before */}
              <div className="pt-4 border-t">
                <ReactiveEnergyInput
                  prefix="before"
                  formData={formData}
                  onInputChange={handleInputChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Distribution After */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Dystrybucja – po zmianach</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Suma stałych opłat za okres [zł]</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.fixed_distribution_after_total || ''}
                    onChange={(e) => handleInputChange('fixed_distribution_after_total', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stawka zmienna {zoneLabelsAfter[0]} [zł/kWh]</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.variable_distribution_after_zone1_rate || ''}
                    onChange={(e) => handleInputChange('variable_distribution_after_zone1_rate', parseFloat(e.target.value) || 0)}
                  />
                </div>
                {zonesCountAfter >= 2 && (
                  <div className="space-y-2">
                    <Label>Stawka zmienna {zoneLabelsAfter[1]} [zł/kWh]</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.variable_distribution_after_zone2_rate || ''}
                      onChange={(e) => handleInputChange('variable_distribution_after_zone2_rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}
                {zonesCountAfter >= 3 && (
                  <div className="space-y-2">
                    <Label>Stawka zmienna {zoneLabelsAfter[2]} [zł/kWh]</Label>
                    <Input
                      type="number"
                      step="0.000001"
                      value={formData.variable_distribution_after_zone3_rate || ''}
                      onChange={(e) => handleInputChange('variable_distribution_after_zone3_rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Opłata mocowa za okres [zł]</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.capacity_charge_after || ''}
                    onChange={(e) => handleInputChange('capacity_charge_after', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              
              {/* Reactive Energy After */}
              <div className="pt-4 border-t">
                <ReactiveEnergyInput
                  prefix="after"
                  formData={formData}
                  onInputChange={handleInputChange}
                />
              </div>
            </CardContent>
          </Card>

          {/* Energy Consumption */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Zużycie energii [MWh]</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Strefa 1 ({zoneLabelsBefore[0]})</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.consumption_zone1_mwh || ''}
                  onChange={(e) => handleInputChange('consumption_zone1_mwh', parseFloat(e.target.value) || 0)}
                />
              </div>
              {(zonesCountBefore >= 2 || zonesCountAfter >= 2) && (
                <div className="space-y-2">
                  <Label>Strefa 2 ({zoneLabelsBefore[1] || zoneLabelsAfter[1]})</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.consumption_zone2_mwh || ''}
                    onChange={(e) => handleInputChange('consumption_zone2_mwh', parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
              {(zonesCountBefore >= 3 || zonesCountAfter >= 3) && (
                <div className="space-y-2">
                  <Label>Strefa 3 ({zoneLabelsBefore[2] || zoneLabelsAfter[2]})</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.consumption_zone3_mwh || ''}
                    onChange={(e) => handleInputChange('consumption_zone3_mwh', parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Energy Before */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Energia czynna – przed zmianami [zł/MWh]</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Cena {zoneLabelsBefore[0]}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.active_energy_price_before_zone1 || ''}
                  onChange={(e) => handleInputChange('active_energy_price_before_zone1', parseFloat(e.target.value) || 0)}
                />
              </div>
              {zonesCountBefore >= 2 && (
                <div className="space-y-2">
                  <Label>Cena {zoneLabelsBefore[1]}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.active_energy_price_before_zone2 || ''}
                    onChange={(e) => handleInputChange('active_energy_price_before_zone2', parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
              {zonesCountBefore >= 3 && (
                <div className="space-y-2">
                  <Label>Cena {zoneLabelsBefore[2]}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.active_energy_price_before_zone3 || ''}
                    onChange={(e) => handleInputChange('active_energy_price_before_zone3', parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Energy After */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Energia czynna – po zmianach [zł/MWh]</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Cena {zoneLabelsAfter[0]}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.active_energy_price_after_zone1 || ''}
                  onChange={(e) => handleInputChange('active_energy_price_after_zone1', parseFloat(e.target.value) || 0)}
                />
              </div>
              {zonesCountAfter >= 2 && (
                <div className="space-y-2">
                  <Label>Cena {zoneLabelsAfter[1]}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.active_energy_price_after_zone2 || ''}
                    onChange={(e) => handleInputChange('active_energy_price_after_zone2', parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
              {zonesCountAfter >= 3 && (
                <div className="space-y-2">
                  <Label>Cena {zoneLabelsAfter[2]}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.active_energy_price_after_zone3 || ''}
                    onChange={(e) => handleInputChange('active_energy_price_after_zone3', parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Handling Fee */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Opłata handlowa za okres [zł]</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Opłata handlowa PRZED</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.handling_fee_before || ''}
                  onChange={(e) => handleInputChange('handling_fee_before', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Opłata handlowa PO</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.handling_fee_after || ''}
                  onChange={(e) => handleInputChange('handling_fee_after', parseFloat(e.target.value) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg font-display flex items-center gap-2">
                {results.savingsValue > 0 ? (
                  <TrendingDown className="h-5 w-5 text-success" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                )}
                Podsumowanie oszczędności
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="text-center p-4 rounded-lg bg-background">
                  <p className="text-sm text-muted-foreground mb-1">Łączny koszt PRZED</p>
                  <p className="text-2xl font-bold">{formatCurrency(results.totalCostBefore)}</p>
                  <p className="text-xs text-muted-foreground">za okres ({periodMonths} mies.)</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-background">
                  <p className="text-sm text-muted-foreground mb-1">Łączny koszt PO</p>
                  <p className="text-2xl font-bold">{formatCurrency(results.totalCostAfter)}</p>
                  <p className="text-xs text-muted-foreground">za okres ({periodMonths} mies.)</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-background">
                  <p className="text-sm text-muted-foreground mb-1">Oszczędność</p>
                  <p className={`text-2xl font-bold ${results.savingsValue > 0 ? 'text-success' : results.savingsValue < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(results.savingsValue)}
                  </p>
                  <p className="text-xs text-muted-foreground">za okres ({periodMonths} mies.)</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-background">
                  <p className="text-sm text-muted-foreground mb-1">Oszczędność</p>
                  <p className={`text-2xl font-bold ${results.savingsValue > 0 ? 'text-success' : results.savingsValue < 0 ? 'text-destructive' : ''}`}>
                    {formatPercent(results.savingsPercent)}
                  </p>
                  <p className="text-xs text-muted-foreground">procentowo</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3 text-sm">
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground">Dystrybucja</p>
                  <p className="font-medium">{formatCurrency(results.distributionCostBefore)} → {formatCurrency(results.distributionCostAfter)}</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground">Energia czynna</p>
                  <p className="font-medium">{formatCurrency(results.activeEnergyCostBefore)} → {formatCurrency(results.activeEnergyCostAfter)}</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground">Opłata handlowa</p>
                  <p className="font-medium">{formatCurrency(results.handlingFeeBefore)} → {formatCurrency(results.handlingFeeAfter)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground">Opłata za moc umowną</p>
                  <p className="font-medium">
                    {formatCurrency(results.contractedPowerChargeBefore)} → {formatCurrency(results.contractedPowerChargeAfter)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    (stawka mies.: {formatNumber(Number(formData.contracted_power_charge_rate_before))} → {formatNumber(Number(formData.contracted_power_charge_rate_after))} zł/kW)
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-muted-foreground">Energia bierna</p>
                  <p className="font-medium">
                    {formatCurrency(results.reactiveEnergyCostBefore)} → {formatCurrency(results.reactiveEnergyCostAfter)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ({formData.reactive_monthly_mode_before ? 'suma miesięcy' : 'wartość całkowita'} → {formData.reactive_monthly_mode_after ? 'suma miesięcy' : 'wartość całkowita'})
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
