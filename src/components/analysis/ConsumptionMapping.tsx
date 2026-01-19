import React, { forwardRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { getZoneLabels, getDefaultDistribution } from '@/lib/tariff-utils';
import type { EnergyAnalysis } from '@/types/database';

interface ConsumptionMappingProps {
  zonesBefore: number;
  zonesAfter: number;
  formData: Partial<EnergyAnalysis>;
  onInputChange: (field: keyof EnergyAnalysis, value: number) => void;
  isAutoMode: boolean;
  setIsAutoMode: (value: boolean) => void;
  zoneDistribution: number[];
  setZoneDistribution: (value: number[]) => void;
}

// Track the previous zonesAfter to detect actual changes
const usePreviousZones = (zones: number) => {
  const ref = React.useRef<number | null>(null);
  React.useEffect(() => {
    ref.current = zones;
  });
  return ref.current;
};

export const ConsumptionMapping = forwardRef<HTMLDivElement, ConsumptionMappingProps>(
  function ConsumptionMapping(
    { zonesBefore, zonesAfter, formData, onInputChange, isAutoMode, setIsAutoMode, zoneDistribution, setZoneDistribution },
    ref
  ) {
    const zoneLabelsAfter = getZoneLabels(zonesAfter);
    const previousZonesAfter = usePreviousZones(zonesAfter);

    // Calculate total consumption from BEFORE scenario
    const totalConsumption =
      (Number(formData.consumption_before_zone1_mwh) || 0) +
      (Number(formData.consumption_before_zone2_mwh) || 0) +
      (Number(formData.consumption_before_zone3_mwh) || 0);

    // Reset distribution ONLY when zonesAfter actually changes (tariff switch)
    React.useEffect(() => {
      if (previousZonesAfter !== null && previousZonesAfter !== zonesAfter) {
        setZoneDistribution(getDefaultDistribution(zonesAfter));
      }
    }, [zonesAfter, previousZonesAfter, setZoneDistribution]);

  // Apply auto distribution when toggling or changing distribution
  React.useEffect(() => {
    if (isAutoMode && totalConsumption > 0) {
      const zone1 = zonesAfter >= 1 ? totalConsumption * (zoneDistribution[0] ?? 100) / 100 : 0;
      const zone2 = zonesAfter >= 2 ? totalConsumption * (zoneDistribution[1] ?? 0) / 100 : 0;
      const zone3 = zonesAfter >= 3 ? totalConsumption * (zoneDistribution[2] ?? 0) / 100 : 0;
      
      // Update all zones in sequence
      onInputChange('consumption_after_zone1_mwh', zone1);
      onInputChange('consumption_after_zone2_mwh', zone2);
      onInputChange('consumption_after_zone3_mwh', zone3);
    }
  }, [isAutoMode, zoneDistribution, totalConsumption, zonesAfter, onInputChange]);

  const handleSliderChange = (index: number, value: number[]) => {
    const newValue = value[0];
    const newDistribution = [...zoneDistribution];
    
    if (zonesAfter === 2) {
      newDistribution[0] = newValue;
      newDistribution[1] = 100 - newValue;
    } else if (zonesAfter === 3) {
      // More complex logic for 3 zones
      const diff = newValue - newDistribution[index];
      newDistribution[index] = newValue;
      
      // Adjust other zones proportionally
      const otherIndices = [0, 1, 2].filter(i => i !== index);
      const otherTotal = otherIndices.reduce((sum, i) => sum + newDistribution[i], 0);
      
      if (otherTotal > 0) {
        otherIndices.forEach(i => {
          newDistribution[i] = Math.max(0, newDistribution[i] - (diff * newDistribution[i] / otherTotal));
        });
      }
      
      // Normalize to 100%
      const total = newDistribution.reduce((sum, v) => sum + v, 0);
      if (total > 0) {
        newDistribution.forEach((v, i) => {
          newDistribution[i] = (v / total) * 100;
        });
      }
    }
    
    setZoneDistribution(newDistribution);
    
    // Immediately apply the new distribution to formData
    if (totalConsumption > 0) {
      const zone1 = zonesAfter >= 1 ? totalConsumption * newDistribution[0] / 100 : 0;
      const zone2 = zonesAfter >= 2 ? totalConsumption * newDistribution[1] / 100 : 0;
      const zone3 = zonesAfter >= 3 ? totalConsumption * (newDistribution[2] ?? 0) / 100 : 0;
      
      onInputChange('consumption_after_zone1_mwh', zone1);
      onInputChange('consumption_after_zone2_mwh', zone2);
      onInputChange('consumption_after_zone3_mwh', zone3);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Zużycie energii – Stan po zmianie</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-mode" className="text-sm text-muted-foreground">
              Automatyczne mapowanie
            </Label>
            <Switch
              id="auto-mode"
              checked={isAutoMode}
              onCheckedChange={setIsAutoMode}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAutoMode && totalConsumption > 0 && zonesAfter > 1 && zoneDistribution.length >= zonesAfter && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Całkowite zużycie do rozdzielenia: <span className="font-medium text-foreground">{totalConsumption.toFixed(4)} MWh</span>
            </p>
            
            {zonesAfter === 2 && zoneLabelsAfter.length >= 2 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{zoneLabelsAfter[0]}: {(zoneDistribution[0] ?? 0).toFixed(0)}%</span>
                  <span>{zoneLabelsAfter[1]}: {(zoneDistribution[1] ?? 0).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[zoneDistribution[0] ?? 60]}
                  onValueChange={(v) => handleSliderChange(0, v)}
                  min={0}
                  max={100}
                  step={1}
                />
              </div>
            )}
            
            {zonesAfter === 3 && zoneLabelsAfter.length >= 3 && (
              <div className="space-y-3">
                {zoneLabelsAfter.slice(0, 3).map((label, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{label}</span>
                      <span>{(zoneDistribution[index] ?? 0).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[zoneDistribution[index] ?? 0]}
                      onValueChange={(v) => handleSliderChange(index, v)}
                      min={0}
                      max={100}
                      step={1}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{zoneLabelsAfter[0]} [MWh]</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={formData.consumption_after_zone1_mwh || ''}
              onChange={(e) => {
                const value = e.target.value.replace(',', '.');
                onInputChange('consumption_after_zone1_mwh', parseFloat(value) || 0);
              }}
              disabled={isAutoMode}
            />
          </div>
          {zonesAfter >= 2 && (
            <div className="space-y-2">
              <Label>{zoneLabelsAfter[1]} [MWh]</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={formData.consumption_after_zone2_mwh || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(',', '.');
                  onInputChange('consumption_after_zone2_mwh', parseFloat(value) || 0);
                }}
                disabled={isAutoMode}
              />
            </div>
          )}
          {zonesAfter >= 3 && (
            <div className="space-y-2">
              <Label>{zoneLabelsAfter[2]} [MWh]</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={formData.consumption_after_zone3_mwh || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(',', '.');
                  onInputChange('consumption_after_zone3_mwh', parseFloat(value) || 0);
                }}
                disabled={isAutoMode}
              />
            </div>
          )}
        </div>

        {isAutoMode && (
          <p className="text-xs text-muted-foreground">
            Wyłącz automatyczne mapowanie, aby ręcznie wprowadzić zużycie w każdej strefie.
          </p>
        )}
      </CardContent>
    </Card>
  );
});