import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ResolvedRates } from '@/types/database';

interface UseRatesResolverReturn {
  resolveRates: (osdId: string, tariffCode: string, season?: string, date?: string) => Promise<ResolvedRates | null>;
  isLoading: boolean;
  error: string | null;
}

export function useRatesResolver(): UseRatesResolverReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveRates = async (
    osdId: string,
    tariffCode: string,
    season: string = 'ALL',
    date?: string
  ): Promise<ResolvedRates | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        osd_id: osdId,
        tariff: tariffCode,
        season,
      });

      if (date) {
        params.append('date', date);
      }

      // Call the edge function directly with query params
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/rates-resolve?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 404) {
          setError(errorData.message || 'Nie znaleziono stawek dla wybranych parametrów');
          return null;
        }
        throw new Error(errorData.message || 'Błąd podczas pobierania stawek');
      }

      const result: ResolvedRates = await response.json();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd';
      setError(message);
      console.error('[useRatesResolver] Error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { resolveRates, isLoading, error };
}