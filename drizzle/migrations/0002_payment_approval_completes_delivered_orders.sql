CREATE OR REPLACE FUNCTION public.admin_review_payment(p_payment_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_p public.order_payments; v_o public.orders; v_client_user uuid;
        v_inv public.invoices; v_new public.order_status; v_paid numeric; v_delivered boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  SELECT * INTO v_p FROM public.order_payments WHERE id = p_payment_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF v_p.status <> 'submitted' THEN RAISE EXCEPTION 'Payment already reviewed'; END IF;
  IF p_action = 'reject' AND COALESCE(NULLIF(trim(p_reason),''), NULL) IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  SELECT * INTO v_o FROM public.orders WHERE id = v_p.order_id;
  SELECT * INTO v_inv FROM public.invoices WHERE order_id = v_p.order_id ORDER BY created_at LIMIT 1;
  -- Delivered = invoice exists OR the delivery code was verified (post-delivery payment flow).
  v_delivered := v_inv.id IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.delivery_otps d WHERE d.order_id = v_p.order_id AND d.used_at IS NOT NULL);

  UPDATE public.order_payments
     SET status = CASE p_action WHEN 'approve' THEN 'verified' ELSE 'rejected' END::public.payment_verification_status,
         rejection_reason = CASE p_action WHEN 'reject' THEN p_reason ELSE NULL END,
         reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = p_payment_id;

  IF p_action = 'approve' THEN
    v_new := CASE WHEN v_delivered THEN 'paid' ELSE 'payment_verified' END::public.order_status;
  ELSE
    v_new := CASE WHEN v_delivered THEN 'completed' ELSE 'payment_pending' END::public.order_status;
  END IF;

  PERFORM set_config('app.order_workflow','on',true);
  UPDATE public.orders SET status = v_new, updated_at = now() WHERE id = v_p.order_id;
  PERFORM set_config('app.order_workflow','',true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Order status could not be updated'; END IF;

  INSERT INTO public.order_events(order_id, actor_id, event, from_status, to_status, note)
  VALUES (v_p.order_id, auth.uid(), 'payment_' || p_action || 'd', 'payment_submitted', v_new::text, p_reason);

  IF p_action = 'approve' AND v_inv.id IS NOT NULL THEN
    INSERT INTO public.payments(invoice_id, client_id, amount, method, notes, recorded_by)
    VALUES (v_inv.id, v_p.client_id, v_p.amount, v_p.method, 'Verified client payment', auth.uid());
    v_paid := COALESCE(v_inv.payment_amount,0) + v_p.amount;
    UPDATE public.invoices
       SET payment_amount = v_paid,
           status = CASE WHEN v_paid >= v_inv.amount THEN 'paid'::invoice_status ELSE 'partially_paid'::invoice_status END,
           payment_date = CASE WHEN v_paid >= v_inv.amount THEN now() ELSE payment_date END
     WHERE id = v_inv.id;
    IF v_paid >= v_inv.amount THEN
      UPDATE public.payment_reminders SET status = 'completed'
       WHERE order_id = v_p.order_id AND status = 'pending';
    END IF;
  END IF;

  SELECT user_id INTO v_client_user FROM public.clients WHERE id = v_p.client_id;
  IF v_client_user IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, reference_id)
    VALUES (v_client_user, 'payment',
            CASE p_action WHEN 'approve' THEN 'Payment completed' ELSE 'Payment rejected' END,
            CASE p_action WHEN 'approve' THEN 'Order ' || v_o.order_number || ' payment verified'
                          ELSE 'Order ' || v_o.order_number || ': ' || COALESCE(p_reason,'') END,
            v_p.order_id::text);
  END IF;
  IF v_o.employee_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, reference_id)
    VALUES (v_o.employee_id, 'payment',
            CASE p_action WHEN 'approve' THEN 'Payment completed' ELSE 'Payment rejected — follow up' END,
            'Order ' || v_o.order_number, v_p.order_id::text);
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, module, status, target_type, target_id, old_value, new_value, remarks)
  VALUES (auth.uid(), 'payment.' || p_action, 'payments', 'success', 'order', v_p.order_id::text,
          jsonb_build_object('status','submitted'),
          jsonb_build_object('status', CASE p_action WHEN 'approve' THEN 'verified' ELSE 'rejected' END,
                             'amount', v_p.amount, 'method', v_p.method, 'order_status', v_new::text), p_reason);
END;$function$;