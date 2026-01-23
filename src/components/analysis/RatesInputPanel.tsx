import React, { forwardRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, RotateCcw } from 'lucide-react';
import { getZoneLabels } from '@/lib/tariff-utils';
import { ReactiveEnergySection } from './ReactiveEnergySection';
import type { EnergyAnalysis, ResolvedRates } from '@/types/database';

type ScenarioPrefix = 'before' | 'after';

interface RatesInputPanelProps {
  prefix: ScenarioPrefix;
  formData: Partial<EnergyAnalysis>;
  onInputChange: (field: keyof EnergyAnalysis, value: number | boolean) => void;
  zonesCount: number;
  resolvedRates: ResolvedRates | null;
  onFetchRates: () => void;
  onResetRates: () => void;
  isFetching: boolean;
  isManualMode: boolean;
  setIsManualMode: (value: boolean) => void;
  overriddenFields: Record<string, number>;
  setOverriddenFields: (fields: Record<string, number>) => void;
}

export const RatesInputPanel = forwardRef<HTMLDivElement, RatesInputPanelProps>(
  function RatesInputPanel(
    {
      prefix,
      formData,
      onInputChange,
      zonesCount,
      resolvedRates,
      onFetchRates,
      onResetRates,
      isFetching,
      isManualMode,
      setIsManualMode,
      overriddenFields,
      setOverriddenFields,
    },
    ref
  ) {
  const zoneLabels = getZoneLabels(zonesCount);
  const isAfter = prefix === 'after';
  const title = isAfter ? 'Stan po zmianie' : 'Stan obecny';

  const getFieldName = (base: string, zone?: number): keyof EnergyAnalysis => {
    if (zone !== undefined) {
      return `variable_distribution_${prefix}_zone${zone}_rate` as keyof EnergyAnalysis;
    }
    return `${base}_${prefix}` as keyof EnergyAnalysis;
  };

  const handleInputChange = (field: keyof EnergyAnalysis, value: number | boolean) => {
    onInputChange(field, value);
    
    // Track overridden fields (only for numeric values)
    if (isManualMode && typeof value === 'number') {
      setOverriddenFields({
        ...overriddenFields,
        [field]: value,
      });
    }
  };

  const isOverridden = (field: string) => {
    return Object.keys(overriddenFields).includes(field);
  };

  const parseLocaleNumber = (value: string): number => {
    // Replace comma with dot for parsing
    const normalized = value.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatDisplayValue = (value: number | null | undefined): string => {
    if (value === null || value === undefined || value === 0) return '';
    // Keep exact string representation to preserve trailing zeros
    return String(value);
  };

  const renderInput = (
    label: string, 
    field: keyof EnergyAnalysis, 
    unit: string,
    _step: string = '0.01'
  ) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm">{label}</Label>
        {isOverridden(field) && (
          <Badge variant="outline" className="text-xs">nadpisane</Badge>
        )}
      </div>
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={formatDisplayValue(formData[field] as number)}
          onChange={(e) => handleInputChange(field, parseLocaleNumber(e.target.value))}
          disabled={!isManualMode && resolvedRates !== null}
          className="pr-16"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  );

  return (
    <Card className={isAfter ? 'border-primary/30 bg-primary/5' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onFetchRates}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Zaciągnij stawki</span>
            </Button>
          </div>
        </div>
        {resolvedRates && (
          <p className="text-xs text-muted-foreground mt-1">
            Źródło: {resolvedRates.rateCardName} ({resolvedRates.validFrom} - {resolvedRates.validTo || 'aktualnie'})
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <Switch
              id={`manual-mode-${prefix}`}
              checked={isManualMode}
              onCheckedChange={setIsManualMode}
            />
            <Label htmlFor={`manual-mode-${prefix}`} className="text-sm">
              Ręczna korekta
            </Label>
          </div>
          {Object.keys(overriddenFields).length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetRates}
              className="text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Przywróć z bazy
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {renderInput(
            'Opłata stała sieciowa',
            `contracted_power_charge_rate_${prefix}` as keyof EnergyAnalysis,
            'zł/kW/mies'
          )}
          {renderInput(
            'Opłata mocowa',
            `capacity_charge_${prefix}` as keyof EnergyAnalysis,
            'zł'
          )}
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Stawki zmienne dystrybucji</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {zoneLabels.map((label, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  {isOverridden(`variable_distribution_${prefix}_zone${index + 1}_rate`) && (
                    <Badge variant="outline" className="text-[10px] px-1">!</Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={formatDisplayValue(formData[`variable_distribution_${prefix}_zone${index + 1}_rate` as keyof EnergyAnalysis] as number)}
                    onChange={(e) => handleInputChange(
                      `variable_distribution_${prefix}_zone${index + 1}_rate` as keyof EnergyAnalysis,
                      parseLocaleNumber(e.target.value)
                    )}
                    disabled={!isManualMode && resolvedRates !== null}
                    className="pr-14 text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                    zł/kWh
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 p-5 -mx-4 bg-primary/5 border-y border-primary/20">
          <Label className="text-base font-semibold text-foreground flex items-center gap-2">
            <span className="inline-block w-1.5 h-5 bg-primary rounded-full"></span>
            Ceny energii czynnej
          </Label>
          <div className="grid gap-4 sm:grid-cols-3">
            {zoneLabels.map((label, index) => (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  {isOverridden(`active_energy_price_${prefix}_zone${index + 1}`) && (
                    <Badge variant="outline" className="text-[10px] px-1">!</Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={formatDisplayValue(formData[`active_energy_price_${prefix}_zone${index + 1}` as keyof EnergyAnalysis] as number)}
                    onChange={(e) => handleInputChange(
                      `active_energy_price_${prefix}_zone${index + 1}` as keyof EnergyAnalysis,
                      parseLocaleNumber(e.target.value)
                    )}
                    className="pr-16 h-11 text-base bg-background border-primary/30 focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    zł/MWh
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {renderInput(
            'Suma pozostałych opłat',
            `fixed_distribution_${prefix}_total` as keyof EnergyAnalysis,
            'zł'
          )}
        </div>

        {/* Reactive Energy Section with monthly breakdown */}
        <ReactiveEnergySection
          prefix={prefix}
          formData={formData}
          onInputChange={handleInputChange}
        />

        {/* Handling fee - always editable */}
        <div className="space-y-2">
          <Label className="text-sm">Opłata handlowa (miesięcznie)</Label>
          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              value={formatDisplayValue(formData[`handling_fee_${prefix}` as keyof EnergyAnalysis] as number)}
              onChange={(e) => handleInputChange(
                `handling_fee_${prefix}` as keyof EnergyAnalysis,
                parseLocaleNumber(e.target.value)
              )}
              className="pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              zł/mies.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});