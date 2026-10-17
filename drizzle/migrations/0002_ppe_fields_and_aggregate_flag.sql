ALTER TABLE public.energy_analyses ADD COLUMN IF NOT EXISTS ppe_number text;
ALTER TABLE public.energy_analyses ADD COLUMN IF NOT EXISTS ppe_address text;
ALTER TABLE public.energy_analyses ADD COLUMN IF NOT EXISTS include_in_project_report boolean NOT NULL DEFAULT false;