import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { featureRules } from '@/lib/feature-access';

export async function requireFeature(feature: 'invoice_import' | 'multi_ppe', groupId?: string | null) {
  const { data, error } = await supabase.rpc('has_feature_access', { _feature: feature });
  if (error || data !== true) throw new Error(`Brak dostępu do funkcji ${feature === 'invoice_import' ? 'Import faktur' : 'Analizy wielu PPE'}`);
  if (groupId) {
    const { data: editable, error: groupError } = await supabase.rpc('can_edit_feature_group', { _group_id: groupId });
    if (groupError || editable !== true) throw new Error('Edycja tej analizy wymaga dostępu do funkcji Analizy wielu PPE');
  }
}

export function useFeatureAccess(count = 0) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['feature-access', user?.id], enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from('user_feature_access').select('invoice_import,multi_ppe,ai_assistant').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 1000, refetchIntervalInBackground: true, refetchOnWindowFocus: 'always', staleTime: 0, retry: false,
  });
  return { ...featureRules(query.error || !user ? null : query.data, count), loading: !!user && query.isPending };
}

export function useGroupFeatureAccess(groupId?: string | null) {
  const countQuery = useQuery({
    queryKey: ['feature-group-count', groupId], enabled: !!groupId,
    queryFn: async () => {
      if (!groupId) return 0;
      const { count, error } = await supabase.from('energy_analyses').select('id', { count: 'exact', head: true }).eq('analysis_group_id', groupId);
      if (error) throw error;
      return count ?? 0;
    }, refetchInterval: 1000, staleTime: 0,
  });
  const access = useFeatureAccess(countQuery.data ?? 0);
  const unknown = !!groupId && (countQuery.isPending || !!countQuery.error);
  return { ...access, readOnly: access.readOnly || unknown, canAddPpe: access.canAddPpe && !unknown, canImport: access.canImport && !unknown, loading: access.loading || (!!groupId && countQuery.isPending) };
}