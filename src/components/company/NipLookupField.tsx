import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, AlertCircle, CheckCircle2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useCompanyLookup, CompanyData, DebugInfo } from '@/hooks/useCompanyLookup';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface NipLookupFieldProps {
  value: string;
  onChange: (value: string) => void;
  onCompanyFound: (data: CompanyData) => void;
  onClear?: () => void;
  disabled?: boolean;
  autoFetch?: boolean;
  className?: string;
}

// Check if we're in development mode
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

function ProviderDebugRow({ name, debug }: { name: string; debug: { attempted: boolean; httpStatus: number | null; errorMessage: string | null; durationMs: number | null; success: boolean } }) {
  if (!debug.attempted) {
    return (
      <div className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
        <span className="font-medium text-muted-foreground">{name}</span>
        <span className="text-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
      <span className="font-medium">{name}</span>
      <div className="flex items-center gap-2">
        {debug.success ? (
          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            OK
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
            {debug.httpStatus || 'Error'}
          </Badge>
        )}
        {debug.durationMs !== null && (
          <span className="text-muted-foreground">{debug.durationMs}ms</span>
        )}
        {debug.errorMessage && !debug.success && (
          <span className="text-destructive truncate max-w-[120px]" title={debug.errorMessage}>
            {debug.errorMessage}
          </span>
        )}
      </div>
    </div>
  );
}

function DebugPanel({ debug }: { debug: DebugInfo }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Pokaż szczegóły diagnostyczne
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 bg-muted/50 rounded-md border text-sm">
          <div className="space-y-1">
            <ProviderDebugRow name="GUS/MF" debug={debug.gus} />
            <ProviderDebugRow name="CEIDG" debug={debug.ceidg} />
            <ProviderDebugRow name="KRS" debug={debug.krs} />
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
            <span>Łączny czas: {debug.totalDurationMs}ms</span>
            {debug.cached && <Badge variant="secondary" className="text-xs">Z cache</Badge>}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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

  // Get debug info from error or data
  const debugInfo = error?.debug || data?.debug;

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
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{error.message}</span>
          </div>
          {/* Show debug panel in dev mode */}
          {isDevelopment && error.debug && (
            <DebugPanel debug={error.debug} />
          )}
        </div>
      )}

      {/* Success state with source */}
      {data && !isLoading && !error && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>Dane pobrane pomyślnie</span>
            <Badge variant="outline" className="text-xs">
              Źródło: {data.source}
            </Badge>
            {data.debug?.cached && (
              <Badge variant="secondary" className="text-xs">
                Z cache
              </Badge>
            )}
          </div>
          {/* Show debug panel in dev mode */}
          {isDevelopment && data.debug && (
            <DebugPanel debug={data.debug} />
          )}
        </div>
      )}
    </div>
  );
}
