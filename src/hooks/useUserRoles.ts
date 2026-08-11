import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useUserRoles() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setIsAdmin(false);
        setIsManager(false);
        setIsOwner(false);
        setLoading(false);
        return;
      }
      const [{ data }, { data: ownerData }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id),
        supabase.rpc('is_app_owner'),
      ]);
      const roles = (data || []).map(r => r.role);
      const owner = ownerData === true;
      setIsOwner(owner);
      setIsAdmin(owner || roles.includes('admin'));
      setIsManager(owner || roles.includes('manager'));
      setLoading(false);
    };
    check();
  }, [user]);

  return { isAdmin, isManager, isOwner, loading };
}

