import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { requirePermission } from "./permission-guard";

export const FIELD_VISIT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const FIELD_VISIT_STATUSES = ["pending", "assigned", "completed", "cancelled", "overdue"] as const;

export type FieldVisitPriority = (typeof FIELD_VISIT_PRIORITIES)[number];
export type FieldVisitStatus = (typeof FIELD_VISIT_STATUSES)[number];

const isAdmin = async (ctx: { supabase: any; userId: string }) => {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
};

/**
 * Field visits visible to the caller. RLS already scopes rows (admins see all,
 * employees only their own), so this is a plain read.
 */
export const listFieldVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("field_visits")
      .select("*, clients(business_name), profiles:employee_id(name)")
      .order("visit_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Reminder/status history for one visit. */
export const listFieldVisitEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ visitId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("field_visit_events")
      .select("*, profiles:actor_id(name)")
      .eq("visit_id", data.visitId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const visitInput = z.object({
  id: z.string().uuid().nullable().optional(),
  employee_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  prospect_name: z.string().trim().max(160).optional(),
  visit_date: z.string().min(1),
  visit_time: z.string().optional(),
  location: z.string().trim().max(300).optional(),
  purpose: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(2000).optional(),
  priority: z.enum(FIELD_VISIT_PRIORITIES).default("medium"),
});

/** Admin-only create/assign or reschedule. Duplicate active visits are rejected by the database. */
export const upsertFieldVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => visitInput.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context as any))) throw new Error("Only an admin can assign field visits.");
    if (!data.client_id && !data.prospect_name?.trim()) {
      throw new Error("Select a client or enter a prospect name.");
    }
    const { id, ...values } = data;
    const { data: visitId, error } = await context.supabase.rpc("admin_upsert_field_visit", {
      p_id: (id ?? null) as unknown as string,
      p_values: values,
    });
    if (error) {
      if (error.message?.includes("uq_field_visits_active_dedupe")) {
        throw new Error("That employee already has an open visit for this client, date and purpose.");
      }
      throw new Error(error.message);
    }
    return { id: visitId as string };
  });

/** Complete / cancel (employee on own visit, or admin) and reopen (admin only). */
export const setFieldVisitStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["completed", "cancelled", "assigned"]),
        note: z.string().trim().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context as any))) {
      await requirePermission(context as any, "orders.view", "update field visits");
    }
    const { error } = await context.supabase.rpc("set_field_visit_status", {
      p_id: data.id,
      p_status: data.status,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Attaches (or clears) the optional voice note recorded by the assigned
 * employee. The database function re-checks that the caller owns the visit.
 */
export const setFieldVisitVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), path: z.string().max(300).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_field_visit_voice_note", {
      p_id: data.id,
      p_path: data.path as unknown as string,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Short-lived signed URL for playing back a visit recording. RLS on storage decides access. */
export const getFieldVisitVoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("field-visit-audio")
      .createSignedUrl(data.path, 60 * 30);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

/** Marks past-due visits overdue and notifies. Admin-triggered; also runs on a schedule. */
export const refreshOverdueFieldVisits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context as any))) throw new Error("Not permitted");
    const { data, error } = await context.supabase.rpc("mark_field_visits_overdue");
    if (error) throw new Error(error.message);
    return { flagged: Number(data ?? 0) };
  });
