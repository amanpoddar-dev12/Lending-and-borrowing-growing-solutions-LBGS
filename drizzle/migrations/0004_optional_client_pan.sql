CREATE OR REPLACE FUNCTION public.emp_create_client(p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'employee') THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF NOT public.has_employee_permission(auth.uid(), 'clients.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage client information';
  END IF;

  IF NULLIF(p_values->>'business_name','') IS NULL THEN
    RAISE EXCEPTION 'business_name is required';
  END IF;
  IF NULLIF(p_values->>'phone','') IS NULL THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;
  IF NULLIF(p_values->>'gst_number','') IS NULL THEN
    RAISE EXCEPTION 'GST number is required';
  END IF;

  INSERT INTO public.clients (business_name, business_type, contact_person, email, phone, gst_number, pan, address, latitude, longitude)
  VALUES (
    NULLIF(p_values->>'business_name',''),
    NULLIF(p_values->>'business_type',''),
    NULLIF(p_values->>'contact_person',''),
    NULLIF(p_values->>'email',''),
    NULLIF(p_values->>'phone',''),
    NULLIF(p_values->>'gst_number',''),
    NULLIF(p_values->>'pan',''),
    NULLIF(p_values->>'address',''),
    (p_values->>'latitude')::numeric,
    (p_values->>'longitude')::numeric
  )
  RETURNING id INTO v_id;

  INSERT INTO public.client_employees (client_id, employee_id)
  VALUES (v_id, auth.uid())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, action, module, status, target_type, target_id, new_value)
  VALUES (auth.uid(), 'client_created', 'clients', 'success', 'client', v_id::text, p_values);

  RETURN v_id;
END;
$function$;