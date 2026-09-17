import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const isAdmin = async (ctx: { supabase: any; userId: string }) => {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
};

const money = z.number().nonnegative().max(100_000_000);

const componentsSchema = z.object({
  basic_pay: money.default(0),
  hra: money.default(0),
  allowances: money.default(0),
  bonus: money.default(0),
  commission: money.default(0),
  other_earnings: money.default(0),
  bsr_amount: money.default(0),
  pf: money.default(0),
  professional_tax: money.default(0),
  tds: money.default(0),
  advance_deduction: money.default(0),
  other_deductions: money.default(0),
  lic_amount: money.default(0),
  bike_deduction: money.default(0),
  mobile_recharge: money.default(0),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * The payslip captures basic pay + allowance, plus an optional admin-only
 * Best Salesman Reward. The other legacy salary columns stay in the database
 * (historical records) but are no longer captured or displayed.
 */
export const EARNING_KEYS = ["basic_pay", "allowances", "bsr_amount"] as const;

export const DEDUCTION_KEYS = ["lic_amount", "bike_deduction", "mobile_recharge"] as const;

export function computeTotals(v: Record<string, number | null | undefined>) {
  const gross = EARNING_KEYS.reduce((s, k) => s + Number(v[k] ?? 0), 0);
  const deductions = DEDUCTION_KEYS.reduce((s, k) => s + Number(v[k] ?? 0), 0);
  return { gross, deductions, net: gross - deductions };
}

/** Admin: payslips for everyone (optionally filtered by employee). */
export const listPayslips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    let q = context.supabase
      .from("payslips")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (data.employeeId) q = q.eq("employee_id", data.employeeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.employee_id)));
    const { data: profs } = ids.length
      ? await context.supabase.from("profiles").select("id, name, email, phone").in("id", ids)
      : { data: [] as any[] };
    const pMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => ({ ...r, employee: pMap.get(r.employee_id) ?? null }));
  });

/** Any signed-in employee: only their own payslips (RLS enforces this too). */
export const listMyPayslips = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payslips")
      .select("*")
      .eq("employee_id", context.userId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("id, name, email, phone")
      .eq("id", context.userId)
      .maybeSingle();
    return (data ?? []).map((r: any) => ({ ...r, employee: prof ?? null }));
  });

export const savePayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    componentsSchema
      .extend({
        id: z.string().uuid().optional(),
        employee_id: z.string().uuid(),
        period_year: z.number().int().min(2000).max(2200),
        period_month: z.number().int().min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");

    const { data: emp } = await context.supabase
      .from("employee_profiles")
      .select("id")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (!emp) throw new Error("Selected user is not an employee");

    const totals = computeTotals(data as any);
    if (totals.net < 0) throw new Error("Deductions cannot exceed total earnings");

    const row = {
      ...data,
      notes: data.notes || null,
      gross_earnings: totals.gross,
      total_deductions: totals.deductions,
      net_pay: totals.net,
      generated_by: context.userId,
      generated_at: new Date().toISOString(),
    };
    const { id, ...insertable } = row as any;

    const existingId = id ?? null;
    const { data: saved, error } = existingId
      ? await context.supabase.from("payslips").update(insertable).eq("id", existingId).select().single()
      : await context.supabase.from("payslips").insert(insertable).select().single();

    if (error) {
      if (/duplicate key|payslips_unique_period/i.test(error.message)) {
        throw new Error("A payslip already exists for this employee and period");
      }
      throw new Error(error.message);
    }

    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId,
      action: existingId ? "payslip.updated" : "payslip.generated",
      module: "payroll",
      status: "success",
      target_type: "payslip",
      target_id: saved.id,
      new_value: {
        employee_id: data.employee_id,
        period: `${data.period_year}-${String(data.period_month).padStart(2, "0")}`,
        gross_earnings: totals.gross,
        total_deductions: totals.deductions,
        net_pay: totals.net,
      },
    });

    return saved;
  });

export const deletePayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context))) throw new Error("Forbidden");
    const { data: old } = await context.supabase.from("payslips").select("*").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("payslips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      actor_id: context.userId,
      action: "payslip.deleted",
      module: "payroll",
      status: "success",
      target_type: "payslip",
      target_id: data.id,
      old_value: old ?? null,
    });
    return { ok: true };
  });
