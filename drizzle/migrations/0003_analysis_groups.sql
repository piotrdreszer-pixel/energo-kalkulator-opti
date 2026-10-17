CREATE TABLE IF NOT EXISTS public.analysis_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.analysis_groups IS 'Parent savings analysis of a client project; each energy_analyses row is one PPE inside a group. Backfilled groups reuse the id of their original energy_analyses row.';
CREATE INDEX IF NOT EXISTS analysis_groups_project_idx ON public.analysis_groups(client_project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_groups TO authenticated;
GRANT ALL ON public.analysis_groups TO service_role;
ALTER TABLE public.analysis_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage groups of own projects" ON public.analysis_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_projects cp WHERE cp.id = analysis_groups.client_project_id AND cp.created_by_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_projects cp WHERE cp.id = analysis_groups.client_project_id AND cp.created_by_user_id = auth.uid()));
CREATE POLICY "Managers view managed groups" ON public.analysis_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_projects cp WHERE cp.id = analysis_groups.client_project_id AND public.is_manager_of(cp.created_by_user_id)));
CREATE POLICY "Managers update managed groups" ON public.analysis_groups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_projects cp WHERE cp.id = analysis_groups.client_project_id AND public.is_manager_of(cp.created_by_user_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.client_projects cp WHERE cp.id = analysis_groups.client_project_id AND public.is_manager_of(cp.created_by_user_id)));
CREATE POLICY "Admins view all groups" ON public.analysis_groups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "App owner full access groups" ON public.analysis_groups FOR ALL TO authenticated
  USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());

CREATE TRIGGER update_analysis_groups_updated_at BEFORE UPDATE ON public.analysis_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.energy_analyses ADD COLUMN IF NOT EXISTS analysis_group_id uuid REFERENCES public.analysis_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS energy_analyses_group_idx ON public.energy_analyses(analysis_group_id);

-- Backfill: each existing row becomes its own analysis with one PPE (idempotent, reversible: group.id = original row id)
INSERT INTO public.analysis_groups (id, client_project_id, name, created_at, updated_at)
SELECT ea.id, ea.client_project_id, ea.name, ea.created_at, ea.updated_at
FROM public.energy_analyses ea
WHERE ea.analysis_group_id IS NULL
ON CONFLICT (id) DO NOTHING;
UPDATE public.energy_analyses SET analysis_group_id = id WHERE analysis_group_id IS NULL;

-- Integrity + backward compatibility: auto-create a group for inserts without one; group must belong to the same project
CREATE OR REPLACE FUNCTION public.energy_analyses_group_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g_project uuid;
BEGIN
  IF NEW.analysis_group_id IS NULL THEN
    INSERT INTO public.analysis_groups (id, client_project_id, name)
    VALUES (NEW.id, NEW.client_project_id, NEW.name)
    ON CONFLICT (id) DO NOTHING;
    NEW.analysis_group_id := NEW.id;
  END IF;
  SELECT client_project_id INTO g_project FROM public.analysis_groups WHERE id = NEW.analysis_group_id;
  IF g_project IS NULL OR g_project <> NEW.client_project_id THEN
    RAISE EXCEPTION 'PPE musi należeć do analizy tego samego klienta';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS energy_analyses_group_guard ON public.energy_analyses;
CREATE TRIGGER energy_analyses_group_guard BEFORE INSERT OR UPDATE OF analysis_group_id, client_project_id ON public.energy_analyses
  FOR EACH ROW EXECUTE FUNCTION public.energy_analyses_group_guard();