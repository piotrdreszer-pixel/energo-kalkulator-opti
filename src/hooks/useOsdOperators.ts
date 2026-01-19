import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OsdOperator } from '@/types/database';

export function useOsdOperators() {
  return useQuery({
    queryKey: ['osd-operators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('osd_operators')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as OsdOperator[];
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });
}