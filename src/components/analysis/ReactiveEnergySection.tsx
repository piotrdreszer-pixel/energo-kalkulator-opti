import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { MONTH_LABELS } from '@/lib/tariff-utils';
import type { EnergyAnalysis } from '@/types/database';

type ScenarioPrefix = 'before' | 'after';

interface ReactiveEnergySectionProps {
  prefix: ScenarioPrefix;
  formData: Partial<EnergyAnalysis>;
  onInputChange: (field: keyof EnergyAnalysis, value: number | boolean) => void;
}

// Individual input component that manages its own text state
const NumericInput = ({
  value,
  onChange,
  placeholder = "0.00",
  className = "",
  unitLabel = "zł",
}: {
  value: number | null | undefined;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  unitLabel?: string;
}) => {
  const [text, setText] = useState<string>(() => {
    if (value === null || value === undefined || value === 0) return '';
    return String(value);
  });
  const [isFocused, setIsFocused] = useState(false);
  const prevValueRef = useRef(value);

  // Only sync external value when not focused AND value actually changed externally
  useEffect(() => {
    if (!isFocused && value !== prevValueRef.current) {
      if (value === null || value === undefined || value === 0) {
        setText('');
      } else {
        setText(String(value));
      }
    }
    prevValueRef.current = value;
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setText(newText);
    
    const normalized = newText.replace(',', '.');
    const parsed = parseFloat(normalized);
    
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else if (newText === '' || newText === '-') {
      onChange(0);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Clean up the display on blur
    if (value === null || value === undefined || value === 0) {
      setText('');
    } else {
      setText(String(value));
    }
  };

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={className}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
        {unitLabel}
      </span>
    </div>
  );
};

export const ReactiveEnergySection: React.FC<ReactiveEnergySectionProps> = ({
  prefix,
  formData,
  onInputChange,
}) => {
  const monthlyModeField = prefix === 'before' ? 'reactive_monthly_mode_before' : 'reactive_monthly_mode_after';
  const totalField = prefix === 'before' ? 'reactive_energy_cost_before' : 'reactive_energy_cost_after';
  const isMonthlyMode = formData[monthlyModeField] as boolean || false;
  const [isOpen, setIsOpen] = useState(false);

  const getMonthField = (month: number): keyof EnergyAnalysis => {
    return `reactive_energy_${prefix}_month_${month}` as keyof EnergyAnalysis;
  };

  // Calculate sum of monthly values
  const monthlySum = isMonthlyMode
    ? Array.from({ length: 12 }, (_, i) => Number(formData[getMonthField(i + 1)]) || 0).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Energia bierna</Label>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${monthlyModeField}-switch`} className="text-xs text-muted-foreground cursor-pointer">
            Rozbij na miesiące
          </Label>
          <Switch
            id={`${monthlyModeField}-switch`}
            checked={isMonthlyMode}
            onCheckedChange={(checked) => onInputChange(monthlyModeField as keyof EnergyAnalysis, checked)}
          />
        </div>
      </div>

      {!isMonthlyMode ? (
        <NumericInput
          value={formData[totalField] as number}
          onChange={(val) => onInputChange(totalField, val)}
          className="pr-12"
          unitLabel="zł"
        />
      ) : (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between" size="sm">
              <span>
                Suma: {monthlySum.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MONTH_LABELS.map((label, idx) => (
                <div key={idx} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <NumericInput
                    value={formData[getMonthField(idx + 1)] as number}
                    onChange={(val) => onInputChange(getMonthField(idx + 1), val)}
                    className="pr-10 h-8 text-sm"
                    unitLabel="zł"
                  />
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
