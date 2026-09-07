import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientLedger } from "@/lib/ledger.functions";
import { listOrders } from "@/lib/orders.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr, fmtDate } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { OrderReviewPanel } from "@/components/orders/order-review-panel";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { playNotificationChime } from "@/lib/notify-sound";
import { useEffect, useRef, useState } from "react";
import { BellRing, ChevronRight } from "lucide-react";
import { PendingActions } from "@/components/tasks/pending-actions";
import { RecentActivity } from "@/components/tasks/recent-activity";
import { qk } from "@/lib/query-keys";

export function ClientOverview() {
  useRealtimeOrders();
  const ledgerFn = useServerFn(getClientLedger);
  const ordersFn = useServerFn(listOrders);
  const ledger = useQuery({ queryKey: qk.ledger, queryFn: () => ledgerFn({ data: {} }) });
  const orders = useQuery({ queryKey: qk.orders, queryFn: () => ordersFn() });

  const [reviewId, setReviewId] = useState<string | null>(null);

  const receivables: any[] = (ledger.data as any)?.receivables ?? [];
  const openDues = receivables.filter((r: any) => Number(r.balance) > 0.005);
  const outstanding = openDues.reduce((s: number, r: any) => s + Number(r.balance), 0);
  const pendingOrders = (orders.data ?? []).filter((o: any) => ["pending_client", "pending", "change_requested", "payment_pending", "payment_submitted", "out_for_delivery", "completed"].includes(o.status));

  // Orders explicitly awaiting this client's approval — surfaced as alert cards.
  const awaiting = (orders.data ?? []).filter((o: any) => o.status === "pending_client");

  // Chime once per newly arriving approval request (skip the first load).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = new Set<string>(awaiting.map((o: any) => o.id));
    if (seen.current === null) { seen.current = ids; return; }
    const isNew = [...ids].some((id) => !seen.current!.has(id));
    seen.current = ids;
    if (isNew) playNotificationChime();
  }, [orders.data, awaiting]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">Your account</h1>
        <p className="text-sm text-muted-foreground">Orders, payments, and running balance.</p>
      </div>

      {awaiting.length > 0 && (
        <div className="space-y-2">
          {awaiting.map((o: any) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setReviewId(o.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-left transition-colors animate-in fade-in slide-in-from-top-1 hover:bg-primary/10"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <BellRing className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">Order {o.order_number}</span>
                  <OrderStatusBadge status={o.status} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {o.clients?.business_name ?? "Your account"} · {inr(o.total_amount)} · {fmtDate(o.created_at)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}



      <PendingActions />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Outstanding</CardTitle></CardHeader>
          <CardContent><div className="font-display text-3xl font-semibold text-amber-600">{inr(outstanding)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Open dues</CardTitle></CardHeader>
          <CardContent><div className="font-display text-3xl font-semibold">{openDues.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Pending orders</CardTitle></CardHeader>
          <CardContent><div className="font-display text-3xl font-semibold">{pendingOrders.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Awaiting your action</CardTitle></CardHeader>
        <CardContent>
          {pendingOrders.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing to review</p>
          )}
          <ul className="divide-y divide-border">
            {pendingOrders.map((o: any) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">Order {o.order_number}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(o.created_at)} · {inr(o.total_amount)}</div>
                  <div className="mt-1"><OrderStatusBadge status={o.status} /></div>
                </div>
                {["pending_client", "payment_pending", "payment_submitted", "out_for_delivery", "completed"].includes(o.status) ? (
                  <Button size="sm" variant="outline" onClick={() => setReviewId(o.id)}>
                    {o.status === "payment_pending" || o.status === "completed" ? "Pay" : o.status === "out_for_delivery" ? "View code" : "Review"}
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline"><Link to="/client/orders">Review</Link></Button>
                )}

              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <RecentActivity />

      <OrderReviewPanel
        orderId={reviewId}
        open={!!reviewId}
        onOpenChange={(v) => !v && setReviewId(null)}
        canReview
      />

    </div>
  );
}
