import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useCompanyLookup, CompanyData } from '@/hooks/useCompanyLookup';
import { cn } from '@/lib/utils';

interface NipLookupFieldProps {
  value: string;
  onChange: (value: string) => void;
  onCompanyFound: (data: CompanyData) => void;
  onClear?: () => void;
  disabled?: boolean;
  autoFetch?: boolean;
  className?: string;
}

export function NipLookupField({
  value,
  onChange,
  onCompanyFound,
  onClear,
  disabled = false,
  autoFetch = true,
  className,
}: NipLookupFieldProps) {
  const { isLoading, error, data, fetchCompany, fetchWithDebounce, reset, validateNIPFormat } = useCompanyLookup();
  const [localValue, setLocalValue] = useState(value);

  // Sync local value with prop
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits, max 10
    const newValue = e.target.value.replace(/\D/g, '').slice(0, 10);
    setLocalValue(newValue);
    onChange(newValue);

    // Auto-fetch with debounce when 10 digits
    if (autoFetch && newValue.length === 10) {
      fetchWithDebounce(newValue);
    }
  };

  // Handle fetch button click
  const handleFetch = async () => {
    const result = await fetchCompany(localValue);
    if (result) {
      onCompanyFound(result);
    }
  };

  // Handle clear
  const handleClear = () => {
    setLocalValue('');
    onChange('');
    reset();
    onClear?.();
  };

  // When data is received from auto-fetch
  useEffect(() => {
    if (data) {
      onCompanyFound(data);
    }
  }, [data, onCompanyFound]);

  const isValidFormat = localValue.length === 10;
  const showFetchButton = localValue.length > 0;

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor="nip">NIP *</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="nip"
            placeholder="np. 1234567890"
            value={localValue}
            onChange={handleChange}
            disabled={disabled || isLoading}
            className={cn(
              'pr-10',
              error && 'border-destructive focus-visible:ring-destructive'
            )}
            maxLength={10}
          />
          {localValue.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              disabled={isLoading}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {showFetchButton && (
          <Button
            type="button"
            variant="outline"
            onClick={handleFetch}
            disabled={disabled || isLoading || !isValidFormat}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pobieram...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Pobierz dane
              </>
            )}
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Pobieram dane z rejestrów...</span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error.message}</span>
        </div>
      )}

      {/* Success state with source */}
      {data && !isLoading && !error && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>Dane pobrane pomyślnie</span>
          <Badge variant="outline" className="text-xs">
            Źródło: {data.source}
          </Badge>
        </div>
      )}
    </div>
  );
}
