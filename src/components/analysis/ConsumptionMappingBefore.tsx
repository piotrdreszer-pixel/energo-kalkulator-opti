import React, { forwardRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { getZoneLabels, getDefaultDistribution } from '@/lib/tariff-utils';
import type { EnergyAnalysis } from '@/types/database';

interface ConsumptionMappingBeforeProps {
  zonesCount: number;
  formData: Partial<EnergyAnalysis>;
  onInputChange: (field: keyof EnergyAnalysis, value: number) => void;
  isAutoMode: boolean;
  setIsAutoMode: (value: boolean) => void;
  zoneDistribution: number[];
  setZoneDistribution: (value: number[]) => void;
  totalConsumption: number;
  setTotalConsumption: (value: number) => void;
}

const usePreviousZones = (zones: number) => {
  const ref = React.useRef<number | null>(null);
  React.useEffect(() => {
    ref.current = zones;
  });
  return ref.current;
};

export const ConsumptionMappingBefore = forwardRef<HTMLDivElement, ConsumptionMappingBeforeProps>(
  function ConsumptionMappingBefore(
    { zonesCount, formData, onInputChange, isAutoMode, setIsAutoMode, zoneDistribution, setZoneDistribution, totalConsumption, setTotalConsumption },
    ref
  ) {
    const zoneLabels = getZoneLabels(zonesCount);
    const previousZones = usePreviousZones(zonesCount);

    // Reset distribution when zonesCount changes
    React.useEffect(() => {
      const needsReset = zoneDistribution.length !== zonesCount || 
        (previousZones !== null && previousZones !== zonesCount);
      if (needsReset) {
        setZoneDistribution(getDefaultDistribution(zonesCount));
      }
    }, [zonesCount, previousZones, zoneDistribution.length, setZoneDistribution]);

    // Apply auto distribution when toggling or changing distribution
    React.useEffect(() => {
      if (isAutoMode && totalConsumption > 0) {
        const zone1 = zonesCount >= 1 ? totalConsumption * (zoneDistribution[0] ?? 100) / 100 : 0;
        const zone2 = zonesCount >= 2 ? totalConsumption * (zoneDistribution[1] ?? 0) / 100 : 0;
        const zone3 = zonesCount >= 3 ? totalConsumption * (zoneDistribution[2] ?? 0) / 100 : 0;
        
        onInputChange('consumption_before_zone1_mwh', zone1);
        onInputChange('consumption_before_zone2_mwh', zone2);
        onInputChange('consumption_before_zone3_mwh', zone3);
      }
    }, [isAutoMode, zoneDistribution, totalConsumption, zonesCount, onInputChange]);

    const handleSliderChange = (index: number, value: number[]) => {
      const newValue = value[0];
      const newDistribution = [...zoneDistribution];
      
      if (zonesCount === 2) {
        newDistribution[0] = newValue;
        newDistribution[1] = 100 - newValue;
      } else if (zonesCount === 3) {
        const diff = newValue - newDistribution[index];
        newDistribution[index] = newValue;
        
        const otherIndices = [0, 1, 2].filter(i => i !== index);
        const otherTotal = otherIndices.reduce((sum, i) => sum + newDistribution[i], 0);
        
        if (otherTotal > 0) {
          otherIndices.forEach(i => {
            newDistribution[i] = Math.max(0, newDistribution[i] - (diff * newDistribution[i] / otherTotal));
          });
        }
        
        const total = newDistribution.reduce((sum, v) => sum + v, 0);
        if (total > 0) {
          newDistribution.forEach((v, i) => {
            newDistribution[i] = (v / total) * 100;
          });
        }
      }
      
      setZoneDistribution(newDistribution);
      
      if (totalConsumption > 0) {
        const zone1 = zonesCount >= 1 ? totalConsumption * newDistribution[0] / 100 : 0;
        const zone2 = zonesCount >= 2 ? totalConsumption * newDistribution[1] / 100 : 0;
        const zone3 = zonesCount >= 3 ? totalConsumption * (newDistribution[2] ?? 0) / 100 : 0;
        
        onInputChange('consumption_before_zone1_mwh', zone1);
        onInputChange('consumption_before_zone2_mwh', zone2);
        onInputChange('consumption_before_zone3_mwh', zone3);
      }
    };

    const handleTotalConsumptionChange = (value: number) => {
      setTotalConsumption(value);
      
      if (isAutoMode && value > 0) {
        const zone1 = zonesCount >= 1 ? value * (zoneDistribution[0] ?? 100) / 100 : 0;
        const zone2 = zonesCount >= 2 ? value * (zoneDistribution[1] ?? 0) / 100 : 0;
        const zone3 = zonesCount >= 3 ? value * (zoneDistribution[2] ?? 0) / 100 : 0;
        
        onInputChange('consumption_before_zone1_mwh', zone1);
        onInputChange('consumption_before_zone2_mwh', zone2);
        onInputChange('consumption_before_zone3_mwh', zone3);
      }
    };

    return (
      <Card ref={ref}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Zużycie energii – Stan obecny</CardTitle>
            {zonesCount > 1 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="auto-mode-before" className="text-sm text-muted-foreground">
                  Automatyczne mapowanie
                </Label>
                <Switch
                  id="auto-mode-before"
                  checked={isAutoMode}
                  onCheckedChange={setIsAutoMode}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Total consumption input */}
          <div className="space-y-2">
            <Label>Całkowite zużycie [MWh]</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={totalConsumption || ''}
              onChange={(e) => {
                const value = e.target.value.replace(',', '.');
                handleTotalConsumptionChange(parseFloat(value) || 0);
              }}
              placeholder="Wprowadź całkowite zużycie energii"
            />
          </div>

          {/* Sliders for distribution (only for multi-zone tariffs) */}
          {isAutoMode && totalConsumption > 0 && zonesCount > 1 && zoneDistribution.length >= zonesCount && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Podział zużycia: <span className="font-medium text-foreground">{totalConsumption.toFixed(4)} MWh</span>
              </p>
              
              {zonesCount === 2 && zoneLabels.length >= 2 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{zoneLabels[0]}: {(zoneDistribution[0] ?? 0).toFixed(0)}%</span>
                    <span>{zoneLabels[1]}: {(zoneDistribution[1] ?? 0).toFixed(0)}%</span>
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
              
              {zonesCount === 3 && zoneLabels.length >= 3 && (
                <div className="space-y-3">
                  {zoneLabels.slice(0, 3).map((label, index) => (
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

          {/* Zone inputs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{zoneLabels[0]} [MWh]</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={formData.consumption_before_zone1_mwh || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(',', '.');
                  onInputChange('consumption_before_zone1_mwh', parseFloat(value) || 0);
                }}
                disabled={isAutoMode && zonesCount > 1}
              />
            </div>
            {zonesCount >= 2 && (
              <div className="space-y-2">
                <Label>{zoneLabels[1]} [MWh]</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.consumption_before_zone2_mwh || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(',', '.');
                    onInputChange('consumption_before_zone2_mwh', parseFloat(value) || 0);
                  }}
                  disabled={isAutoMode}
                />
              </div>
            )}
            {zonesCount >= 3 && (
              <div className="space-y-2">
                <Label>{zoneLabels[2]} [MWh]</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.consumption_before_zone3_mwh || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(',', '.');
                    onInputChange('consumption_before_zone3_mwh', parseFloat(value) || 0);
                  }}
                  disabled={isAutoMode}
                />
              </div>
            )}
          </div>

          {isAutoMode && zonesCount > 1 && (
            <p className="text-xs text-muted-foreground">
              Wyłącz automatyczne mapowanie, aby ręcznie wprowadzić zużycie w każdej strefie.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
);
