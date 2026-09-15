import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listClients, listCreditPurseHistory } from "@/lib/clients.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { inr, fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/query-keys";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";

export const Route = createFileRoute("/_authenticated/admin/credit")({
  head: () => ({
    meta: [
      { title: "Credit purse — LBGS" },
      { name: "description", content: "Live credit utilization across all clients." },
      { property: "og:title", content: "Credit purse — LBGS" },
      { property: "og:description", content: "Live credit utilization across all clients." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Credit,
});

/** Human labels for the database-generated purse events. */
const EVENT_LABELS: Record<string, string> = {
  "order.created": "Order created",
  "order.items_changed": "Order items updated",
  "order.pending": "Order pending",
  "order.confirmed": "Order confirmed",
  "order.declined": "Order declined",
  "order.client_approved": "Order accepted by client",
  "order.client_rejected": "Order rejected by client",
  "order.out_for_delivery": "Out for delivery",
  "order.completed": "Delivered",
  "order.invoiced": "Invoiced",
  "order.payment_submitted": "Payment submitted",
  "order.payment_verified": "Payment verified",
  "order.paid": "Payment completed",
  "order.deleted": "Order removed",
  "payments.insert": "Payment recorded",
  "payments.update": "Payment updated",
  "payments.delete": "Payment reversed",
  "order_payments.insert": "Payment submitted",
  "order_payments.update": "Payment reviewed",
  "order_payments.delete": "Payment withdrawn",
  "client.credit_limit_changed": "Credit limit changed",
  backfill_recalculation: "System recalculation",
  recalculated: "System recalculation",
};

function label(e: string) {
  return EVENT_LABELS[e] ?? e.replace(/[._]/g, " ");
}

function Credit() {
  // Same shared realtime channel the order workflow uses: purse values move the
  // moment an order/payment row changes, without a manual refresh.
  useRealtimeOrders();
  const listFn = useServerFn(listClients);
  const historyFn = useServerFn(listCreditPurseHistory);
  const [selected, setSelected] = useState<string | null>(null);

  const { data = [] } = useQuery({ queryKey: qk.clients, queryFn: () => listFn() });
  const { data: history = [] } = useQuery({
    queryKey: qk.creditPurseHistory(selected ?? undefined),
    queryFn: () => historyFn({ data: selected ? { client_id: selected } : {} }),
  });

  const rows = useMemo(
    () =>
      (data as any[]).map((c) => {
        // The embed is a one-to-one object (client_id is the purse PK); older
        // code assumed an array here, which is why every value read as zero.
        const purse = Array.isArray(c.credit_purse) ? c.credit_purse[0] : c.credit_purse;
        const limit = Number(purse?.credit_limit ?? c.credit_limit ?? 0);
        const used = Number(purse?.used_credit ?? 0);
        const available = Number(purse?.remaining_credit ?? limit - used);
        const pct = Number(purse?.utilization_percent ?? (limit > 0 ? (used / limit) * 100 : 0));
        return { id: c.id, name: c.business_name, limit, used, available, pct, updated: purse?.last_updated };
      }),
    [data],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">Credit purse</h1>
        <p className="text-sm text-muted-foreground">
          Live utilization per client — order value outstanding after payments received.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const tone = r.pct > 90 ? "destructive" : r.pct > 60 ? "default" : "secondary";
          return (
            <Card
              key={r.id}
              className={selected === r.id ? "ring-2 ring-primary" : undefined}
              onClick={() => setSelected((s) => (s === r.id ? null : r.id))}
              role="button"
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate font-medium">{r.name}</div>
                  <Badge variant={tone as any}>{r.pct.toFixed(0)}%</Badge>
                </div>
                <Progress value={Math.min(100, Math.max(0, r.pct))} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Limit</div><div className="font-medium">{inr(r.limit)}</div></div>
                  <div><div className="text-muted-foreground">Used</div><div className="font-medium">{inr(r.used)}</div></div>
                  <div>
                    <div className="text-muted-foreground">Available</div>
                    <div className={`font-medium ${r.available < 0 ? "text-destructive" : ""}`}>{inr(r.available)}</div>
                  </div>
                </div>
                {r.updated && (
                  <div className="text-[11px] text-muted-foreground">Updated {fmtDateTime(r.updated)}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No clients yet.</p>}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <h2 className="font-medium">Credit purse history</h2>
              <p className="text-sm text-muted-foreground">
                {selected ? "Movements for the selected client." : "Every movement across all clients."}
              </p>
            </div>
            {selected && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setSelected(null)}>
                Show all clients
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">By</th>
                  <th className="py-2 pr-3 text-right">Change</th>
                  <th className="py-2 text-right">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {(history as any[]).length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No movements recorded yet</td></tr>
                )}
                {(history as any[]).map((h) => (
                  <tr key={h.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDateTime(h.created_at)}</td>
                    <td className="py-2 pr-3">{h.clients?.business_name ?? "—"}</td>
                    <td className="py-2 pr-3">{label(h.event)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {h.source_table ? `${h.source_table}${h.source_id ? ` · ${String(h.source_id).slice(0, 8)}` : ""}` : "—"}
                    </td>
                    <td className="py-2 pr-3">{h.profiles?.name ?? h.profiles?.email ?? "System"}</td>
                    <td className={`py-2 pr-3 text-right font-medium ${Number(h.delta) > 0 ? "text-destructive" : Number(h.delta) < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                      {Number(h.delta) > 0 ? "+" : ""}{inr(Number(h.delta))}
                    </td>
                    <td className="py-2 text-right">{inr(Number(h.remaining_after))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
