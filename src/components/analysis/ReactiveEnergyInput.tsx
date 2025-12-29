import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MONTH_LABELS } from '@/lib/tariff-utils';
import type { EnergyAnalysis } from '@/types/database';

interface ReactiveEnergyInputProps {
  prefix: 'before' | 'after';
  formData: Partial<EnergyAnalysis>;
  onInputChange: (field: keyof EnergyAnalysis, value: string | number | boolean) => void;
}

export function ReactiveEnergyInput({ prefix, formData, onInputChange }: ReactiveEnergyInputProps) {
  const monthlyModeField = prefix === 'before' ? 'reactive_monthly_mode_before' : 'reactive_monthly_mode_after';
  const totalField = prefix === 'before' ? 'reactive_energy_cost_before' : 'reactive_energy_cost_after';
  const isMonthlyMode = formData[monthlyModeField] as boolean || false;
  
  const getMonthField = (month: number): keyof EnergyAnalysis => {
    return `reactive_energy_${prefix}_month_${month}` as keyof EnergyAnalysis;
  };
  
  // Calculate sum of monthly values for display
  const monthlySum = isMonthlyMode 
    ? Array.from({ length: 12 }, (_, i) => Number(formData[getMonthField(i + 1)]) || 0).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="font-medium">
          Koszt energii biernej {prefix === 'before' ? 'PRZED' : 'PO'}
        </Label>
        <div className="flex items-center gap-2">
          <Label htmlFor={monthlyModeField} className="text-sm text-muted-foreground cursor-pointer">
            Wprowadź miesięcznie
          </Label>
          <Switch
            id={monthlyModeField}
            checked={isMonthlyMode}
            onCheckedChange={(checked) => onInputChange(monthlyModeField, checked)}
          />
        </div>
      </div>
      
      {!isMonthlyMode ? (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Łączny koszt za okres analizy [zł]</Label>
          <Input
            type="number"
            step="0.01"
            value={formData[totalField] || ''}
            onChange={(e) => onInputChange(totalField, parseFloat(e.target.value) || 0)}
            placeholder="0.00"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wprowadź koszty energii biernej dla każdego miesiąca. Suma zostanie użyta w kalkulacji.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MONTH_LABELS.map((label, idx) => (
              <div key={idx} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{label} [zł]</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={Number(formData[getMonthField(idx + 1)]) || ''}
                  onChange={(e) => onInputChange(getMonthField(idx + 1), parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm">
              <span className="text-muted-foreground">Suma miesięcy: </span>
              <span className="font-medium">{monthlySum.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
