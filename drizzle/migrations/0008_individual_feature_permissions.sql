CREATE TABLE public.user_feature_access (user_id uuid PRIMARY KEY, invoice_import boolean NOT NULL DEFAULT false, multi_ppe boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.user_feature_access TO authenticated;
GRANT ALL ON public.user_feature_access TO service_role;
ALTER TABLE public.user_feature_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or administer feature access" ON public.user_feature_access FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.is_app_owner());
CREATE POLICY "Admins insert feature access" ON public.user_feature_access FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_app_owner());
CREATE POLICY "Admins update feature access" ON public.user_feature_access FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_app_owner()) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_app_owner());
CREATE TABLE public.feature_access_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL, target_user_id uuid NOT NULL, feature text NOT NULL, old_value boolean NOT NULL, new_value boolean NOT NULL, changed_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.feature_access_history TO authenticated;
GRANT ALL ON public.feature_access_history TO service_role;
ALTER TABLE public.feature_access_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read feature history" ON public.feature_access_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.is_app_owner());
CREATE FUNCTION public.has_feature_access(_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce((SELECT CASE _feature WHEN 'invoice_import' THEN invoice_import WHEN 'multi_ppe' THEN multi_ppe ELSE false END FROM public.user_feature_access WHERE user_id=auth.uid()),false) $$;
REVOKE ALL ON FUNCTION public.has_feature_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_feature_access(text) TO authenticated,service_role;
CREATE FUNCTION public.audit_feature_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE before_import boolean:=false; before_multi boolean:=false; BEGIN
IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.is_app_owner()) THEN RAISE EXCEPTION 'Tylko administrator może zmieniać dostęp do funkcji'; END IF;
IF TG_OP='UPDATE' THEN before_import:=OLD.invoice_import; before_multi:=OLD.multi_ppe; END IF;
NEW.updated_at:=now();
IF NEW.invoice_import IS DISTINCT FROM before_import THEN INSERT INTO public.feature_access_history(actor_user_id,target_user_id,feature,old_value,new_value) VALUES(auth.uid(),NEW.user_id,'invoice_import',before_import,NEW.invoice_import); END IF;
IF NEW.multi_ppe IS DISTINCT FROM before_multi THEN INSERT INTO public.feature_access_history(actor_user_id,target_user_id,feature,old_value,new_value) VALUES(auth.uid(),NEW.user_id,'multi_ppe',before_multi,NEW.multi_ppe); END IF;
RETURN NEW; END $$;
CREATE TRIGGER audit_feature_access BEFORE INSERT OR UPDATE ON public.user_feature_access FOR EACH ROW EXECUTE FUNCTION public.audit_feature_access();
CREATE FUNCTION public.can_edit_feature_group(_group_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_access_analysis_group(_group_id) AND (public.has_feature_access('multi_ppe') OR (SELECT count(*) FROM public.energy_analyses WHERE analysis_group_id=_group_id)<=1) $$;
REVOKE ALL ON FUNCTION public.can_edit_feature_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_feature_group(uuid) TO authenticated,service_role;
CREATE FUNCTION public.guard_ppe_feature_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid; n integer; k text; src jsonb; BEGIN
IF auth.uid() IS NULL THEN IF auth.role()='service_role' THEN RETURN coalesce(NEW,OLD); ELSE RAISE EXCEPTION 'Brak autoryzacji'; END IF; END IF;
IF TG_OP<>'INSERT' THEN
PERFORM 1 FROM public.analysis_groups WHERE id=OLD.analysis_group_id FOR UPDATE;
IF NOT public.can_edit_feature_group(OLD.analysis_group_id) THEN RAISE EXCEPTION 'Edycja tej analizy wymaga dostępu do funkcji Analizy wielu PPE'; END IF;
END IF;
IF TG_OP='DELETE' THEN RETURN OLD; END IF;
gid:=NEW.analysis_group_id;
PERFORM 1 FROM public.analysis_groups WHERE id=gid FOR UPDATE;
SELECT count(*) INTO n FROM public.energy_analyses WHERE analysis_group_id=gid AND id<>NEW.id;
IF n>0 AND NOT public.has_feature_access('multi_ppe') THEN RAISE EXCEPTION 'Dodanie kolejnego PPE wymaga dostępu do funkcji Analizy wielu PPE'; END IF;
IF NOT public.has_feature_access('invoice_import') THEN
FOR k,src IN SELECT * FROM jsonb_each(coalesce(NEW.value_sources,'{}'::jsonb)) LOOP
IF src->>'source'='document' AND (TG_OP='INSERT' OR src IS DISTINCT FROM OLD.value_sources->k OR to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k) THEN RAISE EXCEPTION 'Zastosowanie danych z dokumentów wymaga dostępu do funkcji Import faktur'; END IF;
END LOOP;
END IF;
RETURN NEW; END $$;
CREATE TRIGGER zz_guard_ppe_feature_access BEFORE INSERT OR UPDATE OR DELETE ON public.energy_analyses FOR EACH ROW EXECUTE FUNCTION public.guard_ppe_feature_access();
CREATE FUNCTION public.guard_group_feature_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL AND auth.role()='service_role' THEN RETURN OLD; END IF;
PERFORM 1 FROM public.analysis_groups WHERE id=OLD.id FOR UPDATE;
IF NOT public.can_edit_feature_group(OLD.id) THEN RAISE EXCEPTION 'Edycja tej analizy wymaga dostępu do funkcji Analizy wielu PPE'; END IF;
RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER guard_group_feature_access BEFORE UPDATE OR DELETE ON public.analysis_groups FOR EACH ROW EXECUTE FUNCTION public.guard_group_feature_access();
CREATE POLICY "Invoice mutations require feature" ON public.analysis_documents AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (public.has_feature_access('invoice_import') AND public.can_edit_feature_group(analysis_group_id));
CREATE POLICY "Invoice deletes require feature" ON public.analysis_documents AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_feature_access('invoice_import') AND public.can_edit_feature_group(analysis_group_id));
CREATE POLICY "Invoice record mutations require feature" ON public.document_ppe_records AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (public.has_feature_access('invoice_import') AND EXISTS(SELECT 1 FROM public.analysis_documents d WHERE d.id=document_id AND public.can_edit_feature_group(d.analysis_group_id) AND (matched_analysis_id IS NULL OR EXISTS(SELECT 1 FROM public.energy_analyses a WHERE a.id=matched_analysis_id AND a.analysis_group_id=d.analysis_group_id))));
CREATE POLICY "Invoice record deletes require feature" ON public.document_ppe_records AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_feature_access('invoice_import') AND EXISTS(SELECT 1 FROM public.analysis_documents d WHERE d.id=document_id AND public.can_edit_feature_group(d.analysis_group_id)));
CREATE POLICY "Invoice item mutations require feature" ON public.document_line_items AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (public.has_feature_access('invoice_import') AND EXISTS(SELECT 1 FROM public.analysis_documents d WHERE d.id=document_id AND public.can_edit_feature_group(d.analysis_group_id)));
CREATE POLICY "Invoice item deletes require feature" ON public.document_line_items AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_feature_access('invoice_import') AND EXISTS(SELECT 1 FROM public.analysis_documents d WHERE d.id=document_id AND public.can_edit_feature_group(d.analysis_group_id)));
CREATE POLICY "Invoice storage insert requires feature" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (bucket_id<>'invoice-documents' OR (public.has_feature_access('invoice_import') AND public.can_edit_feature_group(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "Invoice storage update requires feature" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (bucket_id<>'invoice-documents' OR (public.has_feature_access('invoice_import') AND public.can_edit_feature_group(((storage.foldername(name))[1])::uuid))) WITH CHECK (bucket_id<>'invoice-documents' OR (public.has_feature_access('invoice_import') AND public.can_edit_feature_group(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "Invoice storage delete requires feature" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (bucket_id<>'invoice-documents' OR (public.has_feature_access('invoice_import') AND public.can_edit_feature_group(((storage.foldername(name))[1])::uuid)));
CREATE FUNCTION public.apply_invoice_period(_analysis_id uuid,_from date,_to date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid; BEGIN SELECT analysis_group_id INTO gid FROM public.energy_analyses WHERE id=_analysis_id; IF NOT public.has_feature_access('invoice_import') OR NOT public.can_edit_feature_group(gid) THEN RAISE EXCEPTION 'Brak dostępu do zastosowania faktur'; END IF; UPDATE public.energy_analyses SET period_from=_from,period_to=_to WHERE id=_analysis_id; END $$;
REVOKE ALL ON FUNCTION public.apply_invoice_period(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_invoice_period(uuid,date,date) TO authenticated;