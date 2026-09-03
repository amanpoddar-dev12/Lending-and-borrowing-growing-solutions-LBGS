import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ALL_PERMISSIONS } from "./permissions";
import { IN_PHONE_REGEX, IN_PHONE_MESSAGE, normalizeIndianPhone } from "./phone";

// Employees sign in with a phone OTP. Supabase still requires an email +
// password on the auth user, so we mint deterministic synthetic ones that are
// never surfaced or used for login.
function syntheticEmail(phone: string) {
  return `phone.${phone.replace(/[^0-9]/g, "")}@phone.kredix.local`;
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "P!" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa9";
}

const isAdmin = async (ctx: { supabase: any; userId: string }) => {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
};

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("employee_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((e: any) => e.id);
    const { data: profs } = ids.length
      ? await context.supabase.from("profiles").select("id, name, email, phone, avatar_url").in("id", ids)
      : { data: [] as any[] };
    const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (data ?? []).map((e: any) => ({ ...e, profiles: pMap.get(e.id) ?? null }));
  });

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1),
      phone: z
        .string()
        .trim()
        .transform(normalizeIndianPhone)
        .refine((v) => IN_PHONE_REGEX.test(v), IN_PHONE_MESSAGE),
      territory: z.string().optional(),
      max_order_value: z.number().nonnegative().default(100000),
      base_salary: z.number().nonnegative().default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingPhone } = await supabaseAdmin
      .from("profiles").select("id").eq("phone", data.phone).maybeSingle();
    if (existingPhone) throw new Error("Phone number is already in use.");
    const email = syntheticEmail(data.phone);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password: randomPassword(), email_confirm: true,
      phone: data.phone, phone_confirm: true,
      user_metadata: { name: data.name, phone: data.phone },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    await supabaseAdmin.from("profiles").upsert({ id: uid, email, name: data.name, phone: data.phone }, { onConflict: "id" });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "employee" });
    await supabaseAdmin.from("employee_profiles").insert({
      id: uid, territory: data.territory,
      max_order_value: data.max_order_value, base_salary: data.base_salary,
    });
    // New employees start with the full employee toolkit; admins can restrict
    // them afterwards from the permissions dialog.
    await supabaseAdmin.from("employee_permissions").insert(
      ALL_PERMISSIONS.map((permission) => ({ employee_id: uid, permission, granted_by: context.userId })),
    );
    return { id: uid };
  });

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      territory: z.string().optional().nullable(),
      order_limit: z.number().int().positive().optional(),
      max_order_value: z.number().nonnegative().optional(),
      base_salary: z.number().nonnegative().optional(),
      commission_rate: z.number().min(0).max(1).optional(),
      active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("employee_profiles").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEmployeePerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { data: emp } = await context.supabase.from("employee_profiles").select("*").eq("id", data.id).maybeSingle();
    const { data: prof } = await context.supabase.from("profiles").select("*").eq("id", data.id).maybeSingle();
    const empWithProfile = emp ? { ...emp, profiles: prof } : null;
    const { data: orders } = await context.supabase.from("orders").select("total_amount, status, created_at").eq("employee_id", data.id);
    const { data: tasks } = await context.supabase.from("tasks").select("status").eq("employee_id", data.id);
    const { data: duty } = await context.supabase.from("duty_sessions").select("duration_minutes").eq("employee_id", data.id).not("duration_minutes", "is", null);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthOrders = (orders ?? []).filter((o) => o.created_at >= monthStart);
    const totalValue = (orders ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
    const monthValue = monthOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const dutyMin = (duty ?? []).reduce((s, d) => s + (d.duration_minutes ?? 0), 0);

    return {
      employee: empWithProfile,
      totalOrders: orders?.length ?? 0,
      monthOrders: monthOrders.length,
      totalValue, monthValue,
      completedTasks: (tasks ?? []).filter((t) => t.status === "completed").length,
      allTasks: tasks?.length ?? 0,
      dutyHours: Math.round((dutyMin / 60) * 10) / 10,
    };
  });

export const listEmployeeActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const [{ data: emps }, { data: sessions }, { data: locs }, { data: orders }, { data: tasks }] = await Promise.all([
      context.supabase.from("employee_profiles").select("*").order("created_at", { ascending: false }),
      context.supabase.from("duty_sessions").select("id, employee_id, clock_in_time, clock_out_time, duration_minutes").order("clock_in_time", { ascending: false }).limit(500),
      context.supabase.from("employee_locations").select("*").order("captured_at", { ascending: false }).limit(500),
      context.supabase.from("orders").select("id, employee_id, total_amount, status, created_at").order("created_at", { ascending: false }).limit(1000),
      context.supabase.from("tasks").select("employee_id, status"),
    ]);
    const empIds = (emps ?? []).map((e: any) => e.id);
    const { data: profs } = empIds.length
      ? await context.supabase.from("profiles").select("id, name, email, phone, avatar_url").in("id", empIds)
      : { data: [] as any[] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

    const openByEmp = new Map<string, any>();
    const lastSessionByEmp = new Map<string, any>();
    for (const s of sessions ?? []) {
      if (!s.clock_out_time && !openByEmp.has(s.employee_id)) openByEmp.set(s.employee_id, s);
      if (!lastSessionByEmp.has(s.employee_id)) lastSessionByEmp.set(s.employee_id, s);
    }
    const lastLocByEmp = new Map<string, any>();
    for (const l of locs ?? []) if (l.employee_id && !lastLocByEmp.has(l.employee_id)) lastLocByEmp.set(l.employee_id, l);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const ordersByEmp = new Map<string, { today: number; total: number; value: number; last: any }>();
    for (const o of orders ?? []) {
      if (!o.employee_id) continue;
      const cur = ordersByEmp.get(o.employee_id) ?? { today: 0, total: 0, value: 0, last: null };
      cur.total += 1;
      cur.value += Number(o.total_amount);
      if (o.created_at >= todayIso) cur.today += 1;
      if (!cur.last) cur.last = o;
      ordersByEmp.set(o.employee_id, cur);
    }
    const tasksByEmp = new Map<string, { open: number; done: number }>();
    for (const t of tasks ?? []) {
      if (!t.employee_id) continue;
      const cur = tasksByEmp.get(t.employee_id) ?? { open: 0, done: 0 };
      if (t.status === "completed") cur.done += 1; else cur.open += 1;
      tasksByEmp.set(t.employee_id, cur);
    }

    return (emps ?? []).map((e: any) => ({
      id: e.id,
      profile: profMap.get(e.id) ?? null,
      territory: e.territory,
      active_config: e.active,
      openSession: openByEmp.get(e.id) ?? null,
      lastSession: lastSessionByEmp.get(e.id) ?? null,
      lastLocation: lastLocByEmp.get(e.id) ?? null,
      orders: ordersByEmp.get(e.id) ?? { today: 0, total: 0, value: 0, last: null },
      tasks: tasksByEmp.get(e.id) ?? { open: 0, done: 0 },
    }));
  });
