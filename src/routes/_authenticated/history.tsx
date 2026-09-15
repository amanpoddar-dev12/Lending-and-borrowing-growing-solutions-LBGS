import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getActivityHistory, type ActivityItem } from "@/lib/task-center.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrderReviewPanel } from "@/components/orders/order-review-panel";
import { useRealtimeOrders } from "@/hooks/use-realtime-orders";
import { inr, fmtDateTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Activity history — LBGS" },
      { name: "description", content: "Every action you and your accounts completed, with links to the original record." },
      { property: "og:title", content: "Activity history — LBGS" },
      { property: "og:description", content: "Every action you and your accounts completed, with links to the original record." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

const PAGE = 50;

function HistoryPage() {
  const fn = useServerFn(getActivityHistory);
  useRealtimeOrders();
  const { data, isLoading } = useQuery({
    queryKey: qk.activityHistory(200),
    queryFn: () => fn({ data: { limit: 200 } }),
  });
  const [q, setQ] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);

  // Filtering runs over the whole history; recompute only when it can change.
  const items: ActivityItem[] = useMemo(() => {
    const all = data?.items ?? [];
    if (!q) return all;
    const s = q.toLowerCase();
    return all.filter((i) =>
      [i.title, i.description, i.entity, i.orderNumber, i.actor]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [data, q]);

  // Never mount hundreds of rows at once — reveal them a page at a time.
  const shown = useMemo(() => items.slice(0, visible), [items, visible]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Activity history</h1>
          <p className="text-sm text-muted-foreground">Completed actions, newest first.</p>
        </div>
        <Input
          placeholder="Search history…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setVisible(PAGE); }}
          className="w-full sm:w-64"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && items.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No activity yet</p>
          )}
          <ul className="divide-y divide-border">
            {shown.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{i.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      i.orderNumber ? `Order ${i.orderNumber}` : null,
                      i.entity,
                      i.amount != null ? inr(i.amount) : null,
                      i.actor,
                      fmtDateTime(i.at),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {i.description && <div className="mt-0.5 text-xs">{i.description}</div>}
                </div>
                {i.orderId ? (
                  <Button size="sm" variant="outline" onClick={() => setOrderId(i.orderId!)}>
                    View order
                  </Button>
                ) : i.route ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={i.route as any}>Open {i.entity}</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {shown.length < items.length && (
            <div className="border-t border-border p-3 text-center">
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE)}>
                Show more ({items.length - shown.length} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <OrderReviewPanel
        orderId={orderId}
        open={!!orderId}
        onOpenChange={(v) => !v && setOrderId(null)}
        canReview={false}
      />
    </div>
  );
}
