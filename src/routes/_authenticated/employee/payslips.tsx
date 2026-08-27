import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyPayslips } from "@/lib/payslips.functions";
import { PayslipDocument, periodLabel } from "@/components/payslip-document";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/employee/payslips")({
  head: () => ({
    meta: [
      { title: "My payslips — Kredix" },
      { name: "description", content: "View your monthly salary payslips." },
      { property: "og:title", content: "My payslips — Kredix" },
      { property: "og:description", content: "View your monthly salary payslips." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyPayslips,
});

function MyPayslips() {
  const listFn = useServerFn(listMyPayslips);
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: qk.myPayslips, queryFn: () => listFn() });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My payslips</h1>
        <p className="text-sm text-muted-foreground">Only your own salary records are visible here.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Salary history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {isError ? <p className="text-sm text-destructive">{(error as any)?.message ?? "Could not load payslips"}</p> : null}
          {!isLoading && !isError && (data as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payslips have been issued yet.</p>
          ) : null}
          {(data as any[]).map((p) => (
            <div key={p.id} className="space-y-3">
              <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{periodLabel(p.period_year, p.period_month)}</p>
                  <p className="text-xs text-muted-foreground">Total pay {inr(p.net_pay)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                  {openId === p.id ? "Hide" : "View payslip"}
                </Button>
              </div>
              {openId === p.id ? <PayslipDocument slip={p} /> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
