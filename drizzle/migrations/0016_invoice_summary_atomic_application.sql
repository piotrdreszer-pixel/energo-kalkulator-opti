CREATE TABLE public.invoice_summary_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE, user_id uuid NOT NULL,
 analysis_group_id uuid NOT NULL REFERENCES public.analysis_groups(id) ON DELETE CASCADE,
 analysis_id uuid NOT NULL REFERENCES public.energy_analyses(id) ON DELETE CASCADE,
 fields jsonb NOT NULL, replaced_estimates uuid[] NOT NULL DEFAULT '{}', command text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz, undone_by uuid
);
GRANT SELECT ON public.invoice_summary_changes TO authenticated;
GRANT ALL ON public.invoice_summary_changes TO service_role;
ALTER TABLE public.invoice_summary_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own invoice summary history" ON public.invoice_summary_changes FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.has_feature_access('invoice_import') AND public.can_access_analysis_group(analysis_group_id));
CREATE OR REPLACE FUNCTION public.invoice_summary_allowed_fields() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT ARRAY['consumption_before_zone1_mwh','consumption_before_zone2_mwh','consumption_before_zone3_mwh','active_energy_price_before_zone1','active_energy_price_before_zone2','active_energy_price_before_zone3','capacity_charge_before','reactive_energy_cost_before','handling_fee_before'] $$;
CREATE OR REPLACE FUNCTION public.invoice_summary_snapshot(_actor uuid,_analysis_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.energy_analyses; d jsonb; r jsonb; i jsonb; a jsonb; payload jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',_actor::text,true);
 IF NOT public.has_feature_access('invoice_import') OR NOT public.ai_can_edit_analysis(_analysis_id) THEN RAISE EXCEPTION 'Brak dostępu do zastosowania faktur'; END IF;
 SELECT * INTO e FROM public.energy_analyses WHERE id=_analysis_id;
 IF NOT FOUND OR NOT public.can_edit_feature_group(e.analysis_group_id) THEN RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO d FROM public.analysis_documents x WHERE x.analysis_group_id=e.analysis_group_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO r FROM public.document_ppe_records x JOIN public.analysis_documents doc ON doc.id=x.document_id WHERE doc.analysis_group_id=e.analysis_group_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO i FROM public.document_line_items x JOIN public.analysis_documents doc ON doc.id=x.document_id WHERE doc.analysis_group_id=e.analysis_group_id;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO a FROM public.analysis_estimates x WHERE x.analysis_id=e.id AND x.status='active';
 payload=jsonb_build_object('row',to_jsonb(e),'docs',d,'records',r,'items',i,'estimates',a);
 RETURN payload || jsonb_build_object('token',md5(payload::text));
END $$;
REVOKE ALL ON FUNCTION public.invoice_summary_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_summary_snapshot(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.invoice_summary_commit(_actor uuid,_analysis_id uuid,_token text,_request_id uuid,_changes jsonb,_sources jsonb,_replace uuid[],_command text,_manual text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; e public.energy_analyses; old public.invoice_summary_changes; c jsonb; f text; src jsonb; vs jsonb; fields jsonb='{}'; rowj jsonb; cid uuid;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',_actor::text,true);
 SELECT * INTO e FROM public.energy_analyses WHERE id=_analysis_id FOR UPDATE;
 IF NOT public.has_feature_access('invoice_import') OR NOT public.ai_can_edit_analysis(e.id) OR NOT public.can_edit_feature_group(e.analysis_group_id) THEN RAISE EXCEPTION 'Brak prawa edycji tej analizy'; END IF;
 SELECT * INTO old FROM public.invoice_summary_changes WHERE request_id=_request_id;
 IF FOUND THEN
  IF old.user_id<>_actor OR old.analysis_id<>_analysis_id OR old.undone_at IS NOT NULL THEN RAISE EXCEPTION 'Nieprawidłowe ponowienie operacji'; END IF;
  RETURN jsonb_build_object('status','already_applied','change_id',old.id,'fields',old.fields);
 END IF;
 LOCK TABLE public.analysis_documents,public.document_ppe_records,public.document_line_items,public.analysis_estimates IN SHARE ROW EXCLUSIVE MODE;
 snap=public.invoice_summary_snapshot(_actor,_analysis_id);
 IF snap->>'token' IS DISTINCT FROM _token THEN RETURN jsonb_build_object('status','stale','message','Podsumowanie zmieniło się. Odśwież je i zatwierdź ponownie. Nic nie zapisano.'); END IF;
 IF jsonb_typeof(_changes)<>'array' OR jsonb_array_length(_changes)>9 THEN RAISE EXCEPTION 'Nieprawidłowe pola'; END IF;
 rowj=to_jsonb(e); vs=e.value_sources;
 FOR c IN SELECT * FROM jsonb_array_elements(_changes) LOOP
  f=c->>'field';
  IF NOT f=ANY(public.invoice_summary_allowed_fields()) OR jsonb_typeof(c->'value')<>'number' OR (c->>'value')::numeric<0 OR (c->>'value')::numeric>100000000 THEN RAISE EXCEPTION 'Niedozwolone pole lub wartość'; END IF;
  IF vs->f->>'source'='manual' AND NOT f=ANY(_manual) THEN RETURN jsonb_build_object('status','conflict','message','Ręczna korekta wymaga osobnej zgody. Nic nie zapisano.'); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM unnest(_replace) x WHERE NOT EXISTS(SELECT 1 FROM public.analysis_estimates a WHERE a.id=x AND a.analysis_id=e.id AND a.status='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(_changes) c WHERE c->>'field'=a.field))) THEN RAISE EXCEPTION 'Nieprawidłowy zastępowany szacunek'; END IF;
 IF jsonb_array_length(_changes)=0 AND cardinality(_replace)=0 THEN RETURN jsonb_build_object('status','unchanged','fields','{}'::jsonb); END IF;
 FOR c IN SELECT * FROM jsonb_array_elements(_changes) LOOP
  f=c->>'field';src=_sources->f;
  IF src->>'source'<>'document' THEN RAISE EXCEPTION 'Brak źródła dokumentowego'; END IF;
  EXECUTE format('UPDATE public.energy_analyses SET %I=$1 WHERE id=$2',f) USING (c->>'value')::numeric,e.id;
  fields=fields||jsonb_build_object(f,jsonb_build_object('before',rowj->f,'source_before',vs->f,'source_after',src));
  vs=jsonb_set(vs,ARRAY[f],src);
 END LOOP;
 UPDATE public.energy_analyses SET value_sources=vs WHERE id=e.id;
 SELECT to_jsonb(x) INTO rowj FROM public.energy_analyses x WHERE x.id=e.id;
 FOR f IN SELECT jsonb_object_keys(fields) LOOP fields=jsonb_set(fields,ARRAY[f,'after'],rowj->f); END LOOP;
 INSERT INTO public.invoice_summary_changes(request_id,user_id,analysis_group_id,analysis_id,fields,replaced_estimates,command) VALUES(_request_id,_actor,e.analysis_group_id,e.id,fields,_replace,_command) RETURNING id INTO cid;
 UPDATE public.analysis_estimates SET status='replaced',updated_at=now() WHERE id=ANY(_replace) AND analysis_id=e.id AND status='active';
 RETURN jsonb_build_object('status','applied','change_id',cid,'fields',fields);
END $$;
REVOKE ALL ON FUNCTION public.invoice_summary_commit(uuid,uuid,text,uuid,jsonb,jsonb,uuid[],text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_summary_commit(uuid,uuid,text,uuid,jsonb,jsonb,uuid[],text,text[]) TO service_role;
CREATE OR REPLACE FUNCTION public.invoice_summary_undo(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ch public.invoice_summary_changes; e public.energy_analyses; rowj jsonb; vs jsonb; f text; d jsonb;
BEGIN
 SELECT * INTO ch FROM public.invoice_summary_changes WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR ch.user_id IS DISTINCT FROM auth.uid() OR NOT public.has_feature_access('invoice_import') OR NOT public.ai_can_edit_analysis(ch.analysis_id) OR NOT public.can_edit_feature_group(ch.analysis_group_id) THEN RAISE EXCEPTION 'Brak prawa cofnięcia'; END IF;
 IF ch.undone_at IS NOT NULL THEN RETURN jsonb_build_object('status','already_undone'); END IF;
 SELECT * INTO e FROM public.energy_analyses WHERE id=ch.analysis_id FOR UPDATE;
 rowj=to_jsonb(e);vs=e.value_sources;
 FOR f,d IN SELECT * FROM jsonb_each(ch.fields) LOOP
  IF rowj->f IS DISTINCT FROM d->'after' OR vs->f IS DISTINCT FROM d->'source_after' THEN RETURN jsonb_build_object('status','conflict','message','Wartości zmieniono później. Nie cofnięto.'); END IF;
 END LOOP;
 FOR f,d IN SELECT * FROM jsonb_each(ch.fields) LOOP
  IF NOT f=ANY(public.invoice_summary_allowed_fields()) THEN RAISE EXCEPTION 'Niedozwolone pole'; END IF;
  EXECUTE format('UPDATE public.energy_analyses SET %I=$1 WHERE id=$2',f) USING (d->>'before')::numeric,e.id;
  vs=CASE WHEN d->'source_before' IS NULL OR d->'source_before'='null'::jsonb THEN vs-f ELSE jsonb_set(vs,ARRAY[f],d->'source_before') END;
 END LOOP;
 UPDATE public.energy_analyses SET value_sources=vs WHERE id=e.id;
 UPDATE public.analysis_estimates SET status='active',updated_at=now() WHERE id=ANY(ch.replaced_estimates) AND analysis_id=e.id AND status='replaced';
 UPDATE public.invoice_summary_changes SET undone_at=now(),undone_by=auth.uid() WHERE id=ch.id;
 RETURN jsonb_build_object('status','undone');
END $$;
REVOKE ALL ON FUNCTION public.invoice_summary_undo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.invoice_summary_undo(uuid) TO authenticated;
