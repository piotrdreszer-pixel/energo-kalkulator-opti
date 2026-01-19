-- Add RLS policies for admins to manage rate_cards
CREATE POLICY "Admins can insert rate cards"
ON public.rate_cards
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update rate cards"
ON public.rate_cards
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete rate cards"
ON public.rate_cards
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add RLS policies for admins to manage rate_items
CREATE POLICY "Admins can insert rate items"
ON public.rate_items
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update rate items"
ON public.rate_items
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete rate items"
ON public.rate_items
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Add RLS policies for admins to manage osd_operators
CREATE POLICY "Admins can insert OSD operators"
ON public.osd_operators
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update OSD operators"
ON public.osd_operators
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete OSD operators"
ON public.osd_operators
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));