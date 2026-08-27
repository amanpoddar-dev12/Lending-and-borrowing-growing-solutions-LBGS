import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listClients,
  upsertClient,
  MIN_CREDIT_LIMIT,
  HIGH_CREDIT_THRESHOLD,
  CREDIT_TERMS_OPTIONS,
  GST_REGEX,
  PAN_REGEX,
  PHONE_REGEX,
} from "@/lib/clients.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GeoAddressButton } from "@/components/clients/geo-address-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { inr } from "@/lib/format";
import { PhoneDisplay } from "@/components/phone-display";
import { useMemo, useState } from "react";
import { useVisibleRows } from "@/hooks/use-visible-rows";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { qk } from "@/lib/query-keys";
import { usePermissions } from "@/hooks/use-permissions";
import { invalidateFor } from "@/lib/query-mutations";

export const Route = createFileRoute("/_authenticated/employee/clients")({
  head: () => ({
    meta: [
      { title: "My clients — Kredix" },
      { name: "description", content: "Clients assigned to you." },
      { property: "og:title", content: "My clients — Kredix" },
      { property: "og:description", content: "Clients assigned to you." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmpClients,
});

function EmpClients() {
  const fn = useServerFn(listClients);
  const save = useServerFn(upsertClient);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: qk.clients, queryFn: () => fn() });
  const { can } = usePermissions();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const emptyForm = {
    business_name: "",
    contact_person: "",
    phone: "",
    email: "",
    gst_number: "",
    pan: "",
    address: "",
    latitude: null as number | null,
    longitude: null as number | null,
    credit_limit: String(MIN_CREDIT_LIMIT),
    credit_terms: "30",
  };
  const [form, setForm] = useState(emptyForm);

  const limit = Number(form.credit_limit);
  const errors: string[] = [];
  if (form.business_name.trim().length < 2) errors.push("Business name is required");
  if (!PHONE_REGEX.test(form.phone.trim())) errors.push("Phone must be in E.164 format, e.g. +919876543210");
  if (!GST_REGEX.test(form.gst_number.trim().toUpperCase())) errors.push("Enter a valid 15-character GST number");
  if (!PAN_REGEX.test(form.pan.trim().toUpperCase())) errors.push("Enter a valid PAN, e.g. ABCDE1234F");
  if (!Number.isFinite(limit) || limit < MIN_CREDIT_LIMIT)
    errors.push(`Credit limit must be at least ${inr(MIN_CREDIT_LIMIT)}`);

  const create = useMutation({
    mutationFn: async () => {
      if (errors.length) throw new Error(errors[0]);
      return save({
        data: {
          values: {
            business_name: form.business_name.trim(),
            contact_person: form.contact_person.trim() || null,
            phone: form.phone.trim(),
            email: form.email.trim() || null,
            gst_number: form.gst_number.trim().toUpperCase(),
            pan: form.pan.trim().toUpperCase(),
            address: form.address.trim() || null,
            latitude: form.latitude,
            longitude: form.longitude,
            credit_limit: limit,
            credit_terms: Number(form.credit_terms),
            penalty_rate_per_day: 0.005,
            kyc_verified: false,
            active: true,
          },
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(
        r?.pendingApproval
          ? "Client added. The high credit limit is awaiting admin approval."
          : "Client added. They can sign in with their phone number.",
      );
      setOpen(false);
      setForm(emptyForm);
      invalidateFor(qc, "client");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add client"),
  });


  const filtered = useMemo(() => {
    if (!q) return data;
    const s = q.toLowerCase();
    return data.filter(
      (c: any) => c.business_name.toLowerCase().includes(s) || (c.phone ?? "").includes(q),
    );
  }, [data, q]);
  const { shown, hasMore, remaining, showMore } = useVisibleRows(filtered, 60);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold sm:text-2xl">My clients</h1>
        </div>
        <Input
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full sm:ml-auto sm:w-56"
        />
        {can("clients.manage") && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-1 size-4" /> New client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a new client</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Field label="Business name *">
                <Input
                  value={form.business_name}
                  onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
                />
              </Field>
              <Field label="Contact person">
                <Input
                  value={form.contact_person}
                  onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                />
              </Field>
              <Field label="Mobile number *">
                <Input
                  placeholder="+919876543210"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </Field>
                <Field label="GST number *">
                  <Input
                    placeholder="27ABCDE1234F1Z5"
                    value={form.gst_number}
                    onChange={(e) => setForm((f) => ({ ...f, gst_number: e.target.value.toUpperCase() }))}
                  />
                </Field>
                <Field label="PAN number *">
                  <Input
                    placeholder="ABCDE1234F"
                    value={form.pan}
                    onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
                  />
                </Field>
                <Field label="Credit limit (₹) *">
                  <Input
                    type="number"
                    min={MIN_CREDIT_LIMIT}
                    step={1000}
                    value={form.credit_limit}
                    onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                  />
                </Field>
                <Field label="Credit terms *">
                  <Select
                    value={form.credit_terms}
                    onValueChange={(t) => setForm((f) => ({ ...f, credit_terms: t }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CREDIT_TERMS_OPTIONS.map((t) => (
                        <SelectItem key={t} value={String(t)}>{String(t).padStart(2, "0")} days</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Address">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[12rem] flex-1"
                    placeholder="Type the address, or use your location"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                  <GeoAddressButton
                    onResolved={({ address, latitude, longitude }) =>
                      setForm((f) => ({ ...f, address: address || f.address, latitude, longitude }))
                    }
                  />
                </div>
              </Field>
              <p className="text-xs text-muted-foreground">
                Minimum credit limit {inr(MIN_CREDIT_LIMIT)}. {inr(HIGH_CREDIT_THRESHOLD)} or more needs admin
                approval before it activates. The mobile number becomes their sign-in ID.
              </p>
              {errors.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || errors.length > 0}>
                {create.isPending ? "Saving…" : "Save client"}
              </Button>

            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
        {can("orders.create") && (
          <Button asChild>
            <Link to="/employee/orders/new">Punch order</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{c.business_name}</div>
                {c.kyc_verified ? (
                  <Badge className="bg-emerald-600">KYC</Badge>
                ) : (
                  <Badge variant="outline">KYC pending</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate">{c.contact_person ?? "—"}</span>
                <span>·</span>
                <PhoneDisplay phone={c.phone} />
              </div>
              <div className="text-xs">
                Credit limit: <span className="font-medium">{inr(c.credit_limit)}</span> · Terms:{" "}
                {c.credit_terms}d
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No clients yet.</p>
        )}
      </div>
      {hasMore && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={showMore}>
            Show more ({remaining} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
