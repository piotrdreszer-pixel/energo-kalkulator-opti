-- Fix: Restrict energy_analyses access to only owners of the related client_project
-- This prevents users from accessing, modifying, or deleting other users' energy analyses

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can view all analyses" ON public.energy_analyses;
DROP POLICY IF EXISTS "Authenticated users can create analyses" ON public.energy_analyses;
DROP POLICY IF EXISTS "Authenticated users can update analyses" ON public.energy_analyses;
DROP POLICY IF EXISTS "Authenticated users can delete analyses" ON public.energy_analyses;

-- Create new ownership-based policies
CREATE POLICY "Users can view analyses for their own projects"
ON public.energy_analyses FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_projects
    WHERE client_projects.id = energy_analyses.client_project_id
    AND client_projects.created_by_user_id = auth.uid()
  )
);

CREATE POLICY "Users can create analyses for their own projects"
ON public.energy_analyses FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_projects
    WHERE client_projects.id = energy_analyses.client_project_id
    AND client_projects.created_by_user_id = auth.uid()
  )
);

CREATE POLICY "Users can update analyses for their own projects"
ON public.energy_analyses FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_projects
    WHERE client_projects.id = energy_analyses.client_project_id
    AND client_projects.created_by_user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete analyses for their own projects"
ON public.energy_analyses FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_projects
    WHERE client_projects.id = energy_analyses.client_project_id
    AND client_projects.created_by_user_id = auth.uid()
  )
);