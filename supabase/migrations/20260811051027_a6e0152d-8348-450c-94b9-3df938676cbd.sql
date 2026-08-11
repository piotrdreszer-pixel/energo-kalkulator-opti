REVOKE EXECUTE ON FUNCTION public.is_app_owner() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated, service_role;