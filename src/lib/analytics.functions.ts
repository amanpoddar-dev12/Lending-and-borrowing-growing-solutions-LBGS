import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Admin analytics — a single aggregated read for the BI dashboard.
 *
 * One server round-trip fetches the widest window needed (current period,
 * previous period and the same period last year), then every KPI, series and
 * table is derived from those rows so the browser never runs N queries.
 */

const Input = z.object({
  from: z.string(),           // ISO date (inclusive)
  to: z.string(),             // ISO date (inclusive)
  clientId: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  productCode: z.string().optional().nullable(),
});

type Row = Record<string, any>;

const startOf = (d: string) => new Date(`${d}T00:00:00.000Z`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999Z`);
const ms = (d: Date) => d.getTime();
const shiftYear = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCFullYear(x.getUTCFullYear() + n);
  return x;
};
const inRange = (v: any, a: Date, b: Date) => {
  if (!v) return false;
  const t = new Date(v).getTime();
  return t >= ms(a) && t <= ms(b);
};
const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);
const num = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
/** null = not comparable (no baseline), rather than a misleading 0%. */
const pct = (cur: number, prev: number): number | null => {
  if (!prev) return cur ? null : 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
};

const COMPLETED = new Set(["completed", "paid", "payment_verified"]);
const CANCELLED = new Set(["declined", "client_rejected"]);

export const adminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const from = startOf(data.from);
    const to = endOf(data.to);
    const span = ms(to) - ms(from);
    const prevFrom = new Date(ms(from) - span - 1);
    const prevTo = new Date(ms(from) - 1);
    const yoyFrom = shiftYear(from, -1);
    const yoyTo = shiftYear(to, -1);
    const windowFrom = new Date(Math.min(ms(prevFrom), ms(yoyFrom)));

    const orderSel =
      "id, order_number, client_id, employee_id, status, total_amount, order_date, delivery_date, created_at, updated_at, clients(business_name), profiles:employee_id(name)";

    const [ordersRes, invoicesRes, paymentsRes, clientsRes, profilesRes, tasksRes, opRes] = await Promise.all([
      supabase
        .from("orders")
        .select(orderSel)
        .gte("order_date", windowFrom.toISOString())
        .lte("order_date", to.toISOString())
        .order("order_date", { ascending: false })
        .limit(20000),
      supabase
        .from("invoices")
        .select("id, invoice_number, client_id, amount, payment_amount, penalty_amount, status, invoice_date, due_date, clients(business_name)")
        .limit(20000),
      supabase
        .from("payments")
        .select("id, client_id, amount, payment_date, method, clients(business_name)")
        .gte("payment_date", windowFrom.toISOString())
        .lte("payment_date", to.toISOString())
        .limit(20000),
      supabase.from("clients").select("id, business_name, active, created_at").limit(20000),
      supabase.from("employee_profiles").select("id, active, profiles:id(name)").limit(5000),
      supabase.from("tasks").select("id, employee_id, status, completed_date, created_at").limit(20000),
      supabase
        .from("order_payments")
        .select("id, order_id, client_id, amount, method, status, submitted_at")
        .gte("submitted_at", windowFrom.toISOString())
        .lte("submitted_at", to.toISOString())
        .limit(20000),
    ]);

    let orders: Row[] = ordersRes.data ?? [];
    if (data.clientId) orders = orders.filter((o) => o.client_id === data.clientId);
    if (data.employeeId) orders = orders.filter((o) => o.employee_id === data.employeeId);
    if (data.status) orders = orders.filter((o) => o.status === data.status);

    // Order items only for the orders in scope (product analytics + product filter).
    const currIds = orders.filter((o) => inRange(o.order_date, from, to)).map((o) => o.id);
    let items: Row[] = [];
    for (let i = 0; i < currIds.length; i += 500) {
      const { data: chunk } = await supabase
        .from("order_items")
        .select("order_id, product_name, product_code, quantity, amount")
        .in("order_id", currIds.slice(i, i + 500));
      items = items.concat(chunk ?? []);
    }
    if (data.productCode) {
      const keep = new Set(items.filter((it) => (it.product_code ?? it.product_name) === data.productCode).map((it) => it.order_id));
      orders = orders.filter((o) => !inRange(o.order_date, from, to) || keep.has(o.id));
      items = items.filter((it) => keep.has(it.order_id));
    }

    const clients: Row[] = clientsRes.data ?? [];
    const clientIds = new Set(clients.map((c) => c.id));
    const scopeClient = (row: Row) => (!data.clientId || row.client_id === data.clientId) && clientIds.has(row.client_id);

    const payments: Row[] = (paymentsRes.data ?? []).filter(scopeClient);
    const invoices: Row[] = (invoicesRes.data ?? []).filter(scopeClient);
    const orderPayments: Row[] = (opRes.data ?? []).filter(scopeClient);
    const tasks: Row[] = (tasksRes.data ?? []).filter((t) => !data.employeeId || t.employee_id === data.employeeId);
    const employees: Row[] = profilesRes.data ?? [];

    // ---------- windowed metric bundle ----------
    const bundle = (a: Date, b: Date) => {
      const os = orders.filter((o) => inRange(o.order_date, a, b));
      const ps = payments.filter((p) => inRange(p.payment_date, a, b));
      const completed = os.filter((o) => COMPLETED.has(o.status));
      const cancelled = os.filter((o) => CANCELLED.has(o.status));
      const pending = os.filter((o) => !COMPLETED.has(o.status) && !CANCELLED.has(o.status));
      const invoiced = invoices.filter((i) => inRange(i.invoice_date, a, b));
      const revenue = sum(completed.map((o) => num(o.total_amount)));
      const collected = sum(ps.map((p) => num(p.amount)));
      const gross = sum(os.map((o) => num(o.total_amount)));
      const newClients = clients.filter((c) => inRange(c.created_at, a, b)).length;
      const tasksDone = tasks.filter((t) => t.status === "completed" && inRange(t.completed_date, a, b)).length;
      const activeEmp = new Set(os.map((o) => o.employee_id).filter(Boolean)).size;
      const procTimes = completed
        .map((o) => (o.updated_at && o.order_date ? (new Date(o.updated_at).getTime() - new Date(o.order_date).getTime()) / 864e5 : null))
        .filter((x): x is number => x != null && x >= 0);
      return {
        revenue,
        grossOrderValue: gross,
        orders: os.length,
        completedOrders: completed.length,
        pendingOrders: pending.length,
        cancelledOrders: cancelled.length,
        aov: os.length ? gross / os.length : 0,
        collected,
        invoicedAmount: sum(invoiced.map((i) => num(i.amount))),
        pendingPayments: sum(orderPayments.filter((p) => inRange(p.submitted_at, a, b) && p.status === "submitted").map((p) => num(p.amount))),
        newClients,
        activeClients: new Set(os.map((o) => o.client_id)).size,
        tasksCompleted: tasksDone,
        activeEmployees: activeEmp,
        completionRate: os.length ? (completed.length / os.length) * 100 : 0,
        avgProcessingDays: procTimes.length ? sum(procTimes) / procTimes.length : null,
        revenuePerEmployee: activeEmp ? revenue / activeEmp : 0,
        collectionEfficiency: gross ? (collected / gross) * 100 : null,
      };
    };

    const current = bundle(from, to);
    const previous = bundle(prevFrom, prevTo);
    const lastYear = bundle(yoyFrom, yoyTo);

    const now = Date.now();
    const openInvoices = invoices.filter((i) => num(i.amount) > num(i.payment_amount) && i.status !== "declined");
    const outstanding = sum(openInvoices.map((i) => num(i.amount) - num(i.payment_amount)));
    const overdue = openInvoices.filter((i) => new Date(i.due_date).getTime() < now);

    const kpi = (key: string, unit: "currency" | "number" | "percent" | "days") => ({
      key,
      unit,
      value: (current as any)[key] as number | null,
      previous: (previous as any)[key] as number | null,
      lastYear: (lastYear as any)[key] as number | null,
      mom: pct(num((current as any)[key]), num((previous as any)[key])),
      yoy: pct(num((current as any)[key]), num((lastYear as any)[key])),
    });

    // ---------- time series (auto bucket) ----------
    const days = Math.max(1, Math.round(span / 864e5));
    const bucketKind: "day" | "week" | "month" = days <= 62 ? "day" : days <= 400 ? "week" : "month";
    const bucketKey = (d: string | Date) => {
      const dt = new Date(d);
      if (bucketKind === "month") return dt.toISOString().slice(0, 7);
      if (bucketKind === "week") {
        const t = new Date(dt);
        t.setUTCDate(t.getUTCDate() - t.getUTCDay());
        return t.toISOString().slice(0, 10);
      }
      return dt.toISOString().slice(0, 10);
    };
    const seriesMap = new Map<string, { bucket: string; revenue: number; orders: number; collected: number; aov: number }>();
    const touch = (k: string) => {
      let e = seriesMap.get(k);
      if (!e) { e = { bucket: k, revenue: 0, orders: 0, collected: 0, aov: 0 }; seriesMap.set(k, e); }
      return e;
    };
    orders.filter((o) => inRange(o.order_date, from, to)).forEach((o) => {
      const e = touch(bucketKey(o.order_date));
      e.orders += 1;
      if (COMPLETED.has(o.status)) e.revenue += num(o.total_amount);
    });
    payments.filter((p) => inRange(p.payment_date, from, to)).forEach((p) => {
      touch(bucketKey(p.payment_date)).collected += num(p.amount);
    });
    const series = Array.from(seriesMap.values())
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((e) => ({ ...e, aov: e.orders ? Math.round(e.revenue / e.orders) : 0 }));

    // Previous-period series aligned by index for comparison charts.
    const prevMap = new Map<string, number>();
    orders.filter((o) => inRange(o.order_date, prevFrom, prevTo) && COMPLETED.has(o.status)).forEach((o) => {
      prevMap.set(bucketKey(o.order_date), (prevMap.get(bucketKey(o.order_date)) ?? 0) + num(o.total_amount));
    });
    const prevSeries = Array.from(prevMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const comparisonSeries = series.map((s, i) => ({ bucket: s.bucket, current: s.revenue, previous: prevSeries[i] ?? 0 }));

    // ---------- breakdowns ----------
    const curOrders = orders.filter((o) => inRange(o.order_date, from, to));
    const byStatus = Object.entries(
      curOrders.reduce<Record<string, { count: number; value: number }>>((acc, o) => {
        const k = o.status as string;
        acc[k] = acc[k] ?? { count: 0, value: 0 };
        acc[k].count += 1;
        acc[k].value += num(o.total_amount);
        return acc;
      }, {}),
    ).map(([status, v]) => ({ status, ...v })).sort((a, b) => b.value - a.value);

    const clientAgg = new Map<string, { id: string; name: string; revenue: number; orders: number; outstanding: number }>();
    curOrders.forEach((o) => {
      const e = clientAgg.get(o.client_id) ?? { id: o.client_id, name: o.clients?.business_name ?? "—", revenue: 0, orders: 0, outstanding: 0 };
      e.orders += 1;
      if (COMPLETED.has(o.status)) e.revenue += num(o.total_amount);
      clientAgg.set(o.client_id, e);
    });
    openInvoices.forEach((i) => {
      const e = clientAgg.get(i.client_id) ?? { id: i.client_id, name: i.clients?.business_name ?? "—", revenue: 0, orders: 0, outstanding: 0 };
      e.outstanding += num(i.amount) - num(i.payment_amount);
      clientAgg.set(i.client_id, e);
    });
    const topClients = Array.from(clientAgg.values()).sort((a, b) => b.revenue - a.revenue);

    const empAgg = new Map<string, { id: string; name: string; revenue: number; orders: number; completed: number; tasksDone: number; tasksPending: number; avgDays: number | null }>();
    const empRow = (id: string, name: string) => {
      let e = empAgg.get(id);
      if (!e) { e = { id, name, revenue: 0, orders: 0, completed: 0, tasksDone: 0, tasksPending: 0, avgDays: null }; empAgg.set(id, e); }
      return e;
    };
    employees.forEach((e) => empRow(e.id, e.profiles?.name ?? "—"));
    const empDurations = new Map<string, number[]>();
    curOrders.forEach((o) => {
      if (!o.employee_id) return;
      const e = empRow(o.employee_id, o.profiles?.name ?? "—");
      e.orders += 1;
      if (COMPLETED.has(o.status)) {
        e.completed += 1;
        e.revenue += num(o.total_amount);
        if (o.updated_at) {
          const d = (new Date(o.updated_at).getTime() - new Date(o.order_date).getTime()) / 864e5;
          if (d >= 0) empDurations.set(o.employee_id, [...(empDurations.get(o.employee_id) ?? []), d]);
        }
      }
    });
    tasks.forEach((t) => {
      if (!t.employee_id) return;
      const e = empAgg.get(t.employee_id);
      if (!e) return;
      if (t.status === "completed" && inRange(t.completed_date, from, to)) e.tasksDone += 1;
      else if (t.status !== "completed") e.tasksPending += 1;
    });
    empDurations.forEach((v, k) => {
      const e = empAgg.get(k);
      if (e) e.avgDays = sum(v) / v.length;
    });
    const topEmployees = Array.from(empAgg.values()).sort((a, b) => b.revenue - a.revenue);

    const prodAgg = new Map<string, { code: string; name: string; qty: number; revenue: number; orders: number }>();
    const orderById = new Map(curOrders.map((o) => [o.id, o]));
    items.forEach((it) => {
      if (!orderById.has(it.order_id)) return;
      const code = (it.product_code ?? it.product_name) as string;
      const e = prodAgg.get(code) ?? { code, name: it.product_name, qty: 0, revenue: 0, orders: 0 };
      e.qty += num(it.quantity);
      e.revenue += num(it.amount);
      e.orders += 1;
      prodAgg.set(code, e);
    });
    const topProducts = Array.from(prodAgg.values()).sort((a, b) => b.revenue - a.revenue);

    const methodAgg = new Map<string, number>();
    payments.filter((p) => inRange(p.payment_date, from, to)).forEach((p) => {
      const k = (p.method ?? "unspecified") as string;
      methodAgg.set(k, (methodAgg.get(k) ?? 0) + num(p.amount));
    });
    const paymentMethods = Array.from(methodAgg.entries()).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);

    const curOP = orderPayments.filter((p) => inRange(p.submitted_at, from, to));
    const verified = curOP.filter((p) => p.status === "verified").length;
    const rejected = curOP.filter((p) => p.status === "rejected").length;
    const reviewed = verified + rejected;

    // ---------- distribution + retention ----------
    const buckets = [
      { label: "< 10k", min: 0, max: 10000 },
      { label: "10k–50k", min: 10000, max: 50000 },
      { label: "50k–1L", min: 50000, max: 100000 },
      { label: "1L–5L", min: 100000, max: 500000 },
      { label: "5L+", min: 500000, max: Infinity },
    ];
    const valueDistribution = buckets.map((b) => ({
      label: b.label,
      count: curOrders.filter((o) => num(o.total_amount) >= b.min && num(o.total_amount) < b.max).length,
    }));

    const ordersPerClient = new Map<string, number>();
    curOrders.forEach((o) => ordersPerClient.set(o.client_id, (ordersPerClient.get(o.client_id) ?? 0) + 1));
    const repeatClients = Array.from(ordersPerClient.values()).filter((n) => n > 1).length;
    const oneTimeClients = Array.from(ordersPerClient.values()).filter((n) => n === 1).length;

    const aging = { d0_30: 0, d30_60: 0, d60_plus: 0 };
    overdue.forEach((i) => {
      const d = Math.floor((now - new Date(i.due_date).getTime()) / 864e5);
      const out = num(i.amount) - num(i.payment_amount);
      if (d <= 30) aging.d0_30 += out;
      else if (d <= 60) aging.d30_60 += out;
      else aging.d60_plus += out;
    });

    return {
      range: { from: from.toISOString(), to: to.toISOString(), bucket: bucketKind },
      compare: {
        previous: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
        lastYear: { from: yoyFrom.toISOString(), to: yoyTo.toISOString() },
      },
      kpis: [
        kpi("revenue", "currency"),
        kpi("grossOrderValue", "currency"),
        kpi("orders", "number"),
        kpi("completedOrders", "number"),
        kpi("pendingOrders", "number"),
        kpi("cancelledOrders", "number"),
        kpi("aov", "currency"),
        kpi("collected", "currency"),
        kpi("pendingPayments", "currency"),
        kpi("invoicedAmount", "currency"),
        kpi("newClients", "number"),
        kpi("activeClients", "number"),
        kpi("tasksCompleted", "number"),
        kpi("activeEmployees", "number"),
        kpi("completionRate", "percent"),
        kpi("avgProcessingDays", "days"),
        kpi("revenuePerEmployee", "currency"),
        kpi("collectionEfficiency", "percent"),
      ],
      statics: {
        totalClients: clients.length,
        activeClientRecords: clients.filter((c) => c.active).length,
        inactiveClientRecords: clients.filter((c) => !c.active).length,
        totalEmployees: employees.length,
        activeEmployeeRecords: employees.filter((e) => e.active).length,
        outstanding,
        overdueAmount: sum(overdue.map((i) => num(i.amount) - num(i.payment_amount))),
        overdueCount: overdue.length,
        openInvoiceCount: openInvoices.length,
        avgRevenuePerClient: clientAgg.size ? sum(Array.from(clientAgg.values()).map((c) => c.revenue)) / clientAgg.size : 0,
        repeatClients,
        oneTimeClients,
        paymentSuccessRate: reviewed ? (verified / reviewed) * 100 : null,
        paymentsSubmitted: curOP.length,
        aging,
        /** Cost data is not captured anywhere in the schema. */
        profitAvailable: false,
      },
      series,
      comparisonSeries,
      byStatus,
      valueDistribution,
      topClients,
      topEmployees,
      topProducts,
      paymentMethods,
      recentOrders: curOrders.slice(0, 100).map((o) => ({
        id: o.id, order_number: o.order_number, client: o.clients?.business_name ?? "—",
        employee: o.profiles?.name ?? "—", status: o.status, amount: num(o.total_amount), date: o.order_date,
      })),
      recentPayments: payments
        .filter((p) => inRange(p.payment_date, from, to))
        .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
        .slice(0, 100)
        .map((p) => ({ id: p.id, client: p.clients?.business_name ?? "—", amount: num(p.amount), method: p.method ?? "—", date: p.payment_date })),
      outstandingInvoices: openInvoices
        .map((i) => ({
          id: i.id, invoice_number: i.invoice_number, client: i.clients?.business_name ?? "—",
          amount: num(i.amount) - num(i.payment_amount), due_date: i.due_date,
          days_overdue: Math.max(0, Math.floor((now - new Date(i.due_date).getTime()) / 864e5)),
        }))
        .sort((a, b) => b.days_overdue - a.days_overdue)
        .slice(0, 200),
      filterOptions: {
        clients: clients.map((c) => ({ id: c.id, name: c.business_name })).sort((a, b) => a.name.localeCompare(b.name)),
        employees: employees.map((e) => ({ id: e.id, name: e.profiles?.name ?? "—" })).sort((a, b) => a.name.localeCompare(b.name)),
        products: Array.from(prodAgg.values()).map((p) => ({ code: p.code, name: p.name })),
      },
    };
  });
