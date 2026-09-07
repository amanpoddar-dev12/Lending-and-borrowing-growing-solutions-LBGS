import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientLedger } from "@/lib/ledger.functions";
import { Card, CardContent } from "@/components/ui/card";
import { inr, fmtDate } from "@/lib/format";
import { downloadCsv, num, csvDate } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/client/ledger")({
  head: () => ({
    meta: [
      { title: "Ledger — Kredix" },
      { name: "description", content: "Running balance across orders and payments." },
      { property: "og:title", content: "Ledger — Kredix" },
      { property: "og:description", content: "Running balance across orders and payments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Ledger,
});

function Ledger() {
  const fn = useServerFn(getClientLedger);
  const { data } = useQuery({ queryKey: qk.ledger, queryFn: () => fn({ data: {} }) });
  const debits = (data?.receivables ?? []).map((r: any) => ({
    date: r.due_date,
    type: "Order",
    ref: r.order_number ?? "—",
    debit: Number(r.amount ?? 0),
    credit: 0,
    interest: 0,
  }));
  const pays = [
    ...(data?.payments ?? []).map((p: any) => ({
      date: p.payment_date,
      type: "Payment",
      ref: "—",
      debit: 0,
      credit: Number(p.amount ?? 0),
      interest: 0,
    })),
    ...((data as any)?.orderPayments ?? []).map((p: any) => ({
      date: p.reviewed_at ?? p.submitted_at,
      type: "Payment",
      ref: p.orders?.order_number ?? "—",
      debit: 0,
      credit: Number(p.amount ?? 0),
      interest: 0,
    })),
  ];
  const rows = [...debits, ...pays].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let bal = 0;
  const withBal = rows.map((r) => { bal += r.debit + r.interest - r.credit; return { ...r, balance: bal }; });

  function exportCsv() {
    downloadCsv(
      "ledger.csv",
      withBal.map((r) => ({
        Date: csvDate(r.date),
        Type: r.type,
        Reference: r.ref,
        "Debit (INR)": num(r.debit),
        "Credit (INR)": num(r.credit),
        "Interest (INR)": num(r.interest),
        "Balance (INR)": num(r.balance),
      })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0"><h1 className="font-display text-xl font-semibold sm:text-2xl">Ledger</h1><p className="text-sm text-muted-foreground">Running balance in chronological order.</p></div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}><Download className="mr-1 size-4" />CSV</Button>
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3">Date</th><th className="py-3">Type</th><th className="py-3">Ref</th>
                <th className="py-3 text-right">Debit</th><th className="py-3 text-right">Credit</th><th className="py-3 text-right">Interest</th><th className="py-3 pr-4 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {withBal.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No entries yet</td></tr>}
              {withBal.map((r, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-4 py-3">{fmtDate(r.date)}</td>
                  <td className="py-3">{r.type}</td>
                  <td className="py-3">{r.ref}</td>
                  <td className="py-3 text-right">{r.debit ? inr(r.debit) : "—"}</td>
                  <td className="py-3 text-right">{r.credit ? inr(r.credit) : "—"}</td>
                  <td className="py-3 text-right">{r.interest ? inr(r.interest) : "—"}</td>
                  <td className="py-3 pr-4 text-right font-medium">{inr(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  );
}
