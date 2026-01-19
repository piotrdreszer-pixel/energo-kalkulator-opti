-- Create OSD operators table
CREATE TABLE public.osd_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.osd_operators ENABLE ROW LEVEL SECURITY;

-- Public read access for OSD operators
CREATE POLICY "Anyone can view OSD operators" ON public.osd_operators
  FOR SELECT USING (true);

-- Create rate cards table (a package of rates for specific OSD/date range)
CREATE TABLE public.rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  osd_id UUID REFERENCES public.osd_operators(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  source_document TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rate_cards ENABLE ROW LEVEL SECURITY;

-- Public read access for rate cards
CREATE POLICY "Anyone can view rate cards" ON public.rate_cards
  FOR SELECT USING (true);

-- Create rate items table (individual rate values)
CREATE TABLE public.rate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id UUID REFERENCES public.rate_cards(id) ON DELETE CASCADE NOT NULL,
  tariff_code TEXT NOT NULL,
  season TEXT DEFAULT 'ALL', -- 'ALL', 'SUMMER', 'WINTER'
  rate_type TEXT NOT NULL, -- 'SIEC_STALA', 'SIEC_ZMIENNA_STREFA1', 'SIEC_ZMIENNA_STREFA2', 'SIEC_ZMIENNA_STREFA3', 'OPLATA_MOCOWA', 'OPLATA_JAKOSCIOWA', 'OPLATA_ABONAMENTOWA', 'OPLATA_PRZEJSCIOWA', 'ENERGIA_BIERNA'
  unit TEXT NOT NULL, -- 'zl/kW/mies', 'zl/kWh', 'zl/mies', etc.
  value NUMERIC(12,6) NOT NULL,
  zone_number INTEGER, -- 1, 2, 3 for variable rates
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rate_items ENABLE ROW LEVEL SECURITY;

-- Public read access for rate items
CREATE POLICY "Anyone can view rate items" ON public.rate_items
  FOR SELECT USING (true);

-- Add indexes for faster lookups
CREATE INDEX idx_rate_items_rate_card_id ON public.rate_items(rate_card_id);
CREATE INDEX idx_rate_items_tariff_code ON public.rate_items(tariff_code);
CREATE INDEX idx_rate_cards_osd_id ON public.rate_cards(osd_id);
CREATE INDEX idx_rate_cards_valid_from ON public.rate_cards(valid_from);

-- Update trigger for rate_cards
CREATE TRIGGER update_rate_cards_updated_at
  BEFORE UPDATE ON public.rate_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add new fields to energy_analyses for enhanced comparison
ALTER TABLE public.energy_analyses
  ADD COLUMN IF NOT EXISTS osd_id UUID REFERENCES public.osd_operators(id),
  ADD COLUMN IF NOT EXISTS rates_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS consumption_before_zone1_mwh NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumption_before_zone2_mwh NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumption_before_zone3_mwh NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumption_after_zone1_mwh NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumption_after_zone2_mwh NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumption_after_zone3_mwh NUMERIC(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rates_overridden_before JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rates_overridden_after JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rate_card_id_before UUID REFERENCES public.rate_cards(id),
  ADD COLUMN IF NOT EXISTS rate_card_id_after UUID REFERENCES public.rate_cards(id),
  ADD COLUMN IF NOT EXISTS consultant_notes TEXT,
  ADD COLUMN IF NOT EXISTS shared_power_mode BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS season_before TEXT DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS season_after TEXT DEFAULT 'ALL';