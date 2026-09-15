-- Decouple credit, delivery and payment reminders from invoices.
CREATE OR REPLACE FUNCTION public.refresh_credit_purse(_client_id uuid, _event text DEFAULT 'recalculated', _source_table text DEFAULT NULL, _source_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_limit NUMERIC; v_used NUMERIC; v_ord NUMERIC; v_paid NUMERIC; v_prev NUMERIC;
BEGIN
  SELECT credit_limit INTO v_limit FROM public.clients WHERE id = _client_id;
  IF v_limit IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(o.total_amount), 0) INTO v_ord
    FROM public.orders o
   WHERE o.client_id = _client_id
     AND o.status NOT IN ('declined', 'client_rejected');

  SELECT COALESCE((SELECT SUM(op.amount) FROM public.order_payments op
                    WHERE op.client_id = _client_id AND op.status = 'verified'), 0)
       + COALESCE((SELECT SUM(p.amount) FROM public.payments p
                    WHERE p.client_id = _client_id), 0)
    INTO v_paid;

  v_used := GREATEST(v_ord - v_paid, 0);

  SELECT used_credit INTO v_prev FROM public.credit_purse WHERE client_id = _client_id;

  INSERT INTO public.credit_purse (client_id, credit_limit, used_credit, remaining_credit, utilization_percent, last_updated)
  VALUES (_client_id, v_limit, v_used, v_limit - v_used,
          CASE WHEN v_limit > 0 THEN LEAST(100, (v_used / v_limit) * 100) ELSE 0 END, now())
  ON CONFLICT (client_id) DO UPDATE SET
    credit_limit = EXCLUDED.credit_limit,
    used_credit = EXCLUDED.used_credit,
    remaining_credit = EXCLUDED.remaining_credit,
    utilization_percent = EXCLUDED.utilization_percent,
    last_updated = now();

  IF v_prev IS DISTINCT FROM v_used OR _event <> 'recalculated' THEN
    INSERT INTO public.credit_purse_events(client_id, event, source_table, source_id, actor_id,
      credit_limit, used_before, used_after, delta, remaining_after)
    VALUES (_client_id, _event, _source_table, _source_id, auth.uid(),
      v_limit, COALESCE(v_prev,0), v_used, v_used - COALESCE(v_prev,0), v_limit - v_used);
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.refresh_credit_purse(_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  PERFORM public.refresh_credit_purse(_client_id, 'recalculated', NULL, NULL);
END; $function$;

CREATE OR REPLACE FUNCTION public.emp_verify_delivery_otp(p_order_id uuid, p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_o public.orders; v_otp public.delivery_otps; v_client_user uuid;
        v_terms int; v_due timestamptz; v_delivered timestamptz := now();
BEGIN
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR v_o.employee_id = auth.uid() OR public.is_assigned_employee(v_o.client_id)) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF v_o.status <> 'out_for_delivery' THEN RAISE EXCEPTION 'Order is not out for delivery'; END IF;

  SELECT * INTO v_otp FROM public.delivery_otps
   WHERE order_id = p_order_id AND active AND used_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_otp.id IS NULL THEN RAISE EXCEPTION 'No active delivery code. Please request a new one.'; END IF;
  IF v_otp.attempts >= 5 THEN
    INSERT INTO public.audit_logs(actor_id, action, module, status, target_type, target_id, remarks)
    VALUES (auth.uid(), 'delivery.otp_locked', 'delivery', 'failure', 'order', p_order_id::text, 'Too many failed attempts');
    RAISE EXCEPTION 'Too many failed attempts. Request a new delivery code.';
  END IF;
  IF v_otp.expires_at < now() THEN
    UPDATE public.delivery_otps SET active = false WHERE id = v_otp.id;
    RAISE EXCEPTION 'Delivery code expired. Please request a new one.';
  END IF;

  IF v_otp.code IS DISTINCT FROM regexp_replace(COALESCE(p_code,''), '\D', '', 'g') THEN
    UPDATE public.delivery_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    INSERT INTO public.order_events(order_id, actor_id, event, note)
    VALUES (p_order_id, auth.uid(), 'otp_failed', 'Incorrect delivery code');
    INSERT INTO public.audit_logs(actor_id, action, module, status, target_type, target_id, remarks)
    VALUES (auth.uid(), 'delivery.otp_failed', 'delivery', 'failure', 'order', p_order_id::text, 'Incorrect delivery code');
    RAISE EXCEPTION 'Invalid OTP. Please verify the code with the Client and try again.';
  END IF;

  UPDATE public.delivery_otps SET used_at = now(), used_by = auth.uid(), active = false WHERE id = v_otp.id;

  PERFORM set_config('app.order_workflow','on',true);
  UPDATE public.orders SET status = 'completed', delivery_date = COALESCE(delivery_date, v_delivered), updated_at = now()
   WHERE id = p_order_id;
  PERFORM set_config('app.order_workflow','',true);

  INSERT INTO public.order_events(order_id, actor_id, event, from_status, to_status, note)
  VALUES (p_order_id, auth.uid(), 'delivery_verified', 'out_for_delivery', 'completed', 'OTP verified');

  SELECT COALESCE(credit_terms, 0), user_id INTO v_terms, v_client_user FROM public.clients WHERE id = v_o.client_id;
  v_due := v_delivered + make_interval(days => COALESCE(v_terms,0));

  INSERT INTO public.payment_reminders(order_id, client_id, employee_id, amount_due, credit_terms, due_date, stage, notified_at)
  VALUES (p_order_id, v_o.client_id, v_o.employee_id, v_o.total_amount, COALESCE(v_terms,0), v_due, 'created', now())
  ON CONFLICT (order_id, stage) DO NOTHING;

  IF v_client_user IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, reference_id)
    VALUES (v_client_user, 'delivery', 'Delivered — payment due',
            'Order ' || v_o.order_number || ' delivered. ' ||
            CASE WHEN COALESCE(v_terms,0) = 0 THEN 'Payment is due now.'
                 ELSE 'Payment due by ' || to_char(v_due, 'DD Mon YYYY') || ' (' || v_terms || '-day terms).' END,
            p_order_id::text);
  END IF;
  IF v_o.employee_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, reference_id)
    VALUES (v_o.employee_id, 'payment', 'Payment follow-up',
            'Order ' || v_o.order_number || ' delivered — collect payment by ' || to_char(v_due, 'DD Mon YYYY'),
            p_order_id::text);
  END IF;
  INSERT INTO public.notifications(user_id, type, title, message, reference_id)
  SELECT ur.user_id, 'delivery', 'Order delivered', 'Order ' || v_o.order_number || ' delivery verified', p_order_id::text
    FROM public.user_roles ur WHERE ur.role = 'admin';

  INSERT INTO public.audit_logs(actor_id, action, module, status, target_type, target_id, old_value, new_value)
  VALUES (auth.uid(), 'delivery.otp_verified', 'delivery', 'success', 'order', p_order_id::text,
          jsonb_build_object('status','out_for_delivery'),
          jsonb_build_object('status','completed','due_date', v_due));
END; $function$;

CREATE OR REPLACE FUNCTION public.generate_payment_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_stage text; v_days int; v_created int := 0; v_admin uuid;
BEGIN
  FOR r IN
    SELECT o.id AS order_id, o.order_number, o.employee_id, o.client_id, o.status AS order_status,
           c.user_id AS client_user, COALESCE(c.credit_terms,0) AS credit_terms,
           (COALESCE(o.delivery_date, o.order_date) + make_interval(days => COALESCE(c.credit_terms,0))) AS due_date,
           GREATEST(o.total_amount - COALESCE((
             SELECT SUM(op.amount) FROM public.order_payments op
              WHERE op.order_id = o.id AND op.status = 'verified'), 0), 0) AS balance
      FROM public.orders o
      JOIN public.clients c ON c.id = o.client_id
     WHERE o.status IN ('completed','payment_pending','payment_submitted')
  LOOP
    IF r.balance <= 0 THEN CONTINUE; END IF;
    v_days := (r.due_date::date - CURRENT_DATE);

    IF v_days < 0 THEN v_stage := 'overdue';
    ELSIF v_days = 0 THEN v_stage := 'due_today';
    ELSIF v_days <= 3 THEN v_stage := 'due_soon';
    ELSE CONTINUE;
    END IF;

    IF r.order_status = 'payment_submitted' AND v_stage <> 'overdue' THEN CONTINUE; END IF;

    INSERT INTO public.payment_reminders(order_id, client_id, employee_id, amount_due, credit_terms, due_date, stage, notified_at)
    VALUES (r.order_id, r.client_id, r.employee_id, r.balance, r.credit_terms, r.due_date, v_stage, now())
    ON CONFLICT (order_id, stage) DO NOTHING;

    IF NOT FOUND THEN CONTINUE; END IF;
    v_created := v_created + 1;

    IF r.client_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, reference_id)
      VALUES (r.client_user, 'payment',
              CASE v_stage WHEN 'overdue' THEN 'Payment overdue'
                           WHEN 'due_today' THEN 'Payment due today'
                           ELSE 'Payment due soon' END,
              'Order ' || r.order_number || ' — ' || to_char(r.balance, 'FM999999990.00')
              || ' due ' || to_char(r.due_date, 'DD Mon YYYY'), r.order_id::text);
    END IF;

    IF r.employee_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, message, reference_id)
      VALUES (r.employee_id, 'payment',
              CASE v_stage WHEN 'overdue' THEN 'Payment overdue — follow up' ELSE 'Payment follow-up due' END,
              'Order ' || r.order_number || ' — collect payment from client', r.order_id::text);
    END IF;

    IF v_stage = 'overdue' THEN
      FOR v_admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
        INSERT INTO public.notifications(user_id, type, title, message, reference_id)
        VALUES (v_admin, 'payment', 'Payment overdue',
                'Order ' || r.order_number || ' payment is past its due date', r.order_id::text);
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_created;
END; $function$;