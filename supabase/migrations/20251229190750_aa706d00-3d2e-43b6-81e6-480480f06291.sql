-- Add monthly reactive energy fields and update contracted power rate to monthly
-- Add reactive energy monthly input mode flag
ALTER TABLE public.energy_analyses 
  ADD COLUMN IF NOT EXISTS reactive_monthly_mode_before boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reactive_monthly_mode_after boolean NOT NULL DEFAULT false;

-- Add 12 monthly reactive energy fields for BEFORE
ALTER TABLE public.energy_analyses 
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_1 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_4 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_5 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_6 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_7 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_8 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_9 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_10 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_11 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_before_month_12 numeric DEFAULT 0;

-- Add 12 monthly reactive energy fields for AFTER  
ALTER TABLE public.energy_analyses 
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_1 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_4 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_5 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_6 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_7 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_8 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_9 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_10 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_11 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactive_energy_after_month_12 numeric DEFAULT 0;