import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUserRoles() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsManager(false);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      const roles = (data || []).map(r => r.role);
      setIsAdmin(roles.includes('admin'));
      setIsManager(roles.includes('manager'));
      setLoading(false);
    };
    check();
  }, [user]);

  return { isAdmin, isManager, loading };
}
