import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the set of tariff codes that have at least one visible rate_item
 * across active rate_cards for the given OSD. If no OSD is given or no data
 * is available, returns null (meaning: no filter — show all tariff codes).
 */
export function useVisibleTariffsForOsd(osdId: string | null | undefined) {
  const [visibleCodes, setVisibleCodes] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchCodes() {
      if (!osdId) {
        setVisibleCodes(null);
        return;
      }
      setLoading(true);
      const { data: cards } = await supabase
        .from('rate_cards')
        .select('id')
        .eq('osd_id', osdId)
        .eq('is_active', true);

      const cardIds = (cards ?? []).map(c => c.id);
      if (cardIds.length === 0) {
        if (!cancelled) setVisibleCodes(null);
        setLoading(false);
        return;
      }

      const { data: items } = await supabase
        .from('rate_items')
        .select('tariff_code, is_visible')
        .in('rate_card_id', cardIds)
        .eq('is_visible', true);

      if (cancelled) return;
      const codes = new Set<string>((items ?? []).map(i => (i.tariff_code || '').toUpperCase()));
      setVisibleCodes(codes.size > 0 ? codes : null);
      setLoading(false);
    }
    fetchCodes();
    return () => { cancelled = true; };
  }, [osdId]);

  return { visibleCodes, loading };
}
