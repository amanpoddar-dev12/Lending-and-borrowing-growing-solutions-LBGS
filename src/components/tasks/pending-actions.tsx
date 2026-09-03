import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getPendingTasks, type PendingTask } from "@/lib/task-center.functions";
import { getMe } from "@/lib/me.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderReviewPanel } from "@/components/orders/order-review-panel";
import { AssignClientDialog } from "@/components/admin/assign-client-dialog";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { inr, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckCircle2, X } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { readDismissed, writeDismissed, type DismissMap } from "@/lib/dismissed-tasks";
import { toast } from "sonner";

const PRIORITY_STYLE: Record<string, { dot: string; ring: string; label: string }> = {
  action_required: { dot: "bg-red-500", ring: "border-red-500/40 bg-red-500/5", label: "Action required" },
  overdue: { dot: "bg-orange-500", ring: "border-orange-500/40 bg-orange-500/5", label: "Overdue" },
  under_review: { dot: "bg-sky-500", ring: "border-sky-500/40 bg-sky-500/5", label: "Under review" },
  pending: { dot: "bg-amber-500", ring: "border-amber-500/40 bg-amber-500/5", label: "Pending" },
};

export function PendingActions({ initial = 4 }: { initial?: number }) {
  const fn = useServerFn(getPendingTasks);
  useRealtimeOrders();
  const { data, isLoading } = useQuery({ queryKey: qk.pendingTasks, queryFn: () => fn() });
  const [showAll, setShowAll] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<{ id: string; business_name: string } | null>(null);

  const tasks: PendingTask[] = data?.tasks ?? [];
  const role = data?.role;
  const visible = showAll ? tasks : tasks.slice(0, initial);

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            Pending actions{tasks.length > 0 && ` (${tasks.length})`}
          </CardTitle>
          {tasks.length > initial && (
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : "View all"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="py-4 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && tasks.length === 0 && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" /> You're all caught up
            </p>
          )}
          {visible.map((t) => {
            const style = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.pending;
            const action = t.orderId ? (
              <Button size="sm" className="w-full sm:w-auto" onClick={() => setOrderId(t.orderId!)}>
                {t.actionLabel}
              </Button>
            ) : t.clientId ? (
              <Button
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setAssigning({ id: t.clientId!, business_name: t.clientName ?? "Client" })}
              >
                {t.actionLabel}
              </Button>
            ) : t.route ? (
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link to={t.route as any}>{t.actionLabel}</Link>
              </Button>
            ) : null;

            return (
              <div
                key={t.id}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-3 animate-in fade-in slide-in-from-top-1 sm:flex-row sm:items-center",
                  style.ring,
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                    <span className="text-sm font-medium">{t.title}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t.status}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {[t.entity, t.amount != null ? inr(t.amount) : null, fmtDateTime(t.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {action}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <OrderReviewPanel
        orderId={orderId}
        open={!!orderId}
        onOpenChange={(v) => !v && setOrderId(null)}
        canReview={role === "client"}
      />
      <AssignClientDialog
        client={assigning}
        open={!!assigning}
        onOpenChange={(o) => !o && setAssigning(null)}
      />
    </>
  );
}
