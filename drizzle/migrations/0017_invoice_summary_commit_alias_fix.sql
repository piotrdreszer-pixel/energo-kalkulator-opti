CREATE OR REPLACE FUNCTION public.invoice_summary_commit(_actor uuid,_analysis_id uuid,_token text,_request_id uuid,_changes jsonb,_sources jsonb,_replace uuid[],_command text,_manual text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; e public.energy_analyses; old public.invoice_summary_changes; item jsonb; f text; src jsonb; vs jsonb; fields jsonb='{}'; rowj jsonb; cid uuid;
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
 FOR item IN SELECT * FROM jsonb_array_elements(_changes) LOOP
  f=item->>'field';
  IF NOT f=ANY(public.invoice_summary_allowed_fields()) OR jsonb_typeof(item->'value')<>'number' OR (item->>'value')::numeric<0 OR (item->>'value')::numeric>100000000 THEN RAISE EXCEPTION 'Niedozwolone pole lub wartość'; END IF;
  IF vs->f->>'source'='manual' AND NOT f=ANY(_manual) THEN RETURN jsonb_build_object('status','conflict','message','Ręczna korekta wymaga osobnej zgody. Nic nie zapisano.'); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM unnest(_replace) x WHERE NOT EXISTS(SELECT 1 FROM public.analysis_estimates a WHERE a.id=x AND a.analysis_id=e.id AND a.status='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(_changes) change_entry WHERE change_entry->>'field'=a.field))) THEN RAISE EXCEPTION 'Nieprawidłowy zastępowany szacunek'; END IF;
 IF jsonb_array_length(_changes)=0 AND cardinality(_replace)=0 THEN RETURN jsonb_build_object('status','unchanged','fields','{}'::jsonb); END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(_changes) LOOP
  f=item->>'field';src=_sources->f;
  IF src->>'source'<>'document' THEN RAISE EXCEPTION 'Brak źródła dokumentowego'; END IF;
  EXECUTE format('UPDATE public.energy_analyses SET %I=$1 WHERE id=$2',f) USING (item->>'value')::numeric,e.id;
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