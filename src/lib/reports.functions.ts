import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildReceivables, openReceivables, overdueReceivables, totalBalance } from "@/lib/receivables";

export const adminReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabase } = context;

    const [receivableOrders, orders, payments, orderPayments, clients, purse] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, client_id, status, total_amount, order_date, delivery_date, created_at, clients(business_name)")
        .limit(20000),
      supabase.from("orders").select("employee_id, total_amount, created_at, profiles:employee_id(name)"),
      supabase.from("payments").select("client_id, amount"),
      supabase.from("order_payments").select("order_id, amount, status").eq("status", "verified"),
      supabase.from("clients").select("id, active, business_name, credit_terms"),
      supabase.from("credit_purse").select("*"),
    ]);

    const termsByClient = new Map<string, number>(
      (clients.data ?? []).map((c: any) => [c.id, Number(c.credit_terms ?? 0)] as [string, number]),
    );
    const rows = buildReceivables({
      orders: (receivableOrders.data ?? []) as any,
      orderPayments: (orderPayments.data ?? []) as any,
      clientPayments: (payments.data ?? []) as any,
      termsByClient,
    });
    const open = openReceivables(rows);
    const now = Date.now();
    const overdue = overdueReceivables(rows, now);
    const outstanding = totalBalance(open);
    const totalRevenue = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
      + (orderPayments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);

    const aging = { d0_30: 0, d30_60: 0, d60_plus: 0 };
    overdue.forEach((i) => {
      if (i.days_overdue <= 30) aging.d0_30 += i.balance;
      else if (i.days_overdue <= 60) aging.d30_60 += i.balance;
      else aging.d60_plus += i.balance;
    });

    // Top clients by outstanding
    const clientMap = new Map<string, { name: string; outstanding: number; revenue: number }>();
    rows.forEach((i) => {
      const cur = clientMap.get(i.client_id) ?? { name: i.client, outstanding: 0, revenue: 0 };
      cur.outstanding += i.balance;
      cur.revenue += i.paid;
      clientMap.set(i.client_id, cur);
    });
    const topClients = Array.from(clientMap.values()).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);

    // Sales by employee
    const empMap = new Map<string, { name: string; value: number; count: number }>();
    (orders.data ?? []).forEach((o) => {
      if (!o.employee_id) return;
      const cur = empMap.get(o.employee_id) ?? { name: (o as any).profiles?.name ?? "—", value: 0, count: 0 };
      cur.value += Number(o.total_amount);
      cur.count += 1;
      empMap.set(o.employee_id, cur);
    });
    const empSales = Array.from(empMap.values()).sort((a, b) => b.value - a.value);

    // Order volume last 30 days
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 864e5);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    (orders.data ?? []).forEach((o) => {
      const k = new Date(o.created_at).toISOString().slice(0, 10);
      if (k in days) days[k] += 1;
    });
    const orderTrend = Object.entries(days).map(([date, count]) => ({ date: date.slice(5), count }));

    return {
      kpis: {
        outstanding, totalRevenue,
        openInvoices: open.length,
        overdueCount: overdue.length,
        activeClients: (clients.data ?? []).filter((c) => c.active).length,
      },
      aging, topClients, empSales, orderTrend,
      overdueList: overdue.map((i) => ({
        id: i.id, order_id: i.order_id, order_number: i.order_number, client: i.client,
        amount: i.balance,
        days_overdue: i.days_overdue,
        due_date: i.due_date,
      })).sort((a, b) => b.days_overdue - a.days_overdue),
      purses: purse.data ?? [],
    };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        /** ISO date (yyyy-mm-dd) — filtered in the database, not the browser. */
        from: z.string().optional().nullable(),
        to: z.string().optional().nullable(),
        limit: z.number().int().min(1).max(5000).default(2000),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    let query = context.supabase
      .from("audit_logs")
      .select("*, profiles:actor_id(name, email, phone)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.from) query = query.gte("created_at", new Date(data.from).toISOString());
    if (data.to) query = query.lt("created_at", new Date(new Date(data.to).getTime() + 864e5).toISOString());
    const { data: logs } = await query;


    const actorIds = Array.from(new Set((logs ?? []).map((l: any) => l.actor_id).filter(Boolean)));
    const roleMap = new Map<string, string>();
    if (actorIds.length) {
      const { data: roles } = await context.supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", actorIds as string[]);
      const rank = (x: string) => (x === "admin" ? 1 : x === "employee" ? 2 : 3);
      (roles ?? []).forEach((r: any) => {
        const cur = roleMap.get(r.user_id);
        if (!cur || rank(r.role) < rank(cur)) roleMap.set(r.user_id, r.role);
      });
    }
    return (logs ?? []).map((l: any) => ({
      ...l,
      actor_role: l.actor_id ? roleMap.get(l.actor_id) ?? null : null,
    }));
  });
