import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useMemo, useState } from "react";
import { adminAnalytics } from "@/lib/analytics.functions";
import { qk } from "@/lib/query-keys";
import { inr, fmtDate } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/analytics/data-table";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Download, Info, Printer, RefreshCw, X } from "lucide-react";

const RevenueAreaChart = lazy(() => import("@/components/analytics/analytics-charts").then((m) => ({ default: m.RevenueAreaChart })));
const OrdersBarChart = lazy(() => import("@/components/analytics/analytics-charts").then((m) => ({ default: m.OrdersBarChart })));
const ComparisonChart = lazy(() => import("@/components/analytics/analytics-charts").then((m) => ({ default: m.ComparisonChart })));
const AovLineChart = lazy(() => import("@/components/analytics/analytics-charts").then((m) => ({ default: m.AovLineChart })));
const DonutChart = lazy(() => import("@/components/analytics/analytics-charts").then((m) => ({ default: m.DonutChart })));
const HorizontalBarChart = lazy(() => import("@/components/analytics/analytics-charts").then((m) => ({ default: m.HorizontalBarChart })));

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Business analytics — LBGS" },
      { name: "description", content: "Revenue, orders, payments, clients and workforce analytics with MoM and YoY comparisons." },
      { property: "og:title", content: "Business analytics — LBGS" },
      { property: "og:description", content: "Revenue, orders, payments, clients and workforce analytics with MoM and YoY comparisons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyticsPage,
  errorComponent: () => (
    <Card className="m-4">
      <CardContent className="p-6 text-sm text-muted-foreground">Analytics could not be loaded. Refresh to try again.</CardContent>
    </Card>
  ),
  notFoundComponent: () => <div className="p-6 text-sm text-muted-foreground">Not found.</div>,
});

/* ------------------------------------------------------------------ dates */

const iso = (d: Date) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

type PresetKey =
  | "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth"
  | "thisQuarter" | "lastQuarter" | "thisYear" | "lastYear" | "custom";

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7)); // Monday
  const q = Math.floor(now.getMonth() / 3);
  switch (key) {
    case "today": return { from: iso(now), to: iso(now) };
    case "yesterday": return { from: iso(addDays(now, -1)), to: iso(addDays(now, -1)) };
    case "thisWeek": return { from: iso(startOfWeek(now)), to: iso(now) };
    case "lastWeek": {
      const s = addDays(startOfWeek(now), -7);
      return { from: iso(s), to: iso(addDays(s, 6)) };
    }
    case "lastMonth": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: iso(s), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    }
    case "thisQuarter": return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: iso(now) };
    case "lastQuarter": {
      const s = new Date(now.getFullYear(), q * 3 - 3, 1);
      return { from: iso(s), to: iso(new Date(now.getFullYear(), q * 3, 0)) };
    }
    case "thisYear": return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    case "lastYear": return { from: iso(new Date(now.getFullYear() - 1, 0, 1)), to: iso(new Date(now.getFullYear() - 1, 11, 31)) };
    case "thisMonth":
    default: return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
}

const PRESETS: Array<[PresetKey, string]> = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["thisWeek", "This week"], ["lastWeek", "Last week"],
  ["thisMonth", "This month"], ["lastMonth", "Last month"], ["thisQuarter", "This quarter"], ["lastQuarter", "Last quarter"],
  ["thisYear", "This year"], ["lastYear", "Last year"], ["custom", "Custom range"],
];

/* ------------------------------------------------------------- formatting */

const NA = "—";
const compactNum = (v: number) => new Intl.NumberFormat("en-IN").format(Math.round(v));
const fmtValue = (v: number | null | undefined, unit: string) => {
  if (v == null || !Number.isFinite(Number(v))) return NA;
  if (unit === "currency") return inr(v);
  if (unit === "percent") return `${Number(v).toFixed(1)}%`;
  if (unit === "days") return `${Number(v).toFixed(1)} d`;
  return compactNum(Number(v));
};

const KPI_META: Record<string, { label: string; hint: string; invert?: boolean }> = {
  revenue: { label: "Total revenue", hint: "Value of orders that reached a completed/paid state in the period." },
  grossOrderValue: { label: "Order value booked", hint: "Total value of every order placed in the period, regardless of status." },
  orders: { label: "Total orders", hint: "Orders placed in the selected period." },
  completedOrders: { label: "Completed orders", hint: "Orders marked completed, paid or payment-verified." },
  pendingOrders: { label: "Pending orders", hint: "Orders still moving through the workflow.", invert: true },
  cancelledOrders: { label: "Cancelled / declined", hint: "Orders declined by admin or rejected by the client.", invert: true },
  aov: { label: "Average order value", hint: "Order value booked ÷ number of orders." },
  collected: { label: "Payments collected", hint: "Payments recorded against clients in the period." },
  pendingPayments: { label: "Payments awaiting review", hint: "Client-submitted payments not yet verified.", invert: true },
  billedAmount: { label: "Billed amount", hint: "Order value becoming due in the period." },
  newClients: { label: "New clients", hint: "Client accounts created in the period." },
  activeClients: { label: "Active clients", hint: "Clients that placed at least one order in the period." },
  tasksCompleted: { label: "Tasks completed", hint: "Employee tasks closed in the period." },
  activeEmployees: { label: "Employees with orders", hint: "Employees who booked at least one order." },
  completionRate: { label: "Order completion rate", hint: "Completed orders ÷ total orders." },
  avgProcessingDays: { label: "Avg processing time", hint: "Order date to last status update, for completed orders.", invert: true },
  revenuePerEmployee: { label: "Revenue per employee", hint: "Revenue ÷ employees who booked orders." },
  collectionEfficiency: { label: "Collection efficiency", hint: "Payments collected ÷ order value booked." },
};

const HEADLINE = ["revenue", "orders", "completedOrders", "pendingOrders", "cancelledOrders", "aov", "collected", "pendingPayments"];

/* ------------------------------------------------------------------- page */

function AnalyticsPage() {
  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const [custom, setCustom] = useState(presetRange("thisMonth"));
  const [compareMode, setCompareMode] = useState<"previous" | "yoy">("previous");
  const [clientId, setClientId] = useState<string>("all");
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [productCode, setProductCode] = useState<string>("all");

  const range = preset === "custom" ? custom : presetRange(preset);
  const filters = {
    from: range.from,
    to: range.to,
    clientId: clientId === "all" ? null : clientId,
    employeeId: employeeId === "all" ? null : employeeId,
    status: status === "all" ? null : status,
    productCode: productCode === "all" ? null : productCode,
  };

  const fn = useServerFn(adminAnalytics);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: qk.analytics(filters),
    queryFn: () => fn({ data: filters }),
    placeholderData: (prev) => prev,
  });

  const activeFilters = [
    clientId !== "all" && { label: "Client", clear: () => setClientId("all") },
    employeeId !== "all" && { label: "Employee", clear: () => setEmployeeId("all") },
    status !== "all" && { label: `Status: ${status.replace(/_/g, " ")}`, clear: () => setStatus("all") },
    productCode !== "all" && { label: `Product: ${productCode}`, clear: () => setProductCode("all") },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  const kpiMap = useMemo(
    () => Object.fromEntries((data?.kpis ?? []).map((k: any) => [k.key, k])) as Record<string, any>,
    [data],
  );

  const exportSummary = () => {
    if (!data) return;
    downloadCsv(`analytics-${range.from}-to-${range.to}`, data.kpis.map((k: any) => ({
      Metric: KPI_META[k.key]?.label ?? k.key,
      Value: k.value ?? "",
      "Previous period": k.previous ?? "",
      "MoM %": k.mom == null ? "" : Number(k.mom.toFixed(2)),
      "Last year": k.lastYear ?? "",
      "YoY %": k.yoy == null ? "" : Number(k.yoy.toFixed(2)),
    })));
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Business analytics</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(range.from)} – {fmtDate(range.to)}
            {data && <> · compared with {fmtDate(compareMode === "yoy" ? data.compare.lastYear.from : data.compare.previous.from)} – {fmtDate(compareMode === "yoy" ? data.compare.lastYear.to : data.compare.previous.to)}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportSummary} disabled={!data}>
            <Download className="mr-1.5 size-4" /> Export summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!data}>
            <Printer className="mr-1.5 size-4" /> Report view
          </Button>
        </div>
      </header>

      {/* Filters */}
      <Card className="print:hidden">
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Period">
            <Select value={preset} onValueChange={(v) => setPreset(v as PresetKey)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{PRESETS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {preset === "custom" ? (
            <>
              <Field label="From">
                <Input type="date" className="h-9" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </Field>
              <Field label="To">
                <Input type="date" className="h-9" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </Field>
            </>
          ) : (
            <Field label="Compare with">
              <Select value={compareMode} onValueChange={(v) => setCompareMode(v as any)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="previous">Previous period</SelectItem>
                  <SelectItem value="yoy">Same period last year</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Client">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {(data?.filterOptions.clients ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Employee">
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {(data?.filterOptions.employees ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Order status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(data?.byStatus ?? []).map((s: any) => (
                  <SelectItem key={s.status} value={s.status}>{s.status.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Product">
            <Select value={productCode} onValueChange={setProductCode}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {(data?.filterOptions.products ?? []).map((p: any) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {activeFilters.map((f) => (
            <Badge key={f.label} variant="secondary" className="gap-1">
              {f.label}
              <button onClick={f.clear} aria-label={`Clear ${f.label}`}><X className="size-3" /></button>
            </Badge>
          ))}
        </div>
      )}

      {isError && (
        <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-destructive">
          <AlertTriangle className="size-4" /> Analytics could not be loaded for this range.
        </CardContent></Card>
      )}

      {isLoading && !data ? (
        <LoadingState />
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HEADLINE.map((key) => <KpiCard key={key} kpi={kpiMap[key]} mode={compareMode} />)}
          </section>

          <Tabs defaultValue="overview">
            <TabsList className="flex-wrap print:hidden">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="workforce">Workforce</TabsTrigger>
              <TabsTrigger value="health">Business health</TabsTrigger>
            </TabsList>

            {/* -------------------------------------------------- overview */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {["completionRate", "collectionEfficiency", "avgProcessingDays", "revenuePerEmployee", "newClients", "activeClients", "billedAmount", "tasksCompleted"].map((k) => (
                  <KpiCard key={k} kpi={kpiMap[k]} mode={compareMode} compact />
                ))}
              </section>
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard className="lg:col-span-2" title="Revenue over time" description={`Bucketed by ${data.range.bucket}`} empty={data.series.length === 0}>
                  <RevenueAreaChart data={data.series} />
                </ChartCard>
                <ChartCard title="Orders by status" empty={data.byStatus.length === 0}>
                  <DonutChart data={data.byStatus} nameKey="status" valueKey="value" onSelect={(s) => s && setStatus(s)} />
                </ChartCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Current vs previous period" description="Revenue, aligned bucket by bucket" empty={data.comparisonSeries.length === 0}>
                  <ComparisonChart data={data.comparisonSeries} />
                </ChartCard>
                <ChartCard title="Top clients by revenue" empty={data.topClients.length === 0}>
                  <HorizontalBarChart data={data.topClients.slice(0, 8).map((c: any) => ({ name: c.name, revenue: c.revenue }))} nameKey="name" valueKey="revenue" />
                </ChartCard>
              </div>
              <Card>
                <CardHeader><CardTitle>Recent orders</CardTitle></CardHeader>
                <CardContent><DataTable rows={data.recentOrders} columns={orderCols} exportName="recent-orders" /></CardContent>
              </Card>
            </TabsContent>

            {/* --------------------------------------------------- revenue */}
            <TabsContent value="revenue" className="mt-4 space-y-4">
              <MoMYoYTable rows={["revenue", "grossOrderValue", "aov", "collected", "billedAmount"].map((k) => kpiMap[k])} />
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Revenue trend" empty={data.series.length === 0}><RevenueAreaChart data={data.series} /></ChartCard>
                <ChartCard title="Average order value trend" empty={data.series.length === 0}><AovLineChart data={data.series} /></ChartCard>
                <ChartCard title="Revenue by employee" empty={data.topEmployees.filter((e: any) => e.revenue > 0).length === 0}>
                  <HorizontalBarChart data={data.topEmployees.filter((e: any) => e.revenue > 0).slice(0, 8)} nameKey="name" valueKey="revenue" onSelect={(n) => {
                    const hit = data.topEmployees.find((e: any) => e.name === n);
                    if (hit) setEmployeeId(hit.id);
                  }} />
                </ChartCard>
                <ChartCard title="Revenue by product" empty={data.topProducts.length === 0}>
                  <HorizontalBarChart data={data.topProducts.slice(0, 8)} nameKey="name" valueKey="revenue" onSelect={(n) => {
                    const hit = data.topProducts.find((p: any) => p.name === n);
                    if (hit) setProductCode(hit.code);
                  }} />
                </ChartCard>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Best-performing products</CardTitle>
                  <CardDescription>Profit is not shown because cost data is not captured in the system.</CardDescription>
                </CardHeader>
                <CardContent><DataTable rows={data.topProducts} columns={productCols} exportName="top-products" /></CardContent>
              </Card>
            </TabsContent>

            {/* ---------------------------------------------------- orders */}
            <TabsContent value="orders" className="mt-4 space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {["orders", "completedOrders", "pendingOrders", "cancelledOrders", "completionRate", "avgProcessingDays"].map((k) => (
                  <KpiCard key={k} kpi={kpiMap[k]} mode={compareMode} compact />
                ))}
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Orders over time" empty={data.series.length === 0}><OrdersBarChart data={data.series} /></ChartCard>
                <ChartCard title="Order value distribution" empty={data.valueDistribution.every((b: any) => b.count === 0)}>
                  <HorizontalBarChart data={data.valueDistribution} nameKey="label" valueKey="count" currency={false} />
                </ChartCard>
              </div>
              <Card>
                <CardHeader><CardTitle>Orders in period</CardTitle><CardDescription>Click a status chip in filters to drill down.</CardDescription></CardHeader>
                <CardContent><DataTable rows={data.recentOrders} columns={orderCols} exportName="orders" pageSize={15} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Top clients by order volume</CardTitle></CardHeader>
                <CardContent>
                  <DataTable rows={[...data.topClients].sort((a: any, b: any) => b.orders - a.orders)} columns={clientCols} exportName="clients-by-volume" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* -------------------------------------------------- payments */}
            <TabsContent value="payments" className="mt-4 space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard kpi={kpiMap.collected} mode={compareMode} compact />
                <KpiCard kpi={kpiMap.pendingPayments} mode={compareMode} compact />
                <StaticCard label="Outstanding receivable" value={inr(data.statics.outstanding)} hint="Unpaid balance across every open order (not period-bound)." />
                <StaticCard label="Overdue" value={inr(data.statics.overdueAmount)} sub={`${data.statics.overdueCount} orders`} hint="Open orders past their due date." />
                <StaticCard
                  label="Payment success rate"
                  value={data.statics.paymentSuccessRate == null ? NA : `${data.statics.paymentSuccessRate.toFixed(1)}%`}
                  sub={data.statics.paymentSuccessRate == null ? "No payments reviewed" : `${data.statics.paymentsSubmitted} submitted`}
                  hint="Verified ÷ reviewed client payment submissions."
                />
                <KpiCard kpi={kpiMap.collectionEfficiency} mode={compareMode} compact />
                <KpiCard kpi={kpiMap.billedAmount} mode={compareMode} compact />
                <StaticCard label="Open dues" value={compactNum(data.statics.openInvoiceCount)} hint="Orders with a remaining balance." />
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Collections over time" empty={data.series.every((s: any) => !s.collected)}>
                  <ComparisonChart data={data.series.map((s: any) => ({ bucket: s.bucket, current: s.collected, previous: s.revenue }))} />
                </ChartCard>
                <ChartCard title="Payment methods" empty={data.paymentMethods.length === 0}>
                  <DonutChart data={data.paymentMethods} nameKey="method" valueKey="amount" />
                </ChartCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Receivables ageing" empty={data.statics.outstanding === 0}>
                  <DonutChart
                    data={[
                      { name: "0–30 d", value: data.statics.aging.d0_30 },
                      { name: "30–60 d", value: data.statics.aging.d30_60 },
                      { name: "60+ d", value: data.statics.aging.d60_plus },
                    ].filter((x) => x.value > 0)}
                    nameKey="name" valueKey="value"
                  />
                </ChartCard>
                <Card>
                  <CardHeader><CardTitle>Recent payments</CardTitle></CardHeader>
                  <CardContent><DataTable rows={data.recentPayments} columns={paymentCols} exportName="payments" /></CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Outstanding payments</CardTitle><CardDescription>Sorted by days overdue.</CardDescription></CardHeader>
                <CardContent><DataTable rows={data.outstandingInvoices} columns={outstandingCols} exportName="outstanding" pageSize={15} /></CardContent>
              </Card>
            </TabsContent>

            {/* --------------------------------------------------- clients */}
            <TabsContent value="clients" className="mt-4 space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StaticCard label="Total clients" value={compactNum(data.statics.totalClients)} />
                <StaticCard label="Active accounts" value={compactNum(data.statics.activeClientRecords)} sub={`${data.statics.inactiveClientRecords} inactive`} />
                <KpiCard kpi={kpiMap.newClients} mode={compareMode} compact />
                <KpiCard kpi={kpiMap.activeClients} mode={compareMode} compact />
                <StaticCard label="Avg revenue per client" value={inr(data.statics.avgRevenuePerClient)} hint="Revenue in period ÷ clients transacting in period." />
                <StaticCard label="Repeat clients" value={compactNum(data.statics.repeatClients)} sub={`${data.statics.oneTimeClients} one-time`} hint="Clients with more than one order in the period." />
                <StaticCard
                  label="Retention"
                  value={data.statics.repeatClients + data.statics.oneTimeClients === 0 ? NA : `${((data.statics.repeatClients / (data.statics.repeatClients + data.statics.oneTimeClients)) * 100).toFixed(1)}%`}
                  hint="Share of transacting clients that ordered more than once."
                />
                <StaticCard label="Client outstanding" value={inr(data.statics.outstanding)} />
              </section>
              <ChartCard title="Top clients by revenue" empty={data.topClients.length === 0} className="h-auto">
                <HorizontalBarChart data={data.topClients.slice(0, 10).map((c: any) => ({ name: c.name, revenue: c.revenue }))} nameKey="name" valueKey="revenue" />
              </ChartCard>
              <Card>
                <CardHeader><CardTitle>Client leaderboard</CardTitle><CardDescription>Search, sort and export the full client performance list.</CardDescription></CardHeader>
                <CardContent>
                  <DataTable rows={data.topClients} columns={clientCols} exportName="client-leaderboard" pageSize={15} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ------------------------------------------------- workforce */}
            <TabsContent value="workforce" className="mt-4 space-y-4">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StaticCard label="Total employees" value={compactNum(data.statics.totalEmployees)} sub={`${data.statics.activeEmployeeRecords} active`} />
                <KpiCard kpi={kpiMap.activeEmployees} mode={compareMode} compact />
                <KpiCard kpi={kpiMap.revenuePerEmployee} mode={compareMode} compact />
                <KpiCard kpi={kpiMap.tasksCompleted} mode={compareMode} compact />
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Orders handled per employee" empty={data.topEmployees.every((e: any) => !e.orders)}>
                  <HorizontalBarChart data={data.topEmployees.filter((e: any) => e.orders).slice(0, 8)} nameKey="name" valueKey="orders" currency={false} />
                </ChartCard>
                <ChartCard title="Revenue contribution" empty={data.topEmployees.every((e: any) => !e.revenue)}>
                  <DonutChart data={data.topEmployees.filter((e: any) => e.revenue > 0).slice(0, 6)} nameKey="name" valueKey="revenue" />
                </ChartCard>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Performance ranking</CardTitle>
                  <CardDescription>Select an employee in the filters above to scope the whole dashboard to them.</CardDescription>
                </CardHeader>
                <CardContent><DataTable rows={data.topEmployees} columns={employeeCols} exportName="employee-performance" pageSize={15} /></CardContent>
              </Card>
            </TabsContent>

            {/* ---------------------------------------------------- health */}
            <TabsContent value="health" className="mt-4 space-y-4">
              <HealthPanel data={data} kpiMap={kpiMap} mode={compareMode} />
              <Card>
                <CardHeader><CardTitle>MoM &amp; YoY snapshot</CardTitle></CardHeader>
                <CardContent>
                  <MoMYoYTable rows={["revenue", "orders", "completedOrders", "collected", "newClients", "aov", "completionRate"].map((k) => kpiMap[k])} bare />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- fragments */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Trend({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="text-xs text-muted-foreground">no baseline</span>;
  const flat = Math.abs(value) < 0.05;
  const good = invert ? value < 0 : value > 0;
  const cls = flat ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const Icon = flat ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${cls}`}>
      <Icon className="size-3.5" />{Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({ kpi, mode, compact: dense }: { kpi: any; mode: "previous" | "yoy"; compact?: boolean }) {
  if (!kpi) return null;
  const meta = KPI_META[kpi.key] ?? { label: kpi.key, hint: "" };
  const change = mode === "yoy" ? kpi.yoy : kpi.mom;
  const baseline = mode === "yoy" ? kpi.lastYear : kpi.previous;
  return (
    <Card>
      <CardContent className={dense ? "p-3" : "p-4"}>
        <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="truncate">{meta.label}</span>
          {meta.hint && <Info className="size-3 shrink-0 opacity-60" aria-label={meta.hint}><title>{meta.hint}</title></Info>}
        </div>
        <div className={`mt-1.5 font-display font-semibold tabular-nums ${dense ? "text-lg" : "text-xl sm:text-2xl"}`}>
          {fmtValue(kpi.value, kpi.unit)}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Trend value={change} invert={meta.invert} />
          <span className="truncate text-xs text-muted-foreground">
            vs {fmtValue(baseline, kpi.unit)} {mode === "yoy" ? "last year" : "prev."}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StaticCard({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground" title={hint}>
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-1.5 font-display text-lg font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title, description, children, empty, className,
}: { title: string; description?: string; children: React.ReactNode; empty?: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="h-64">
        {empty ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No data for this selection</div>
        ) : (
          <Suspense fallback={<Skeleton className="h-full w-full" />}>{children}</Suspense>
        )}
      </CardContent>
    </Card>
  );
}

function MoMYoYTable({ rows, bare }: { rows: any[]; bare?: boolean }) {
  const body = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Metric</th>
            <th className="pb-2 text-right font-medium">Current</th>
            <th className="pb-2 text-right font-medium">Previous</th>
            <th className="pb-2 text-right font-medium">MoM</th>
            <th className="pb-2 text-right font-medium">Last year</th>
            <th className="pb-2 text-right font-medium">YoY</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter(Boolean).map((k) => (
            <tr key={k.key} className="border-b border-border/60 last:border-0">
              <td className="py-2">{KPI_META[k.key]?.label ?? k.key}</td>
              <td className="py-2 text-right font-medium tabular-nums">{fmtValue(k.value, k.unit)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtValue(k.previous, k.unit)}</td>
              <td className="py-2 text-right"><Trend value={k.mom} invert={KPI_META[k.key]?.invert} /></td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtValue(k.lastYear, k.unit)}</td>
              <td className="py-2 text-right"><Trend value={k.yoy} invert={KPI_META[k.key]?.invert} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (bare) return body;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Period comparison</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function HealthPanel({ data, kpiMap, mode }: { data: any; kpiMap: Record<string, any>; mode: "previous" | "yoy" }) {
  const pick = (k: string) => (mode === "yoy" ? kpiMap[k]?.yoy : kpiMap[k]?.mom);
  const signals: Array<{ label: string; text: string; tone: "good" | "bad" | "neutral" }> = [];
  const add = (label: string, change: number | null, unit: string, invert = false) => {
    if (change == null) {
      signals.push({ label, text: "No comparable baseline in the previous period.", tone: "neutral" });
      return;
    }
    const good = invert ? change < 0 : change > 0;
    const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
    signals.push({
      label,
      text: `${dir === "flat" ? "Unchanged" : `${Math.abs(change).toFixed(1)}% ${dir}`} versus the ${mode === "yoy" ? "same period last year" : "previous period"}${unit ? ` (${unit})` : ""}.`,
      tone: dir === "flat" ? "neutral" : good ? "good" : "bad",
    });
  };
  add("Revenue", pick("revenue"), fmtValue(kpiMap.revenue?.value, "currency"));
  add("Orders", pick("orders"), fmtValue(kpiMap.orders?.value, "number"));
  add("New clients", pick("newClients"), fmtValue(kpiMap.newClients?.value, "number"));
  add("Collections", pick("collected"), fmtValue(kpiMap.collected?.value, "currency"));
  add("Cancelled orders", pick("cancelledOrders"), fmtValue(kpiMap.cancelledOrders?.value, "number"), true);
  add("Processing time", pick("avgProcessingDays"), fmtValue(kpiMap.avgProcessingDays?.value, "days"), true);

  const score = signals.filter((s) => s.tone === "good").length - signals.filter((s) => s.tone === "bad").length;
  const verdict = score >= 2 ? "Improving" : score <= -2 ? "Declining" : "Stable";
  const verdictTone = score >= 2 ? "text-emerald-600 dark:text-emerald-400" : score <= -2 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";

  const actions: string[] = [];
  if (data.statics.overdueAmount > 0)
    actions.push(`Chase ${inr(data.statics.overdueAmount)} across ${data.statics.overdueCount} overdue orders.`);
  if (kpiMap.pendingPayments?.value > 0)
    actions.push(`${inr(kpiMap.pendingPayments.value)} of client payments are waiting on verification.`);
  if (kpiMap.pendingOrders?.value > 0)
    actions.push(`${compactNum(kpiMap.pendingOrders.value)} orders are still open in the workflow.`);
  if (data.statics.paymentSuccessRate != null && data.statics.paymentSuccessRate < 80)
    actions.push(`Payment verification success is ${data.statics.paymentSuccessRate.toFixed(1)}% — review rejection reasons.`);
  if (data.statics.oneTimeClients > data.statics.repeatClients)
    actions.push(`${data.statics.oneTimeClients} clients ordered only once this period — a repeat-order push could lift revenue.`);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Business health</CardTitle>
          <CardDescription>Derived from the metrics available for the selected range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`font-display text-2xl font-semibold ${verdictTone}`}>{verdict}</div>
          <ul className="divide-y divide-border text-sm">
            {signals.map((s) => (
              <li key={s.label} className="flex items-start justify-between gap-4 py-2">
                <span className="font-medium">{s.label}</span>
                <span className={`text-right ${s.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : s.tone === "bad" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                  {s.text}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Where to act</CardTitle></CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs attention in this range.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {actions.map((a) => (
                <li key={a} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />{a}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/* ----------------------------------------------------------- table specs */

const orderCols: Column<any>[] = [
  { key: "order_number", label: "Order" },
  { key: "client", label: "Client" },
  { key: "employee", label: "Employee" },
  { key: "status", label: "Status", render: (r) => <Badge variant="secondary">{String(r.status).replace(/_/g, " ")}</Badge> },
  { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
  { key: "amount", label: "Amount", align: "right", render: (r) => inr(r.amount) },
];

const paymentCols: Column<any>[] = [
  { key: "client", label: "Client" },
  { key: "method", label: "Method" },
  { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
  { key: "amount", label: "Amount", align: "right", render: (r) => inr(r.amount) },
];

const outstandingCols: Column<any>[] = [
  { key: "order_number", label: "Order" },
  { key: "client", label: "Client" },
  { key: "due_date", label: "Due", render: (r) => fmtDate(r.due_date) },
  { key: "days_overdue", label: "Overdue", align: "right", render: (r) => (r.days_overdue > 0 ? <Badge variant="destructive">{r.days_overdue} d</Badge> : <span className="text-muted-foreground">—</span>) },
  { key: "amount", label: "Balance", align: "right", render: (r) => inr(r.amount) },
];

const clientCols: Column<any>[] = [
  { key: "name", label: "Client" },
  { key: "orders", label: "Orders", align: "right" },
  { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(r.revenue) },
  { key: "outstanding", label: "Outstanding", align: "right", render: (r) => inr(r.outstanding) },
];

const employeeCols: Column<any>[] = [
  { key: "name", label: "Employee" },
  { key: "orders", label: "Orders", align: "right" },
  { key: "completed", label: "Completed", align: "right" },
  { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(r.revenue) },
  { key: "tasksDone", label: "Tasks done", align: "right" },
  { key: "tasksPending", label: "Tasks open", align: "right" },
  { key: "avgDays", label: "Avg days", align: "right", render: (r) => (r.avgDays == null ? "—" : `${r.avgDays.toFixed(1)} d`) },
];

const productCols: Column<any>[] = [
  { key: "name", label: "Product" },
  { key: "code", label: "Code" },
  { key: "qty", label: "Qty", align: "right" },
  { key: "orders", label: "Line items", align: "right" },
  { key: "revenue", label: "Revenue", align: "right", render: (r) => inr(r.revenue) },
];
