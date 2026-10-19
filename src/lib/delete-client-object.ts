import { supabase } from '@/integrations/supabase/client';

export async function deleteClientObject(kind: 'project' | 'group' | 'ppe', id: string) {
  const { data, error } = await supabase.rpc('delete_client_object', { _kind: kind, _id: id });
  if (error) throw error;
  if (data !== true) throw new Error('Nie potwierdzono usunięcia');
  // The transaction has committed; failed file cleanup stays queued for retry.
  await supabase.functions.invoke('cleanup-invoice-files').catch(() => undefined);
}