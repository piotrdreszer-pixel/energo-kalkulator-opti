CREATE OR REPLACE FUNCTION public.ai_undo_change(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ch public.ai_applied_changes; p public.ai_proposals; e public.energy_analyses; rowj jsonb; vs jsonb; f text; d jsonb; conflicts text[] := '{}';
BEGIN
  SELECT * INTO ch FROM public.ai_applied_changes WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono zmiany'; END IF;
  SELECT * INTO p FROM public.ai_proposals WHERE id = ch.proposal_id FOR UPDATE;
  PERFORM public.ai_proposal_guard(p);
  IF ch.undone_at IS NOT NULL THEN RETURN jsonb_build_object('status','already_undone'); END IF;
  SELECT * INTO e FROM public.energy_analyses WHERE id = ch.analysis_id FOR UPDATE;
  rowj := to_jsonb(e); vs := coalesce(e.value_sources, '{}'::jsonb);
  FOR f, d IN SELECT * FROM jsonb_each(ch.fields) LOOP
    IF (rowj->f) IS DISTINCT FROM (d->'after') OR (vs->f) IS DISTINCT FROM (d->'source_after') THEN conflicts := conflicts || f; END IF;
  END LOOP;
  IF array_length(conflicts, 1) > 0 THEN RETURN jsonb_build_object('status','conflict','fields',to_jsonb(conflicts)); END IF;
  FOR f, d IN SELECT * FROM jsonb_each(ch.fields) LOOP
    IF NOT (f = ANY(public.ai_allowed_fields(p.kind))) THEN RAISE EXCEPTION 'Niedozwolone pole: %', f; END IF;
    EXECUTE format('UPDATE public.energy_analyses SET %I = %L WHERE id = $1', f, d->>'before') USING ch.analysis_id;
    vs := CASE WHEN d->'source_before' IS NULL OR d->'source_before' = 'null'::jsonb THEN vs - f ELSE jsonb_set(vs, ARRAY[f], d->'source_before') END;
  END LOOP;
  UPDATE public.energy_analyses SET value_sources = vs WHERE id = ch.analysis_id;
  IF p.kind = 'estimate' THEN
    UPDATE public.analysis_estimates SET status = 'undone', updated_at = now() WHERE change_id = ch.id AND status = 'active';
  ELSIF p.kind = 'estimate_replace' THEN
    UPDATE public.analysis_estimates SET status = 'active', replaced_change_id = NULL, updated_at = now() WHERE replaced_change_id = ch.id;
  END IF;
  UPDATE public.ai_applied_changes SET undone_at = now(), undone_by = auth.uid() WHERE id = ch.id;
  UPDATE public.ai_proposals SET status = 'undone', updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('status','undone');
END $$;