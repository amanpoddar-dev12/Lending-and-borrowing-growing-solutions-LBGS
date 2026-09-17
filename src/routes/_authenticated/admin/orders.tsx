import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOrders, updateOrderStatus } from "@/lib/orders.functions";
import { submitOrderForClient } from "@/lib/order-workflow.functions";
import { getMe } from "@/lib/me.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderReviewPanel } from "@/components/orders/order-review-panel";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { inr, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";
import { qk } from "@/lib/query-keys";
import { useVisibleRows } from "@/hooks/use-visible-rows";
import { useMemo } from "react";
import { invalidateFor, patchListRow } from "@/lib/query-mutations";
import { useTranslation } from "react-i18next";

function OrdersTable({ scope }: { scope: "admin" | "client" | "employee" }) {
  const { t } = useTranslation();
  const listFn = useServerFn(listOrders);
  const meFn = useServerFn(getMe);
  const statusFn = useServerFn(updateOrderStatus);
  const submitFn = useServerFn(submitOrderForClient);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: me } = useQuery({ queryKey: qk.me, queryFn: () => meFn() });
  const { data = [] } = useQuery({ queryKey: qk.orders, queryFn: () => listFn() });

  useRealtimeOrders();

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: any }) => statusFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.orders });
      const prev = patchListRow<any>(qc, qk.orders, v.id, { status: v.status });
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.orders as unknown as unknown[], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => toast.success(t("orders.statusUpdated")),
    onSettled: () => invalidateFor(qc, "order"),
  });
  const submit = useMutation({
    mutationFn: (id: string) => submitFn({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.orders });
      const prev = patchListRow<any>(qc, qk.orders, id, { status: "pending_client" });
      return { prev };
    },
    onError: (e: any, _id, ctx) => { if (ctx?.prev) qc.setQueryData(qk.orders as unknown as unknown[], ctx.prev); toast.error(e.message); },
    onSuccess: () => toast.success(t("orders.sentToClient")),
    onSettled: () => invalidateFor(qc, "order"),
  });

  const filtered = useMemo(() => {
    if (!q) return data;
    const s = q.toLowerCase();
    return data.filter((o: any) =>
      o.order_number.toLowerCase().includes(s) ||
      o.clients?.business_name?.toLowerCase().includes(s));
  }, [data, q]);
  const { shown, hasMore, remaining, showMore } = useVisibleRows(filtered, 100);

  const canSubmit = (o: any) =>
    (me?.role === "admin" || (me?.role === "employee" && o.employee_id === me?.userId)) &&
    ["pending", "confirmed", "change_requested", "client_rejected"].includes(o.status);

  // Shared between the desktop table and the mobile card list so both
  // surfaces stay behaviourally identical.
  const rowActions = (o: any) => (
    <>
      {me?.role === "client" && ["pending_client", "payment_pending", "completed", "out_for_delivery"].includes(o.status) && (
        <Button size="sm" onClick={() => setOpenId(o.id)}>
          {o.status === "payment_pending" || o.status === "completed" ? t("orders.pay") : o.status === "out_for_delivery" ? t("orders.viewCode") : t("orders.review")}
        </Button>
      )}
      {scope !== "client" && ["client_approved", "payment_verified", "out_for_delivery"].includes(o.status) && (
        <Button size="sm" onClick={() => setOpenId(o.id)}>
          {o.status === "out_for_delivery" ? t("orders.enterOtp") : t("orders.dispatch")}
        </Button>
      )}
      {scope !== "client" && canSubmit(o) && (
        <Button size="sm" variant="outline" disabled={submit.isPending}
          onClick={() => submit.mutate(o.id)}>{t("orders.sendForApproval")}</Button>
      )}
      {scope === "admin" && me?.role === "admin" && (
        <>
          {o.status === "pending" && (
            <Button size="sm" onClick={() => setStatus.mutate({ id: o.id, status: "confirmed" })}>{t("orders.confirm")}</Button>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">{t("orders.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {scope === "client" ? t("orders.subtitleClient") : t("orders.subtitleAll")}
          </p>
        </div>
        <Input placeholder={t("orders.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:ml-auto sm:w-56" />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3">{t("orders.colOrder")}</th>
                  <th className="py-3">{t("orders.colClient")}</th>
                  <th className="py-3">{t("orders.colEmployee")}</th>
                  <th className="py-3">{t("orders.colDate")}</th>
                  <th className="py-3">{t("orders.colAmount")}</th>
                  <th className="py-3">{t("orders.colStatus")}</th>
                  <th className="py-3 pr-4 text-right">{t("orders.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t("orders.empty")}</td></tr>}
                {shown.map((o: any) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40"
                    onClick={() => setOpenId(o.id)}
                  >
                    <td className="px-4 py-3 font-medium">{o.order_number}</td>
                    <td className="py-3">{o.clients?.business_name}</td>
                    <td className="py-3">{o.profiles?.name ?? "—"}</td>
                    <td className="py-3">{fmtDate(o.created_at)}</td>
                    <td className="py-3 font-medium">{inr(o.total_amount)}</td>
                    <td className="py-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="py-3 pr-4 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      {rowActions(o)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards instead of a horizontally scrolling table */}
          <ul className="divide-y divide-border md:hidden">
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-muted-foreground">{t("orders.empty")}</li>
            )}
            {shown.map((o: any) => (
              <li key={o.id} className="p-4" onClick={() => setOpenId(o.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{o.order_number}</div>
                    <div className="truncate text-xs text-muted-foreground">{o.clients?.business_name}</div>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{o.profiles?.name ?? "—"} · {fmtDate(o.created_at)}</span>
                  <span className="shrink-0 font-medium text-foreground">{inr(o.total_amount)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {rowActions(o)}
                </div>
              </li>
            ))}
          </ul>

          {hasMore && (
            <div className="border-t border-border p-3 text-center">
              <Button variant="outline" size="sm" onClick={showMore}>
                {t("orders.showMore", { count: remaining })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <OrderReviewPanel
        orderId={openId}
        open={!!openId}
        onOpenChange={(v) => setOpenId(v ? openId : null)}
        canReview={me?.role === "client"}
      />
    </div>
  );
}


export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: () => <Outlet />,
});

export { OrdersTable };
