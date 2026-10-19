import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAdminRole() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [{ data, error }, { data: ownerData }] = await Promise.all([
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle(),
          supabase.rpc('is_app_owner'),
        ]);

        if (error) {
          console.error('Error checking admin role:', error);
          setIsAdmin(ownerData === true);
        } else {
          setIsAdmin(!!data || ownerData === true);
        }

      } catch (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      } finally {
        setCheckedUserId(user.id);
        setLoading(false);
      }
    };

    checkAdminRole();
  }, [user]);

  return { isAdmin: !!user && checkedUserId === user.id && isAdmin, loading: loading || (!!user && checkedUserId !== user.id) };
}
