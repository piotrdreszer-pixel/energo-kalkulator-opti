ALTER TABLE public.user_feature_access ADD COLUMN IF NOT EXISTS ai_assistant boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_feature_access(_feature text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT coalesce((SELECT CASE _feature WHEN 'invoice_import' THEN invoice_import WHEN 'multi_ppe' THEN multi_ppe WHEN 'ai_assistant' THEN ai_assistant ELSE false END FROM public.user_feature_access WHERE user_id=auth.uid()),false) $function$;

CREATE OR REPLACE FUNCTION public.audit_feature_access()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE before_import boolean:=false; before_multi boolean:=false; before_ai boolean:=false; BEGIN
IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.is_app_owner()) THEN RAISE EXCEPTION 'Tylko administrator może zmieniać dostęp do funkcji'; END IF;
IF TG_OP='UPDATE' THEN before_import:=OLD.invoice_import; before_multi:=OLD.multi_ppe; before_ai:=OLD.ai_assistant; END IF;
NEW.updated_at:=now();
IF NEW.invoice_import IS DISTINCT FROM before_import THEN INSERT INTO public.feature_access_history(actor_user_id,target_user_id,feature,old_value,new_value) VALUES(auth.uid(),NEW.user_id,'invoice_import',before_import,NEW.invoice_import); END IF;
IF NEW.multi_ppe IS DISTINCT FROM before_multi THEN INSERT INTO public.feature_access_history(actor_user_id,target_user_id,feature,old_value,new_value) VALUES(auth.uid(),NEW.user_id,'multi_ppe',before_multi,NEW.multi_ppe); END IF;
IF NEW.ai_assistant IS DISTINCT FROM before_ai THEN INSERT INTO public.feature_access_history(actor_user_id,target_user_id,feature,old_value,new_value) VALUES(auth.uid(),NEW.user_id,'ai_assistant',before_ai,NEW.ai_assistant); END IF;
RETURN NEW; END $function$;

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_group_id uuid NOT NULL REFERENCES public.analysis_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, analysis_group_id)
);
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  ppe_id uuid,
  ppe_label text,
  scope text NOT NULL DEFAULT 'ppe',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  analysis_group_id uuid,
  model text NOT NULL,
  status text NOT NULL,
  input_chars integer NOT NULL DEFAULT 0,
  output_chars integer NOT NULL DEFAULT 0,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ai_messages(conversation_id, created_at);
CREATE INDEX ON public.ai_usage_log(user_id, created_at);

GRANT SELECT ON public.ai_conversations TO authenticated;
GRANT SELECT ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_conversations, public.ai_messages, public.ai_usage_log TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own conversations with current access" ON public.ai_conversations FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.has_feature_access('ai_assistant') AND public.can_access_analysis_group(analysis_group_id));
CREATE POLICY "Own messages with current access" ON public.ai_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid() AND public.has_feature_access('ai_assistant') AND public.can_access_analysis_group(c.analysis_group_id)));
CREATE POLICY "Admins read usage" ON public.ai_usage_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.is_app_owner());