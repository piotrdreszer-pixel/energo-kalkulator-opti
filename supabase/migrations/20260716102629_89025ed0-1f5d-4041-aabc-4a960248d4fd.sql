
CREATE TABLE IF NOT EXISTS public.osd_tariff_visibility (
  osd_id UUID NOT NULL REFERENCES public.osd_operators(id) ON DELETE CASCADE,
  tariff_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (osd_id, tariff_code)
);

GRANT SELECT ON public.osd_tariff_visibility TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.osd_tariff_visibility TO authenticated;
GRANT ALL ON public.osd_tariff_visibility TO service_role;

ALTER TABLE public.osd_tariff_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tariff visibility"
  ON public.osd_tariff_visibility FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert tariff visibility"
  ON public.osd_tariff_visibility FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tariff visibility"
  ON public.osd_tariff_visibility FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tariff visibility"
  ON public.osd_tariff_visibility FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_osd_tariff_visibility_updated_at
  BEFORE UPDATE ON public.osd_tariff_visibility
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
