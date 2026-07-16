import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VisibilityRow {
  osd_id: string;
  tariff_code: string;
  is_enabled: boolean;
}

/**
 * Fetches per-OSD tariff visibility. Missing rows = enabled by default.
 * Returns helpers to check enabled state and to toggle (admin only).
 */
export function useOsdTariffVisibility(osdId: string | null | undefined) {
  const [rows, setRows] = useState<VisibilityRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!osdId) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('osd_tariff_visibility')
      .select('osd_id, tariff_code, is_enabled')
      .eq('osd_id', osdId);
    if (!error && data) setRows(data as VisibilityRow[]);
    setLoading(false);
  }, [osdId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const isEnabled = useCallback(
    (tariffCode: string) => {
      const row = rows.find(r => r.tariff_code === tariffCode);
      return row ? row.is_enabled : true; // missing = enabled
    },
    [rows]
  );

  const setEnabled = useCallback(
    async (tariffCode: string, enabled: boolean) => {
      if (!osdId) return { error: new Error('No OSD selected') };
      const { error } = await supabase
        .from('osd_tariff_visibility')
        .upsert(
          { osd_id: osdId, tariff_code: tariffCode, is_enabled: enabled },
          { onConflict: 'osd_id,tariff_code' }
        );
      if (!error) {
        setRows(prev => {
          const idx = prev.findIndex(r => r.tariff_code === tariffCode);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], is_enabled: enabled };
            return next;
          }
          return [...prev, { osd_id: osdId, tariff_code: tariffCode, is_enabled: enabled }];
        });
      }
      return { error };
    },
    [osdId]
  );

  return { rows, loading, isEnabled, setEnabled, refetch: fetchRows };
}
