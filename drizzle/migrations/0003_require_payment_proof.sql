CREATE OR REPLACE FUNCTION public.client_submit_payment(p_order_id uuid, p_amount numeric, p_method text, p_reference text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_o public.orders; v_id uuid;
BEGIN
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = v_o.client_id AND c.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  -- payment_pending kept for orders created under the pre-delivery payment flow
  IF v_o.status NOT IN ('completed','payment_pending') THEN
    RAISE EXCEPTION 'Payment can be submitted once the order is delivered';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_payments WHERE order_id = p_order_id AND status = 'submitted') THEN
    RAISE EXCEPTION 'A payment is already under verification for this order';
  END IF;
  IF p_method NOT IN ('upi','bank_transfer','cash','cheque','other') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF NULLIF(trim(p_proof_path), '') IS NULL THEN RAISE EXCEPTION 'Payment proof is required'; END IF;

  INSERT INTO public.order_payments(order_id, client_id, amount, method, reference_id, proof_path, note, submitted_by)
  VALUES (p_order_id, v_o.client_id, p_amount, p_method, NULLIF(p_reference,''), NULLIF(p_proof_path,''), NULLIF(p_note,''), auth.uid())
  RETURNING id INTO v_id;

  PERFORM set_config('app.order_workflow','on',true);
  UPDATE public.orders SET status = 'payment_submitted', updated_at = now() WHERE id = p_order_id;
  PERFORM set_config('app.order_workflow','',true);

  INSERT INTO public.order_events(order_id, actor_id, event, from_status, to_status, note)
  VALUES (p_order_id, auth.uid(), 'payment_submitted', v_o.status::text, 'payment_submitted', p_method);

  INSERT INTO public.notifications(user_id, type, title, message, reference_id)
  SELECT ur.user_id, 'payment', 'Payment awaiting verification',
         'Order ' || v_o.order_number || ' has a new payment proof', p_order_id::text
    FROM public.user_roles ur WHERE ur.role = 'admin';

  INSERT INTO public.audit_logs(actor_id, action, module, status, target_type, target_id, new_value)
  VALUES (auth.uid(), 'payment.submitted', 'payments', 'success', 'order', p_order_id::text,
          jsonb_build_object('amount', p_amount, 'method', p_method, 'reference', p_reference));
  RETURN v_id;
END;$function$;