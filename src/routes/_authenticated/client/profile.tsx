import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/me.functions";
import { listClients } from "@/lib/clients.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/client/profile")({
  head: () => ({
    meta: [
      { title: "Profile & KYC — LBGS" },
      { name: "description", content: "Your business details, KYC status, and credit terms." },
      { property: "og:title", content: "Profile & KYC — LBGS" },
      { property: "og:description", content: "Your business details, KYC status, and credit terms." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const meFn = useServerFn(getMe);
  const clientsFn = useServerFn(listClients);
  const { data: meData } = useSuspenseQuery({ queryKey: qk.me, queryFn: () => meFn() });
  const me = meData as any;
  const { data: clients = [] } = useQuery<any[]>({ queryKey: qk.clients, queryFn: async () => (await clientsFn()) as any });
  const c: any = clients.find((x: any) => x.id === me.clientRecord?.id) ?? clients[0];

  if (!c) return <p className="text-sm text-muted-foreground">Your client record isn't set up yet. Contact your account manager.</p>;
  const purse = Array.isArray(c.credit_purse) ? c.credit_purse[0] : c.credit_purse;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div><h1 className="font-display text-xl font-semibold sm:text-2xl">Profile & KYC</h1></div>
      <Card>
        <CardHeader className="flex flex-row items-center"><CardTitle>{c.business_name}</CardTitle>
          <div className="ml-auto">{c.kyc_verified ? <Badge className="bg-emerald-600">KYC verified</Badge> : <Badge variant="outline">KYC pending</Badge>}</div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <Row k="Contact" v={c.contact_person} />
          <Row k="Phone" v={c.phone} />
          <Row k="Email" v={c.email} />
          <Row k="GST" v={c.gst_number} />
          <Row k="PAN" v={c.pan} />
          <Row k="Address" v={c.address} full />
          <Row k="Credit limit" v={inr(c.credit_limit)} />
          <Row k="Credit terms" v={`${c.credit_terms} days`} />
          <Row k="Penalty / day" v={`${(Number(c.penalty_rate_per_day) * 100).toFixed(2)}%`} />
          {purse && <Row k="Available credit" v={inr(purse.remaining_credit)} />}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v, full }: any) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v || "—"}</div>
    </div>
  );
}
