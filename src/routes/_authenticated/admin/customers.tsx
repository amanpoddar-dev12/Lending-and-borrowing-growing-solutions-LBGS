import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listClients,
  upsertClient,
  setKycVerified,
  exportClients,
  listCreditRequests,
  reviewCreditRequest,
  MIN_CREDIT_LIMIT,
  HIGH_CREDIT_THRESHOLD,
  CREDIT_TERMS_OPTIONS,
  GST_REGEX,
  PAN_REGEX,
  PHONE_REGEX,
} from "@/lib/clients.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GeoAddressButton } from "@/components/clients/geo-address-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { inr } from "@/lib/format";
import { PhoneDisplay } from "@/components/phone-display";
import { downloadCsv, num, csvDate } from "@/lib/csv";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Plus, ShieldCheck, ShieldX, Users } from "lucide-react";
import { AssignClientDialog } from "@/components/admin/assign-client-dialog";
import { qk } from "@/lib/query-keys";
import { useVisibleRows } from "@/hooks/use-visible-rows";
import { invalidateFor } from "@/lib/query-mutations";


export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Kredix" },
      { name: "description", content: "Manage clients, KYC, credit limits, and credit terms." },
      { property: "og:title", content: "Customers — Kredix" },
      { property: "og:description", content: "Manage clients, KYC, credit limits, and credit terms." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Customers,
});

function Customers() {
  const listFn = useServerFn(listClients);
  const upFn = useServerFn(upsertClient);
  const kycFn = useServerFn(setKycVerified);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: qk.clients, queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [q, setQ] = useState("");
  const [assigning, setAssigning] = useState<any>(null);


  const kyc = useMutation({
    mutationFn: (v: { id: string; verified: boolean }) => kycFn({ data: v }),
    onSuccess: () => { invalidateFor(qc, "client"); toast.success("KYC updated"); },
  });

  const filtered = useMemo(
    () => (!q ? data : data.filter((c: any) => c.business_name.toLowerCase().includes(q.toLowerCase()))),
    [data, q],
  );
  const { shown, hasMore, remaining, showMore } = useVisibleRows(filtered, 100);

  const exportFn = useServerFn(exportClients);
  const [exporting, setExporting] = useState(false);

  /** Export runs through an admin-only endpoint, so it cannot be reached by employees. */
  async function exportCsv() {
    setExporting(true);
    try {
      const rows = (await exportFn()) as any[];
      const q2 = q.toLowerCase();
      const source = q2 ? rows.filter((c: any) => c.business_name.toLowerCase().includes(q2)) : rows;
      await downloadCsv(
      "customers.csv",
      source.map((c: any) => {
        const purse = Array.isArray(c.credit_purse) ? c.credit_purse[0] : c.credit_purse;
        return {
          "Business name": c.business_name,
          "Contact person": c.contact_person ?? "",
          Phone: c.phone ?? "",
          Email: c.email ?? "",
          GST: c.gst_number ?? "",
          PAN: c.pan ?? "",
          Address: c.address ?? "",
          "Credit limit (INR)": num(c.credit_limit),
          "Credit terms (days)": Number(c.credit_terms ?? 0),
          "Interest rate per day (%)": num(Number(c.penalty_rate_per_day ?? 0) * 100, 3),
          "Used credit (INR)": num(purse?.used_credit),
          "Remaining credit (INR)": num(purse?.remaining_credit),
          "Utilization (%)": num(purse?.utilization_percent),
          KYC: c.kyc_verified ? "Verified" : "Pending",
          Status: c.active ? "Active" : "Inactive",
          "Created on": csvDate(c.created_at),
        };
      }),
      );
      toast.success("Client export downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export clients");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage clients, KYC, and credit terms.</p>
        </div>
        <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56" />
          <Button variant="outline" onClick={exportCsv} disabled={exporting}><Download className="mr-1 size-4" />{exporting ? "Exporting…" : "CSV"}</Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}><Plus className="mr-1 size-4" />New client</Button>
            </DialogTrigger>
            <ClientForm editing={editing} onDone={() => { setOpen(false); setEditing(null); invalidateFor(qc, "client"); }} upsert={upFn} />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3">Business</th>
                  <th className="py-3">Contact</th>
                  <th className="py-3">Credit limit</th>
                  <th className="py-3">Terms</th>
                  <th className="py-3">KYC</th>
                  <th className="py-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No clients yet</td></tr>
                )}
                {shown.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{c.business_name}
                      {!c.active && <Badge variant="secondary" className="ml-2">inactive</Badge>}
                      {c.credit_status === "pending_approval" && (
                        <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                          Credit {inr(c.pending_credit_limit)} pending
                        </Badge>
                      )}
                    </td>
                    <td className="py-3">{c.contact_person ?? "—"}<div className="text-xs text-muted-foreground"><PhoneDisplay phone={c.phone} canReveal /></div></td>
                    <td className="py-3">{inr(c.credit_limit)}</td>
                    <td className="py-3">{c.credit_terms}d</td>
                    <td className="py-3">
                      {c.kyc_verified ? <Badge className="bg-emerald-600">Verified</Badge> : <Badge variant="outline">Pending</Badge>}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-right">
                      <Button size="sm" variant="ghost" onClick={() => kyc.mutate({ id: c.id, verified: !c.kyc_verified })}>
                        {c.kyc_verified ? <ShieldX className="size-4" /> : <ShieldCheck className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" title="Assign employees" onClick={() => setAssigning(c)}>
                        <Users className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards instead of a horizontally scrolling table */}
          <ul className="divide-y divide-border md:hidden">
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-muted-foreground">No clients yet</li>
            )}
            {shown.map((c: any) => (
              <li key={c.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.business_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.contact_person ?? "—"}</div>
                  </div>
                  {c.kyc_verified ? <Badge className="bg-emerald-600">Verified</Badge> : <Badge variant="outline">Pending</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  <PhoneDisplay phone={c.phone} canReveal />
                </div>
                <div className="text-xs">
                  Credit limit <span className="font-medium text-foreground">{inr(c.credit_limit)}</span> · Terms {c.credit_terms}d
                  {!c.active && <Badge variant="secondary" className="ml-2">inactive</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => kyc.mutate({ id: c.id, verified: !c.kyc_verified })}>
                    {c.kyc_verified ? <ShieldX className="mr-1 size-4" /> : <ShieldCheck className="mr-1 size-4" />}
                    {c.kyc_verified ? "Unverify" : "Verify KYC"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAssigning(c)}>
                    <Users className="mr-1 size-4" /> Assign
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(c); setOpen(true); }}>Edit</Button>
                </div>
              </li>
            ))}
          </ul>

          <div>
            {hasMore && (
              <div className="border-t border-border p-3 text-center">
                <Button variant="outline" size="sm" onClick={showMore}>
                  Show more ({remaining} remaining)
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <CreditApprovals />
      <AssignClientDialog client={assigning} open={!!assigning} onOpenChange={(o) => !o && setAssigning(null)} />


    </div>
  );
}

function ClientForm({ editing, onDone, upsert }: { editing: any; onDone: () => void; upsert: any }) {
  const [v, setV] = useState(() => ({
    business_name: editing?.business_name ?? "",
    contact_person: editing?.contact_person ?? "",
    email: editing?.email ?? "",
    phone: editing?.phone ?? "",
    gst_number: editing?.gst_number ?? "",
    pan: editing?.pan ?? "",
    address: editing?.address ?? "",
    latitude: editing?.latitude ?? null,
    longitude: editing?.longitude ?? null,
    credit_limit: editing?.credit_limit ? String(editing.credit_limit) : String(MIN_CREDIT_LIMIT),
    credit_terms: String(
      CREDIT_TERMS_OPTIONS.includes(Number(editing?.credit_terms) as any) ? editing.credit_terms : 30,
    ),
    penalty_rate_per_day: editing?.penalty_rate_per_day ?? 0.005,
    active: editing?.active ?? true,
    kyc_verified: editing?.kyc_verified ?? false,
  }));

  const limit = Number(v.credit_limit);
  const errors: string[] = [];
  if (v.business_name.trim().length < 2) errors.push("Business name is required");
  if (!PHONE_REGEX.test(v.phone.trim())) errors.push("Phone must be in E.164 format, e.g. +919876543210");
  if (!GST_REGEX.test(v.gst_number.trim().toUpperCase())) errors.push("Enter a valid 15-character GST number");
  if (!PAN_REGEX.test(v.pan.trim().toUpperCase())) errors.push("Enter a valid PAN, e.g. ABCDE1234F");
  if (!Number.isFinite(limit) || limit < MIN_CREDIT_LIMIT)
    errors.push(`Credit limit must be at least ${inr(MIN_CREDIT_LIMIT)}`);

  const mut = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: editing?.id,
          values: {
            ...v,
            gst_number: v.gst_number.trim().toUpperCase(),
            pan: v.pan.trim().toUpperCase(),
            phone: v.phone.trim(),
            address: v.address?.trim() || null,
            latitude: v.latitude != null ? Number(v.latitude) : null,
            longitude: v.longitude != null ? Number(v.longitude) : null,
            credit_limit: limit,
            credit_terms: Number(v.credit_terms),
            penalty_rate_per_day: Number(v.penalty_rate_per_day),
          },
        },
      }),
    onSuccess: (r: any) => {
      toast.success(
        r?.pendingApproval
          ? "Client saved. The high credit limit is awaiting admin approval."
          : "Client saved",
      );
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle></DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Business name" required><Input value={v.business_name} onChange={(e) => setV({ ...v, business_name: e.target.value })} /></Field>
        <Field label="Contact person"><Input value={v.contact_person} onChange={(e) => setV({ ...v, contact_person: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Phone" required><Input placeholder="+919876543210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
        <Field label="GST number" required><Input placeholder="27ABCDE1234F1Z5" value={v.gst_number} onChange={(e) => setV({ ...v, gst_number: e.target.value.toUpperCase() })} /></Field>
        <Field label="PAN number" required><Input placeholder="ABCDE1234F" value={v.pan} onChange={(e) => setV({ ...v, pan: e.target.value.toUpperCase() })} /></Field>
        <Field label="Address" full>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              value={v.address}
              placeholder="Type the address, or use your location"
              onChange={(e) => setV({ ...v, address: e.target.value })}
            />
            <GeoAddressButton
              onResolved={({ address, latitude, longitude }) =>
                setV((p) => ({ ...p, address: address || p.address, latitude, longitude }))
              }
            />
          </div>
          {v.latitude != null && v.longitude != null && (
            <p className="text-xs text-muted-foreground">
              Coordinates: {Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}
            </p>
          )}
        </Field>
        <Field label="Credit limit (₹)" required>
          <Input
            type="number"
            min={MIN_CREDIT_LIMIT}
            step={1000}
            value={v.credit_limit}
            onChange={(e) => setV({ ...v, credit_limit: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Minimum {inr(MIN_CREDIT_LIMIT)}. {inr(HIGH_CREDIT_THRESHOLD)} or more needs admin approval before it activates.
          </p>
        </Field>
        <Field label="Credit terms" required>
          <Select value={v.credit_terms} onValueChange={(t) => setV({ ...v, credit_terms: t })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CREDIT_TERMS_OPTIONS.map((t) => (
                <SelectItem key={t} value={String(t)}>{String(t).padStart(2, "0")} days</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Penalty rate / day"><Input type="number" step="0.001" value={v.penalty_rate_per_day} onChange={(e) => setV({ ...v, penalty_rate_per_day: e.target.value as any })} /></Field>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
          <Label>Active</Label>
        </div>
      </div>
      {errors.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {limit >= HIGH_CREDIT_THRESHOLD && errors.length === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          {inr(limit)} is a high credit limit — it will be submitted for admin approval and won't apply until approved.
        </p>
      )}
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || errors.length > 0}>{mut.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CreditApprovals() {
  const listFn = useServerFn(listCreditRequests);
  const reviewFn = useServerFn(reviewCreditRequest);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: qk.creditRequests, queryFn: () => listFn() });
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const review = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" }) =>
      reviewFn({ data: { id: v.id, action: v.action, reason: reasons[v.id]?.trim() || undefined } }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "approve" ? "Credit limit approved" : "Request rejected");
      invalidateFor(qc, "client");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = (data as any[]).filter((r) => r.status === "pending");
  const history = (data as any[]).filter((r) => r.status !== "pending").slice(0, 25);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Credit limit approvals</CardTitle>
        <p className="text-sm text-muted-foreground">
          Requests of {inr(HIGH_CREDIT_THRESHOLD)} or more stay inactive until you approve them.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending.length === 0 && <p className="text-sm text-muted-foreground">No requests awaiting approval.</p>}
        {pending.map((r: any) => (
          <div key={r.id} className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{r.clients?.business_name ?? "Client"}</span>
              <Badge variant="outline">{String(r.credit_terms).padStart(2, "0")} days</Badge>
              <span className="text-muted-foreground">
                {inr(r.previous_limit)} → <span className="font-medium text-foreground">{inr(r.requested_limit)}</span>
              </span>
            </div>
            <Input
              placeholder="Internal reason (optional)"
              value={reasons[r.id] ?? ""}
              onChange={(e) => setReasons((p) => ({ ...p, [r.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, action: "approve" })}>
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, action: "reject" })}>
                Reject
              </Button>
            </div>
          </div>
        ))}

        {history.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground">Approval history</div>
            <ul className="space-y-1 text-xs">
              {history.map((r: any) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>
                  <span className="font-medium">{r.clients?.business_name ?? "Client"}</span>
                  <span className="text-muted-foreground">
                    {inr(r.previous_limit)} → {inr(r.requested_limit)} · {String(r.credit_terms).padStart(2, "0")}d
                  </span>
                  {r.reason && <span className="text-muted-foreground">· {r.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, required, full }: { label: string; children: React.ReactNode; required?: boolean; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2 space-y-1" : "space-y-1"}>
      <Label>{label}{required && <span className="text-red-500"> *</span>}</Label>
      {children}
    </div>
  );
}
