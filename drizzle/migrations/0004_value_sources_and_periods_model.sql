ALTER TABLE public.energy_analyses
  ADD COLUMN IF NOT EXISTS rates_year_before integer,
  ADD COLUMN IF NOT EXISTS rates_year_after integer,
  ADD COLUMN IF NOT EXISTS rates_source_before jsonb,
  ADD COLUMN IF NOT EXISTS rates_source_after jsonb,
  ADD COLUMN IF NOT EXISTS value_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_mode_before text NOT NULL DEFAULT 'rates',
  ADD COLUMN IF NOT EXISTS simulation_period_from date,
  ADD COLUMN IF NOT EXISTS simulation_period_to date,
  ADD COLUMN IF NOT EXISTS simulation_consumption_method text;

ALTER TABLE public.energy_analyses
  ADD CONSTRAINT energy_analyses_cost_mode_before_chk CHECK (cost_mode_before IN ('rates','invoice_actual')),
  ADD CONSTRAINT energy_analyses_sim_method_chk CHECK (simulation_consumption_method IS NULL OR simulation_consumption_method IN ('manual','historical_transfer','approved_estimate'));

COMMENT ON COLUMN public.energy_analyses.period_from IS 'Okres analizy (bez zmiany znaczenia). Okresy źródłowych rozliczeń z faktur będą w osobnej tabeli (etap 2).';
COMMENT ON COLUMN public.energy_analyses.rates_year_before IS 'Rok stawek PRZED wybrany przy ostatnim zapisie; NULL = analiza sprzed zmiany (rok nieznany).';
COMMENT ON COLUMN public.energy_analyses.rates_source_before IS 'Migawka zestawu stawek z bazy: {rate_card_id, rate_card_name, valid_from, valid_to, year, applied_at}; NULL = brak informacji.';
COMMENT ON COLUMN public.energy_analyses.value_sources IS 'Mapa pole -> {source: manual|rate_base|document|derived, rate_card_id?, document_id?, page?, item_ref?}. Brak wpisu = źródło nieznane.';
COMMENT ON COLUMN public.energy_analyses.cost_mode_before IS 'rates = według stawek (jedyny działający); invoice_actual = rzeczywiste koszty z faktur (zarezerwowane).';