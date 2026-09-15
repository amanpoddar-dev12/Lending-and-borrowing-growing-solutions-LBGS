import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { clockIn, clockOut, getMyDutyStatus } from "@/lib/duty.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { invalidateFor } from "@/lib/query-mutations";

export const Route = createFileRoute("/_authenticated/employee/duty")({
  head: () => ({
    meta: [
      { title: "Duty — LBGS" },
      { name: "description", content: "Clock in and out for the day." },
      { property: "og:title", content: "Duty — LBGS" },
      { property: "og:description", content: "Clock in and out for the day." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Duty,
});

function Duty() {
  const statusFn = useServerFn(getMyDutyStatus);
  const inFn = useServerFn(clockIn);
  const outFn = useServerFn(clockOut);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: qk.duty, queryFn: () => statusFn() });

  const inMut = useMutation({ mutationFn: () => inFn(), onSuccess: () => { invalidateFor(qc, "duty"); toast.success("Clocked in"); } });
  const outMut = useMutation({ mutationFn: () => outFn(), onSuccess: () => { invalidateFor(qc, "duty"); toast.success("Clocked out"); } });

  const isOnDuty = !!data?.open;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div><h1 className="font-display text-xl font-semibold sm:text-2xl">Duty</h1></div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="size-5" />Current status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Badge variant={isOnDuty ? "default" : "secondary"}>{isOnDuty ? "On duty" : "Off duty"}</Badge>
          {isOnDuty && data?.open && <p className="text-sm text-muted-foreground">Clocked in at {fmtDateTime(data.open.clock_in_time)}</p>}
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Duty is now automatic — you're clocked in whenever this app is open and active, and clocked out when you close or leave the tab. Use the buttons below only if you need to override.
          </p>
          <div className="flex gap-2">
            {isOnDuty
              ? <Button variant="outline" onClick={() => outMut.mutate()} disabled={outMut.isPending}>Force clock out</Button>
              : <Button variant="outline" onClick={() => inMut.mutate()} disabled={inMut.isPending}>Force clock in</Button>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent sessions</CardTitle></CardHeader>
        <CardContent>
          {(data?.recent ?? []).length === 0 && <p className="text-sm text-muted-foreground">No sessions yet</p>}
          <ul className="divide-y divide-border text-sm">
            {(data?.recent ?? []).map((s: any) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <span>{fmtDateTime(s.clock_in_time)} → {fmtDateTime(s.clock_out_time)}</span>
                <span className="font-medium">{(s.duration_minutes / 60).toFixed(1)} h</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
