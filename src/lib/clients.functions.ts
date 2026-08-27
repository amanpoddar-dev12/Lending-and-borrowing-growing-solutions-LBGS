import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { requirePermission } from "./permission-guard";

const isAdmin = async (ctx: { supabase: any; userId: string }) => {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
};

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("*, credit_purse(*)")
      .order("business_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Admin-only client export. Employees are blocked here as well as in the UI so
 * the export cannot be reached by calling the endpoint directly.
 */
export const exportClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Only an admin can export client data.");
    const { data, error } = await context.supabase
      .from("clients")
      .select("*, credit_purse(*)")
      .order("business_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("clients").select("*, credit_purse(*)").eq("id", data.id).maybeSingle();
    return c;
  });

export const MIN_CREDIT_LIMIT = 100000;
export const HIGH_CREDIT_THRESHOLD = 500000;
export const CREDIT_TERMS_OPTIONS = [7, 15, 30] as const;

export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const clientSchema = z.object({
  business_name: z.string().trim().min(2, "Business name is required"),
  business_type: z.string().optional().nullable(),
  contact_person: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().regex(PHONE_REGEX, "Phone must be in E.164 format, e.g. +919876543210"),
  gst_number: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => GST_REGEX.test(s), "Enter a valid 15-character GST number"),
  pan: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => PAN_REGEX.test(s), "Enter a valid PAN, e.g. ABCDE1234F"),
  address: z.string().trim().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  bank_account: z.string().optional().nullable(),
  credit_limit: z
    .number()
    .min(MIN_CREDIT_LIMIT, `Credit limit must be at least ₹${MIN_CREDIT_LIMIT.toLocaleString("en-IN")}`),
  credit_terms: z
    .number()
    .int()
    .refine((n) => (CREDIT_TERMS_OPTIONS as readonly number[]).includes(n), "Credit terms must be 7, 15 or 30 days"),
  penalty_rate_per_day: z.number().nonnegative().default(0.005),
  kyc_verified: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const upsertClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; values: unknown }) =>
    z.object({ id: z.string().uuid().optional(), values: clientSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context);
    const { data: empRole } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "employee",
    });
    if (!admin && !empRole) throw new Error("Forbidden");
    await requirePermission(context, "clients.manage", "add or edit client information");
    const values: any = { ...data.values };
    // Credit limit / terms always flow through the approval RPC so the
    // ≥₹5,00,000 rule and the history trail can never be bypassed.
    const creditLimit = Number(values.credit_limit);
    const creditTerms = Number(values.credit_terms);
    delete values.credit_limit;
    delete values.credit_terms;
    if (!admin) {
      delete values.penalty_rate_per_day;
      delete values.kyc_verified;
    }

    let clientId = data.id;
    if (clientId) {
      const { error } = await context.supabase.from("clients").update(values).eq("id", clientId);
      if (error) throw new Error(error.message);
      await context.supabase.from("audit_logs").insert({
        actor_id: context.userId, action: "client_updated", target_type: "client", target_id: clientId, new_value: values,
      });
    } else if (!admin) {
      // Employees create clients through a scoped RPC that also links the new
      // client to the creating employee.
      const { data: newId, error: rpcErr } = await context.supabase.rpc("emp_create_client", {
        p_values: values as any,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      clientId = newId as string;
    } else {
      const { data: inserted, error } = await context.supabase.from("clients").insert(values).select("id").single();
      if (error) throw new Error(error.message);
      clientId = inserted.id;
      await context.supabase.from("audit_logs").insert({
        actor_id: context.userId, action: "client_created", target_type: "client", target_id: clientId, new_value: values,
      });
    }

    const { data: credit, error: creditErr } = await context.supabase.rpc("submit_credit_limit_request", {
      p_client_id: clientId,
      p_limit: creditLimit,
      p_terms: creditTerms,
    });
    if (creditErr) throw new Error(creditErr.message);
    return { id: clientId, pendingApproval: !!(credit as any)?.pending };
  });

/** Credit limit approval history. Admins see all; employees see their clients'. */
export const listCreditRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credit_limit_requests")
      .select("*, clients(business_name, credit_limit, credit_status)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Credit purse movement history. Rows are written by the database whenever the
 * purse is recalculated (order, invoice, payment, credit-limit change), so this
 * is a read of the same source of truth the purse itself uses — never a
 * client-side recomputation. RLS scopes rows to what the caller may see.
 */
export const listCreditPurseHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id?: string } | undefined) =>
    z.object({ client_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("credit_purse_events")
      .select("*, clients(business_name)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    // actor_id has no FK to profiles, so PostgREST cannot embed it — join by hand.
    const ids = [...new Set(list.map((r: any) => r.actor_id).filter(Boolean))];
    let actors: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase.from("profiles").select("id, name, email").in("id", ids);
      actors = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
    }
    return list.map((r: any) => ({ ...r, profiles: r.actor_id ? actors[r.actor_id] ?? null : null }));
  });

export const reviewCreditRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("review_credit_limit_request", {
      p_request_id: data.id,
      p_action: data.action,
      p_reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });



export const setKycVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; verified: boolean }) =>
    z.object({ id: z.string().uuid(), verified: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { error } = await context.supabase.from("clients").update({ kyc_verified: data.verified }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId, action: "kyc_toggled", target_type: "client", target_id: data.id,
      new_value: { verified: data.verified },
    });
    return { ok: true };
  });

/** Admin-only: every client→employee assignment, for the assignment UI. */
export const listClientAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("client_employees")
      .select("client_id, employee_id, assigned_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const assignClientToEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; employee_id: string }) =>
    z.object({ client_id: z.string().uuid(), employee_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { error } = await context.supabase.from("client_employees").upsert(data).select();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId, action: "client_assigned", module: "clients", status: "success",
      target_type: "client", target_id: data.client_id, new_value: data,
    });
    return { ok: true };
  });

export const unassignClientFromEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; employee_id: string }) =>
    z.object({ client_id: z.string().uuid(), employee_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { error } = await context.supabase.from("client_employees").delete().match(data);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId, action: "client_unassigned", module: "clients", status: "success",
      target_type: "client", target_id: data.client_id, old_value: data,
    });
    return { ok: true };
  });

