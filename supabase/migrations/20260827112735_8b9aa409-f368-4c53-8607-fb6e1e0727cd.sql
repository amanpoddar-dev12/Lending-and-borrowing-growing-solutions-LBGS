ALTER TABLE public.field_visits ADD COLUMN IF NOT EXISTS voice_note_path text;

CREATE OR REPLACE FUNCTION public.set_field_visit_voice_note(p_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
BEGIN
  SELECT employee_id INTO v_emp FROM public.field_visits WHERE id = p_id;
  IF v_emp IS NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR v_emp = auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  UPDATE public.field_visits SET voice_note_path = p_path, updated_at = now() WHERE id = p_id;

  INSERT INTO public.field_visit_events (visit_id, actor_id, event, note)
  VALUES (p_id, auth.uid(), CASE WHEN p_path IS NULL THEN 'voice_note_removed' ELSE 'voice_note_attached' END, NULL);
END;
$$;

CREATE POLICY fva_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'field-visit-audio' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY fva_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'field-visit-audio' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY fva_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'field-visit-audio' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY fva_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'field-visit-audio' AND (storage.foldername(name))[1] = (auth.uid())::text);