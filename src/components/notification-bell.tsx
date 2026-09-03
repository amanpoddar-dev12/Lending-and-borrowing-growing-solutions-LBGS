import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { listMyNotifications, markAllRead, markNotificationRead } from "@/lib/notifications.functions";
import { getMe } from "@/lib/me.functions";
import { useEffect, useState } from "react";
import { acquireNotificationRealtime } from "@/lib/realtime-hub";
import { fmtDateTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { notificationTarget } from "@/lib/notification-target";
import { OrderReviewPanel } from "@/components/orders/order-review-panel";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markAllRead);
  const markOneFn = useServerFn(markNotificationRead);
  const meFn = useServerFn(getMe);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: qk.me, queryFn: () => meFn() });
  const { data: items = [] } = useQuery({ queryKey: qk.notifications, queryFn: () => listFn() });
  const unread = items.filter((n: any) => !n.is_read).length;
  const role = me?.role as "admin" | "employee" | "client" | undefined;

  useEffect(() => {
    if (!me?.userId) return;
    return acquireNotificationRealtime(qc, me.userId);
  }, [me?.userId, qc]);

  const onSelect = async (n: any) => {
    const target = notificationTarget(n, role);
    setOpen(false);
    if (!n.is_read) {
      qc.setQueryData<any[]>(qk.notifications as unknown as unknown[], (rows) =>
        (rows ?? []).map((r) => (r.id === n.id ? { ...r, is_read: true } : r)));
      try {
        await markOneFn({ data: { id: n.id } });
      } finally {
        qc.invalidateQueries({ queryKey: qk.notifications });
      }
    }
    if (!target) return;
    if ("orderId" in target) setOrderId(target.orderId);
    else navigate({ to: target.route as any });
  };

  return (
    <>
      <Popover open={open} onOpenChange={async (o) => {
        setOpen(o);
        if (o && unread > 0) {
          // Optimistic: badge clears instantly, server confirms in the background.
          const prev = qc.getQueryData<any[]>(qk.notifications as unknown as unknown[]);
          qc.setQueryData<any[]>(qk.notifications as unknown as unknown[], (rows) =>
            (rows ?? []).map((n) => (n.is_read ? n : { ...n, is_read: true })));
          try {
            await markFn();
          } catch {
            if (prev) qc.setQueryData(qk.notifications as unknown as unknown[], prev);
          }
          qc.invalidateQueries({ queryKey: qk.notifications });
        }
      }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="size-5" />
            {unread > 0 && (
              <Badge className="absolute -right-1 -top-1 h-5 min-w-5 px-1 text-[10px]" variant="destructive">{unread}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border p-3 text-sm font-medium">Notifications</div>
          <div className="max-h-96 overflow-auto">
            {items.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
            )}
            {items.map((n: any) => {
              const clickable = !!notificationTarget(n, role);
              return (
                <button
                  key={n.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onSelect(n)}
                  className={cn(
                    "block w-full border-b border-border p-3 text-left last:border-0",
                    clickable ? "cursor-pointer hover:bg-muted/60" : "cursor-default",
                  )}
                >
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.message && <div className="text-xs text-muted-foreground">{n.message}</div>}
                  <div className="mt-1 text-[10px] text-muted-foreground">{fmtDateTime(n.created_at)}</div>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <OrderReviewPanel
        orderId={orderId}
        open={!!orderId}
        onOpenChange={(v) => !v && setOrderId(null)}
        canReview={role === "client"}
      />
    </>
  );
}
