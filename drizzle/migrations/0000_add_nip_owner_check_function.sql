CREATE OR REPLACE FUNCTION public.get_nip_owner(_nip text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT created_by_user_id
  FROM public.client_projects
  WHERE regexp_replace(client_nip, '[^0-9]', '', 'g') = regexp_replace(_nip, '[^0-9]', '', 'g')
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_nip_owner(text) TO authenticated;