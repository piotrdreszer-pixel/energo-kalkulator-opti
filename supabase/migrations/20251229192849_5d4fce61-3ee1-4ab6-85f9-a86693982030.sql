-- Fix: Restrict client_projects SELECT to only show projects created by the user
-- This prevents exposure of created_by_user_id to other authenticated users

DROP POLICY IF EXISTS "Authenticated users can view all projects" ON public.client_projects;

CREATE POLICY "Users can view their own projects"
ON public.client_projects FOR SELECT
TO authenticated
USING (auth.uid() = created_by_user_id);

-- Also fix the UPDATE policy while we're at it (related security issue)
DROP POLICY IF EXISTS "Authenticated users can update projects" ON public.client_projects;

CREATE POLICY "Users can update their own projects"
ON public.client_projects FOR UPDATE
TO authenticated
USING (auth.uid() = created_by_user_id)
WITH CHECK (auth.uid() = created_by_user_id);