import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmployeeActivity } from "@/lib/employees.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDateTime } from "@/lib/format";
import { formatAddress } from "@/lib/reverse-geocode";
import { MapPin, Clock } from "lucide-react";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  head: () => ({
    meta: [
      { title: "Employee activity — LBGS" },
      { name: "description", content: "Live view of every employee: duty status, latest location, orders, and tasks." },
      { property: "og:title", content: "Employee activity — LBGS" },
      { property: "og:description", content: "Live view of every employee: duty status, latest location, orders, and tasks." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Activity,
});

function Activity() {
  const fn = useServerFn(listEmployeeActivity);
  const { data = [] } = useQuery({
    queryKey: qk.employeeActivity,
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">Employee activity</h1>
        <p className="text-sm text-muted-foreground">Duty status, latest GPS, orders, and tasks — all employees.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No employees yet.</p>}
        {data.map((e: any) => {
          const online = !!e.openSession;
          const loc = e.lastLocation;
          return (
            <Card key={e.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{e.profile?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{e.profile?.email} {e.territory ? `· ${e.territory}` : ""}</div>
                  </div>
                  {online
                    ? <Badge className="bg-emerald-600">On duty</Badge>
                    : <Badge variant="secondary">Off duty</Badge>}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  {online
                    ? <>Clocked in {fmtDateTime(e.openSession.clock_in_time)}</>
                    : e.lastSession
                      ? <>Last session ended {fmtDateTime(e.lastSession.clock_out_time ?? e.lastSession.clock_in_time)}</>
                      : <>No sessions yet</>}
                </div>

                <div className="text-xs">
                  {loc ? (
                    <a
                      className="inline-flex items-start gap-1 text-primary hover:underline"
                      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                      target="_blank" rel="noreferrer"
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        {formatAddress(loc) || `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}`}
                        <span className="ml-1 text-muted-foreground">· {fmtDateTime(loc.captured_at)}</span>
                      </span>
                    </a>
                  ) : <span className="text-muted-foreground">Location permission disabled or not shared yet</span>}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-center">
                  <Stat label="Orders today" value={String(e.orders.today)} />
                  <Stat label="Orders total" value={String(e.orders.total)} />
                  <Stat label="Order value" value={inr(e.orders.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <Stat label="Tasks open" value={String(e.tasks.open)} />
                  <Stat label="Tasks done" value={String(e.tasks.done)} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
