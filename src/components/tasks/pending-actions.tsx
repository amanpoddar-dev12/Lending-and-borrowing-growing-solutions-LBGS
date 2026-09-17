import { useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "react-i18next";

const PRIORITY_STYLE: Record<string, { dot: string; ring: string }> = {
  action_required: { dot: "bg-red-500", ring: "border-red-500/40 bg-red-500/5" },
  overdue: { dot: "bg-orange-500", ring: "border-orange-500/40 bg-orange-500/5" },
  under_review: { dot: "bg-sky-500", ring: "border-sky-500/40 bg-sky-500/5" },
  pending: { dot: "bg-amber-500", ring: "border-amber-500/40 bg-amber-500/5" },
};

export function PendingActions({ initial = 4 }: { initial?: number }) {
  const { t: tr } = useTranslation();
  const fn = useServerFn(getPendingTasks);
  const meFn = useServerFn(getMe);
  useRealtimeOrders();
  const { data, isLoading } = useQuery({ queryKey: qk.pendingTasks, queryFn: () => fn() });
  const { data: me } = useQuery({ queryKey: qk.me, queryFn: () => meFn() });
  const [showAll, setShowAll] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<{ id: string; business_name: string } | null>(null);
  const [dismissed, setDismissed] = useState<DismissMap>({});

  // Dismissals are personal and stored per user on this device.
  useEffect(() => {
    if (me?.userId) setDismissed(readDismissed(me.userId));
  }, [me?.userId]);

  const allTasks: PendingTask[] = data?.tasks ?? [];
  const role = data?.role;
  const tasks = useMemo(
    () => allTasks.filter((t) => dismissed[t.id] !== t.status),
    [allTasks, dismissed],
  );
  const hiddenCount = allTasks.length - tasks.length;
  const visible = showAll ? tasks : tasks.slice(0, initial);

  const update = (next: DismissMap) => {
    setDismissed(next);
    writeDismissed(me?.userId, next);
  };

  const dismiss = (t: PendingTask) => {
    update({ ...dismissed, [t.id]: t.status });
    toast.success(tr("pending.removed"), {
      description: tr("pending.removedDesc"),
      action: {
        label: tr("pending.undo"),
        onClick: () => {
          const next = { ...dismissed };
          delete next[t.id];
          update(next);
        },
      },
    });
  };

  return (
    <>
      <Card className="border-primary/30">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {tasks.length > 0 ? tr("pending.titleCount", { count: tasks.length }) : tr("pending.title")}
          </CardTitle>
          <div className="flex items-center gap-1">
            {hiddenCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => update({})}>
                {tr("pending.restore", { count: hiddenCount })}
              </Button>
            )}
            {tasks.length > initial && (
              <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? tr("pending.showLess") : tr("pending.viewAll")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="py-4 text-sm text-muted-foreground">{tr("pending.loading")}</p>}
          {!isLoading && tasks.length === 0 && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" /> {tr("pending.allCaughtUp")}
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
                onClick={() => setAssigning({ id: t.clientId!, business_name: t.clientName ?? tr("pending.clientFallback") })}
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
                      {tr(`orderStatus.${t.status}`, { defaultValue: tr(`pending.priority.${t.status}`, { defaultValue: t.status }) })}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {[t.entity, t.amount != null ? inr(t.amount) : null, fmtDateTime(t.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  {action}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={tr("pending.removeAria", { title: t.title })}
                    title={tr("pending.remove")}
                    onClick={() => dismiss(t)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
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
