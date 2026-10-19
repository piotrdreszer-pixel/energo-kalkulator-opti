import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !anon || !key || !authorization) return new Response('Unauthorized', { status: 401, headers: cors });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: cors });
  const admin = createClient(url, key);
  const [role, owner] = await Promise.all([
    userClient.rpc('has_role', { _user_id: data.user.id, _role: 'admin' }),
    userClient.rpc('is_app_owner'),
  ]);
  const privileged = !role.error && role.data === true || !owner.error && owner.data === true;
  let query = admin.from('invoice_file_cleanup').select('*').order('created_at').limit(100);
  if (!privileged) query = query.eq('actor_user_id', data.user.id);
  const { data: jobs, error: jobsError } = await query;
  if (jobsError) return new Response('Cleanup unavailable', { status: 503, headers: cors });
  let cleaned = 0;
  for (const job of jobs || []) {
    const { count, error: referencesError } = await admin.from('analysis_documents').select('id', { count: 'exact', head: true }).eq('file_path', job.file_path);
    if (referencesError || (count ?? 0) > 0) continue;
    const { error: fileError } = await admin.storage.from('invoice-documents').remove([job.file_path]);
    if (fileError) {
      await admin.from('invoice_file_cleanup').update({ attempts: job.attempts + 1, last_error: fileError.message }).eq('id', job.id);
    } else {
      await admin.from('invoice_file_cleanup').delete().eq('id', job.id);
      cleaned++;
    }
  }
  return new Response(JSON.stringify({ cleaned }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});