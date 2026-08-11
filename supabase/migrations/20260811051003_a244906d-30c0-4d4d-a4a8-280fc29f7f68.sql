CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- HARDCODED APP OWNER (super admin). To revoke, change this email in code/migration.
  SELECT lower(coalesce((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()), '')) = 'piotr.dreszer@optienergia.pl'
$$;

CREATE POLICY "App owner full access" ON public.client_projects FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.energy_analyses FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.profiles FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.user_roles FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.manager_assignments FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.osd_operators FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.rate_cards FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.rate_items FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY "App owner full access" ON public.osd_tariff_visibility FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());