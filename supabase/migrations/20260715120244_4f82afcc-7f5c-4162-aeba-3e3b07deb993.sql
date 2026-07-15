
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
