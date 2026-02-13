
-- 1. Add 'manager' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- 2. Create manager_assignments table
CREATE TABLE public.manager_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL,
  managed_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_by_user_id uuid,
  UNIQUE (manager_user_id, managed_user_id)
);

-- 3. Enable RLS
ALTER TABLE public.manager_assignments ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for manager_assignments
CREATE POLICY "Admins can view all assignments"
  ON public.manager_assignments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert assignments"
  ON public.manager_assignments FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assignments"
  ON public.manager_assignments FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their own assignments"
  ON public.manager_assignments FOR SELECT
  USING (auth.uid() = manager_user_id);

-- 5. Create helper function: check if caller manages a given user
CREATE OR REPLACE FUNCTION public.is_manager_of(_managed_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manager_assignments
    WHERE manager_user_id = auth.uid()
      AND managed_user_id = _managed_user_id
  )
$$;

-- 6. Update client_projects RLS: managers can SELECT projects of their managed users
CREATE POLICY "Managers can view managed users projects"
  ON public.client_projects FOR SELECT
  USING (public.is_manager_of(created_by_user_id));

-- 7. Managers can UPDATE projects of their managed users
CREATE POLICY "Managers can update managed users projects"
  ON public.client_projects FOR UPDATE
  USING (public.is_manager_of(created_by_user_id))
  WITH CHECK (public.is_manager_of(created_by_user_id));

-- 8. Update energy_analyses RLS: managers can SELECT analyses of managed users' projects
CREATE POLICY "Managers can view managed users analyses"
  ON public.energy_analyses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_projects cp
    WHERE cp.id = energy_analyses.client_project_id
      AND public.is_manager_of(cp.created_by_user_id)
  ));

-- 9. Managers can UPDATE analyses of managed users' projects
CREATE POLICY "Managers can update managed users analyses"
  ON public.energy_analyses FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.client_projects cp
    WHERE cp.id = energy_analyses.client_project_id
      AND public.is_manager_of(cp.created_by_user_id)
  ));

-- 10. Managers can view profiles of their managed users
CREATE POLICY "Managers can view managed users profiles"
  ON public.profiles FOR SELECT
  USING (public.is_manager_of(user_id));
