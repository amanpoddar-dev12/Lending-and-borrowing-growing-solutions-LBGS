import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmployees, createEmployee, updateEmployee } from "@/lib/employees.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/format";
import { PhoneDisplay } from "@/components/phone-display";
import { downloadCsv, num } from "@/lib/csv";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Plus } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { EmployeePermissionsDialog, useEmployeePermissionMap } from "@/components/admin/employee-permissions-dialog";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { invalidateFor } from "@/lib/query-mutations";

export const Route = createFileRoute("/_authenticated/admin/employees")({
  head: () => ({
    meta: [
      { title: "Employees — Kredix" },
      { name: "description", content: "Manage field employees, limits, and commission." },
      { property: "og:title", content: "Employees — Kredix" },
      { property: "og:description", content: "Manage field employees, limits, and commission." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Employees,
});

function Employees() {
  const listFn = useServerFn(listEmployees);
  const createFn = useServerFn(createEmployee);
  const updateFn = useServerFn(updateEmployee);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: qk.employees, queryFn: () => listFn() });
  const permMap = useEmployeePermissionMap();
  const [open, setOpen] = useState(false);

  function exportCsv() {
    downloadCsv(
      "employees.csv",
      (data as any[]).map((e) => ({
        Name: e.profiles?.name ?? "",
        Email: e.profiles?.email ?? "",
        Phone: e.profiles?.phone ?? "",
        Territory: e.territory ?? "",
        "Max order value (INR)": num(e.max_order_value),
        "Order limit (count)": Number(e.order_limit ?? 0),
        "Base salary (INR)": num(e.base_salary),
        "Commission rate (%)": num(Number(e.commission_rate ?? 0) * 100),
        Status: e.active ? "Active" : "Inactive",
      })),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Employees</h1>
          <p className="text-sm text-muted-foreground">Field staff, order limits, and commission.</p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={exportCsv}><Download className="mr-1 size-4" />CSV</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 size-4" />Add employee</Button>
          </DialogTrigger>
          <CreateForm createFn={createFn} onDone={() => { setOpen(false); invalidateFor(qc, "employee"); }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3">Name</th>
                  <th className="py-3">Territory</th>
                  <th className="py-3">Max order</th>
                  <th className="py-3">Order limit</th>
                  <th className="py-3">Commission</th>
                  <th className="py-3">Access</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No employees yet</td></tr>}
                {data.map((e: any) => (
                  <EmployeeRow key={e.id} e={e} perms={permMap.get(e.id) ?? []} updateFn={updateFn} onSaved={() => invalidateFor(qc, "employee")} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeRow({ e, perms, updateFn, onSaved }: any) {
  const mut = useMutation({
    mutationFn: (patch: any) => updateFn({ data: { id: e.id, ...patch } }),
    onSuccess: () => { onSaved(); toast.success("Saved"); },
    onError: (err: any) => toast.error(err.message),
  });
  return (
    <tr className="border-b border-border/60">
      <td className="px-4 py-3 font-medium">{e.profiles?.name ?? "—"}
        <div className="text-xs text-muted-foreground">{e.profiles?.email}</div>
        <div className="text-xs text-muted-foreground"><PhoneDisplay phone={e.profiles?.phone} canReveal /></div>
      </td>
      <td className="py-3">{e.territory ?? "—"}</td>
      <td className="py-3">{inr(e.max_order_value)}</td>
      <td className="py-3">{e.order_limit}</td>
      <td className="py-3">{(Number(e.commission_rate) * 100).toFixed(2)}%</td>
      <td className="py-3">
        {perms.length === ALL_PERMISSIONS.length
          ? <Badge variant="secondary">Full access</Badge>
          : perms.length === 0
            ? <Badge variant="destructive">No access</Badge>
            : <Badge variant="outline">{perms.length}/{ALL_PERMISSIONS.length} permissions</Badge>}
      </td>
      <td className="py-3">{e.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</td>
      <td className="whitespace-nowrap py-3 pr-4 text-right">
        <EmployeePermissionsDialog employeeId={e.id} employeeName={e.profiles?.name ?? e.profiles?.email ?? "Employee"} current={perms} />
        <Button size="sm" variant="ghost" onClick={() => mut.mutate({ active: !e.active })}>{e.active ? "Deactivate" : "Activate"}</Button>
      </td>
    </tr>
  );
}

function CreateForm({ createFn, onDone }: any) {
  const [v, setV] = useState({
    name: "", phone: "", territory: "", max_order_value: 100000, base_salary: 0,
  });
  const phoneOk = IN_PHONE_REGEX.test(normalizeIndianPhone(v.phone));
  const mut = useMutation({
    mutationFn: () => createFn({ data: { ...v, phone: normalizeIndianPhone(v.phone), max_order_value: Number(v.max_order_value), base_salary: Number(v.base_salary) } }),
    onSuccess: () => { toast.success("Employee created"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>New employee</DialogTitle></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <F label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></F>
        <F label="Mobile number">
          <Input
            inputMode="numeric"
            placeholder="98765 43210"
            value={v.phone}
            onChange={(e) => setV({ ...v, phone: e.target.value })}
            onBlur={() => setV((s) => ({ ...s, phone: normalizeIndianPhone(s.phone) }))}
          />
        </F>
        <F label="Territory"><Input value={v.territory} onChange={(e) => setV({ ...v, territory: e.target.value })} /></F>
        <F label="Max order value (₹)"><Input type="number" value={v.max_order_value} onChange={(e) => setV({ ...v, max_order_value: e.target.value as any })} /></F>
        <F label="Base salary (₹)"><Input type="number" value={v.base_salary} onChange={(e) => setV({ ...v, base_salary: e.target.value as any })} /></F>
      </div>
      <p className="text-xs text-muted-foreground">
        The employee signs in with this mobile number and an OTP — no email or password needed.
      </p>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || v.name.trim().length < 1 || !phoneOk}>{mut.isPending ? "Creating…" : "Create"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function F({ label, children }: any) { return <div className="space-y-1"><Label>{label}</Label>{children}</div>; }
