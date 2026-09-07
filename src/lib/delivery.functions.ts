import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const PAYMENT_METHODS = ["upi", "bank_transfer", "cash", "cheque", "other"] as const;

/** Methods a client may pick when submitting a payment (historical records keep the full set). */
export const CLIENT_PAYMENT_METHODS = ["upi", "bank_transfer"] as const;

const submitSchema = z.object({
  order_id: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference_id: z.string().trim().max(120).optional().nullable(),
  proof_path: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

/** Client submits payment proof for an accepted order. */
export const submitPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("client_submit_payment", {
      p_order_id: data.order_id,
      p_amount: data.amount,
      p_method: data.method,
      p_reference: data.reference_id ?? undefined,
      p_proof_path: data.proof_path ?? undefined,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin approves or rejects a submitted payment. */
export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        payment_id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_review_payment", {
      p_payment_id: data.payment_id,
      p_action: data.action,
      p_reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Payments visible to the caller (RLS scopes: admin all, client own, employee assigned). */
export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("order_payments")
      .select("*, clients(business_name), orders(order_number, total_amount, status, employee_id, profiles:employee_id(name))")
      .order("submitted_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Payment attempts, due-date info and (client/admin only) the live delivery code. */
export const getOrderDeliveryState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [payments, otps, order, reminders] = await Promise.all([
      context.supabase
        .from("order_payments")
        .select("*")
        .eq("order_id", data.id)
        .order("submitted_at", { ascending: false }),
      // RLS hides these rows from employees entirely.
      context.supabase
        .from("delivery_otps")
        .select("id, code, expires_at, used_at, active, created_at")
        .eq("order_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("orders")
        .select("id, total_amount, status, order_date, delivery_date, created_at, client_id, clients(credit_terms)")
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("payment_reminders")
        .select("id, stage, status, due_date, amount_due, credit_terms, created_at")
        .eq("order_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    const otp = (otps.data ?? [])[0] ?? null;

    // Amount due is derived from the order itself: total minus verified
    // payments, due `credit_terms` days after delivery.
    const o: any = order.data ?? null;
    let due: null | {
      amount: number; paid: number; balance: number; due_date: string;
      delivered_at: string | null; credit_terms: number; overdue: boolean;
    } = null;
    if (o) {
      const terms = Number(o.clients?.credit_terms ?? 0);
      const paid = (payments.data ?? [])
        .filter((p: any) => p.status === "verified")
        .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      const amount = Number(o.total_amount ?? 0);
      const base = o.delivery_date ?? o.order_date ?? o.created_at;
      const dueDate = new Date(new Date(base).getTime() + Math.max(0, terms) * 864e5).toISOString();
      const balance = Math.max(0, amount - paid);
      due = {
        amount, paid, balance, due_date: dueDate,
        delivered_at: o.delivery_date ?? null,
        credit_terms: terms,
        overdue: balance > 0.005 && new Date(dueDate).getTime() < Date.now(),
      };
    }

    return {
      payments: payments.data ?? [],
      otp: otp && otp.active && !otp.used_at ? otp : null,
      due,
      reminders: reminders.data ?? [],
    };
  });

/** Payment follow-up reminders visible to the caller (RLS scoped). */
export const listPaymentReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payment_reminders")
      .select("*, clients(business_name), orders(order_number, status)")
      .order("due_date", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });


/**
  * Signed URL for a stored payment proof (storage RLS decides visibility).
  * `thumb: true` serves the small preview variant when one was uploaded, so
  * lists never download full-resolution photos.
  */
export const getProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string; thumb?: boolean }) =>
    z.object({ path: z.string().min(1).max(500), thumb: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const storage = context.supabase.storage.from("payment-proofs");
    const isImage = /\.(jpe?g|png|webp|gif|avif)$/i.test(data.path);
    if (data.thumb) {
      const { data: t } = await storage.createSignedUrl(`${data.path}.thumb.jpg`, 300);
      if (t?.signedUrl) return { url: t.signedUrl, isImage: true, thumb: true };
      if (!isImage) return { url: null as string | null, isImage: false, thumb: false };
    }
    const { data: signed, error } = await storage.createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string | null, isImage, thumb: false };
  });

/** Employee marks a payment-verified order out for delivery (backend also issues the OTP). */
export const markOutForDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("emp_mark_out_for_delivery", { p_order_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Employee requests a fresh delivery code (previous one is invalidated). */
export const regenerateDeliveryOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("emp_regenerate_delivery_otp", { p_order_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Employee enters the client's code; the backend validates and completes the order. */
export const verifyDeliveryOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("emp_verify_delivery_otp", {
      p_order_id: data.id,
      p_code: data.code,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
