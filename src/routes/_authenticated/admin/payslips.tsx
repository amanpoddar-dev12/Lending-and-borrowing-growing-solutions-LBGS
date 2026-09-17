import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listEmployees } from "@/lib/employees.functions";
import {
  listPayslips, savePayslip, deletePayslip, computeTotals, EARNING_KEYS, DEDUCTION_KEYS,
} from "@/lib/payslips.functions";
import { PayslipDocument, FIELD_LABELS, MONTHS, periodLabel } from "@/components/payslip-document";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/payslips")({
  head: () => ({
    meta: [
      { title: "Payslips — LBGS" },
      { name: "description", content: "Generate and manage employee payslips." },
      { property: "og:title", content: "Payslips — LBGS" },
      { property: "og:description", content: "Generate and manage employee payslips." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPayslips,
});

const ALL_KEYS = [...EARNING_KEYS, ...DEDUCTION_KEYS] as const;
const emptyForm = () =>
  Object.fromEntries(ALL_KEYS.map((k) => [k, ""])) as Record<(typeof ALL_KEYS)[number], string>;

function AdminPayslips() {
  const qc = useQueryClient();
  const empFn = useServerFn(listEmployees);
  const listFn = useServerFn(listPayslips);
  const saveFn = useServerFn(savePayslip);
  const delFn = useServerFn(deletePayslip);

  const { data: employees = [], isLoading: empLoading } = useQuery({ queryKey: qk.employees, queryFn: () => empFn() });
  const [employeeId, setEmployeeId] = useState<string>("");
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [form, setForm] = useState(emptyForm());
  const [notes, setNotes] = useState("");
  const [view, setView] = useState<any>(null);

  const { data: payslips = [], isLoading, isError, error } = useQuery({
    queryKey: qk.payslips(),
    queryFn: () => listFn({ data: {} }),
  });

  const numbers = useMemo(
    () => Object.fromEntries(ALL_KEYS.map((k) => [k, Number(form[k] || 0)])) as Record<string, number>,
    [form],
  );
  const totals = useMemo(() => computeTotals(numbers), [numbers]);
  const invalid = ALL_KEYS.some((k) => form[k] !== "" && !(Number(form[k]) >= 0));

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          employee_id: employeeId,
          period_year: Number(year),
          period_month: Number(month),
          ...numbers,
          notes: notes || undefined,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Payslip saved");
      setForm(emptyForm());
      setNotes("");
      qc.invalidateQueries({ queryKey: qk.payslips() });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save payslip"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Payslip deleted");
      qc.invalidateQueries({ queryKey: qk.payslips() });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete payslip"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) return toast.error("Select an employee");
    if (totals.gross <= 0) return toast.error("Enter basic pay or allowance");
    save.mutate();
  }

  function prefillFromEmployee(id: string) {
    setEmployeeId(id);
    const emp = (employees as any[]).find((e) => e.id === id);
    if (emp) setForm((f) => ({ ...f, basic_pay: String(emp.base_salary ?? "") }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Payslips</h1>
        <p className="text-sm text-muted-foreground">Generate monthly payslips for field employees.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Generate payslip</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Employee</Label>
                <Select value={employeeId} onValueChange={prefillFromEmployee}>
                  <SelectTrigger><SelectValue placeholder={empLoading ? "Loading…" : "Select employee"} /></SelectTrigger>
                  <SelectContent>
                    {(employees as any[]).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.profiles?.name ?? e.profiles?.email ?? e.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="year">Year</Label>
                <Input id="year" type="number" min={2000} max={2200} value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Earnings</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {EARNING_KEYS.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={k} className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</Label>
                    <Input id={k} type="number" min={0} step="0.01" inputMode="decimal" value={form[k]}
                      onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Deductions</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {DEDUCTION_KEYS.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label htmlFor={k} className="text-xs text-muted-foreground">{FIELD_LABELS[k]}</Label>
                    <Input id={k} type="number" min={0} step="0.01" inputMode="decimal" value={form[k]}
                      onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Note (optional)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Total pay (basic pay + allowance)</span>
              <p className="font-semibold">{inr(totals.net)}</p>
            </div>

            <Button type="submit" disabled={save.isPending || invalid || !employeeId}>
              {save.isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Saving…</> : "Generate & save payslip"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Previous payslips</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading payslips…</p> : null}
          {isError ? <p className="text-sm text-destructive">{(error as any)?.message ?? "Could not load payslips"}</p> : null}
          {!isLoading && !isError && (payslips as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payslips generated yet.</p>
          ) : null}
          {(payslips as any[]).map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.employee?.name ?? p.employee?.email ?? "Employee"}</p>
                <p className="text-xs text-muted-foreground">
                  {periodLabel(p.period_year, p.period_month)} · Total pay {inr(p.net_pay)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setView(p)}>View</Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Payslip</DialogTitle></DialogHeader>
          {view ? <PayslipDocument slip={view} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
