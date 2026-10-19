CREATE OR REPLACE FUNCTION public.guard_group_feature_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP='DELETE' THEN RETURN OLD; END IF;
IF auth.uid() IS NULL AND auth.role()='service_role' THEN RETURN NEW; END IF;
PERFORM 1 FROM public.analysis_groups WHERE id=OLD.id FOR UPDATE;
IF NOT public.can_edit_feature_group(OLD.id) THEN RAISE EXCEPTION 'Edycja tej analizy wymaga dostępu do funkcji Analizy wielu PPE'; END IF;
RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.guard_ppe_feature_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE gid uuid; n integer; k text; src jsonb; BEGIN
IF TG_OP='DELETE' THEN RETURN OLD; END IF;
IF auth.uid() IS NULL THEN IF auth.role()='service_role' THEN RETURN NEW; ELSE RAISE EXCEPTION 'Brak autoryzacji'; END IF; END IF;
IF TG_OP='UPDATE' THEN
PERFORM 1 FROM public.analysis_groups WHERE id=OLD.analysis_group_id FOR UPDATE;
IF NOT public.can_edit_feature_group(OLD.analysis_group_id) THEN RAISE EXCEPTION 'Edycja tej analizy wymaga dostępu do funkcji Analizy wielu PPE'; END IF;
END IF;
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
CREATE FUNCTION public.can_delete_client_project(_project_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.client_projects p WHERE p.id=_project_id AND (p.created_by_user_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.is_app_owner())) $$;
REVOKE ALL ON FUNCTION public.can_delete_client_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_delete_client_project(uuid) TO authenticated;
CREATE POLICY "Admins delete projects" ON public.client_projects FOR DELETE TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete groups" ON public.analysis_groups FOR DELETE TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete PPE" ON public.energy_analyses FOR DELETE TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.invoice_file_cleanup (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_path text NOT NULL, actor_user_id uuid, created_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, last_error text);
GRANT ALL ON public.invoice_file_cleanup TO service_role;
ALTER TABLE public.invoice_file_cleanup ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.queue_deleted_invoice_file() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF OLD.file_path LIKE OLD.analysis_group_id::text || '/' || OLD.id::text || '/%' AND NOT EXISTS(SELECT 1 FROM public.analysis_documents d WHERE d.file_path=OLD.file_path AND d.id<>OLD.id) THEN
INSERT INTO public.invoice_file_cleanup(file_path,actor_user_id) VALUES(OLD.file_path,auth.uid());
END IF;
RETURN OLD; END $$;
CREATE TRIGGER queue_deleted_invoice_file BEFORE DELETE ON public.analysis_documents FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_invoice_file();
CREATE FUNCTION public.delete_client_object(_kind text,_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE pid uuid; BEGIN
IF _kind='project' THEN pid:=_id;
ELSIF _kind='group' THEN SELECT client_project_id INTO pid FROM public.analysis_groups WHERE id=_id;
ELSIF _kind='ppe' THEN SELECT client_project_id INTO pid FROM public.energy_analyses WHERE id=_id;
ELSE RAISE EXCEPTION 'Nieprawidłowy rodzaj obiektu'; END IF;
IF NOT public.can_delete_client_project(pid) THEN RAISE EXCEPTION 'Brak uprawnień do usunięcia' USING ERRCODE='42501'; END IF;
PERFORM 1 FROM public.client_projects WHERE id=pid FOR UPDATE;
IF _kind='project' THEN DELETE FROM public.client_projects WHERE id=_id;
ELSIF _kind='group' THEN DELETE FROM public.analysis_groups WHERE id=_id AND client_project_id=pid;
ELSE DELETE FROM public.energy_analyses WHERE id=_id AND client_project_id=pid;
END IF;
IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono obiektu do usunięcia'; END IF;
RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_client_object(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_object(text,uuid) TO authenticated;