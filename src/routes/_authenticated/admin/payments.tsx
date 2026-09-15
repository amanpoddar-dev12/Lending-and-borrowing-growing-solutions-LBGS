import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPayments } from "@/lib/delivery.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderReviewPanel } from "@/components/orders/order-review-panel";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { inr, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/query-keys";

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI", bank_transfer: "Bank transfer", cash: "Cash", cheque: "Cheque", other: "Other",
};

function PaymentsPage() {
  const listFn = useServerFn(listPayments);
  const { data = [] } = useQuery({ queryKey: qk.payments, queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"submitted" | "all">("submitted");
  const [openId, setOpenId] = useState<string | null>(null);
  useRealtimeOrders();

  const rows = (data as any[]).filter((p) => {
    if (tab === "submitted" && p.status !== "submitted") return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      p.orders?.order_number?.toLowerCase().includes(s) ||
      p.clients?.business_name?.toLowerCase().includes(s) ||
      (p.reference_id ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Payment verification</h1>
          <p className="text-sm text-muted-foreground">Review client payment proofs and unlock delivery.</p>
        </div>
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button size="sm" variant={tab === "submitted" ? "default" : "outline"} onClick={() => setTab("submitted")}>
            Pending
          </Button>
          <Button size="sm" variant={tab === "all" ? "default" : "outline"} onClick={() => setTab("all")}>
            All
          </Button>
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3">Order</th>
                  <th className="py-3">Client</th>
                  <th className="py-3">Employee</th>
                  <th className="py-3">Order amount</th>
                  <th className="py-3">Paid</th>
                  <th className="py-3">Method</th>
                  <th className="py-3">Reference</th>
                  <th className="py-3">Submitted</th>
                  <th className="py-3 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No payments</td></tr>
                )}
                {rows.map((p: any) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40"
                    onClick={() => setOpenId(p.order_id)}
                  >
                    <td className="px-4 py-3 font-medium">{p.orders?.order_number ?? "—"}</td>
                    <td className="py-3">{p.clients?.business_name ?? "—"}</td>
                    <td className="py-3">{p.orders?.profiles?.name ?? "—"}</td>
                    <td className="py-3">{inr(p.orders?.total_amount ?? 0)}</td>
                    <td className="py-3 font-medium">{inr(p.amount)}</td>
                    <td className="py-3">{METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="py-3">{p.reference_id ?? "—"}</td>
                    <td className="py-3">{fmtDateTime(p.submitted_at)}</td>
                    <td className="py-3 pr-4">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        p.status === "verified" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                        p.status === "rejected" && "bg-red-500/15 text-red-600 dark:text-red-400",
                        p.status === "submitted" && "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                      )}>
                        {p.status === "submitted" ? "Under verification" : p.status === "verified" ? "Verified" : "Rejected"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards instead of a horizontally scrolling table */}
          <ul className="divide-y divide-border md:hidden">
            {rows.length === 0 && (
              <li className="px-4 py-8 text-center text-muted-foreground">No payments</li>
            )}
            {rows.map((p: any) => (
              <li key={p.id} className="p-4" onClick={() => setOpenId(p.order_id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.orders?.order_number ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.clients?.business_name ?? "—"}</div>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    p.status === "verified" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    p.status === "rejected" && "bg-red-500/15 text-red-600 dark:text-red-400",
                    p.status === "submitted" && "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                  )}>
                    {p.status === "submitted" ? "Under verification" : p.status === "verified" ? "Verified" : "Rejected"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    {METHOD_LABELS[p.method] ?? p.method}
                    {p.reference_id ? ` · ${p.reference_id}` : ""} · {fmtDateTime(p.submitted_at)}
                  </span>
                  <span className="shrink-0 font-medium text-foreground">{inr(p.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <OrderReviewPanel
        orderId={openId}
        open={!!openId}
        onOpenChange={(v) => setOpenId(v ? openId : null)}
        canReview={false}
      />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payment verification — LBGS" },
      { name: "description", content: "Review client payment proofs and unlock order delivery." },
      { property: "og:title", content: "Payment verification — LBGS" },
      { property: "og:description", content: "Review client payment proofs and unlock order delivery." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});
