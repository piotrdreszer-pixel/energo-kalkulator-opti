import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useOsdTariffVisibility } from '@/hooks/useOsdTariffVisibility';
import { TARIFF_CODES } from '@/lib/tariff-utils';
import { toast } from 'sonner';

interface TariffVisibilityPanelProps {
  osdId: string;
}

// Include A23 as an option even though it isn't in TARIFF_CODES yet
const EXTRA_CODES = ['A23'];

export function TariffVisibilityPanel({ osdId }: TariffVisibilityPanelProps) {
  const { isEnabled, setEnabled, loading } = useOsdTariffVisibility(osdId);

  const codes = React.useMemo(() => {
    const base = TARIFF_CODES.map(t => t.code);
    const extras = EXTRA_CODES.filter(c => !base.includes(c as never));
    return [...base, ...extras];
  }, []);

  const handleToggle = async (code: string, next: boolean) => {
    const { error } = await setEnabled(code, next);
    if (error) {
      toast.error('Nie udało się zapisać widoczności taryfy');
    } else {
      toast.success(next ? `Taryfa ${code} włączona` : `Taryfa ${code} wyłączona`);
    }
  };

  return (
    <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Widoczność taryf w kalkulatorze</Label>
        {loading && <span className="text-xs text-muted-foreground">…</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        Odhacz taryfy, które mają być dostępne na liście podczas wyliczeń dla tego operatora.
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
        {codes.map(code => {
          const enabled = isEnabled(code);
          return (
            <label
              key={code}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-background/60 cursor-pointer"
            >
              <span className="text-sm font-mono">{code}</span>
              <Switch
                checked={enabled}
                onCheckedChange={(v) => handleToggle(code, v)}
                aria-label={`Widoczność taryfy ${code}`}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
