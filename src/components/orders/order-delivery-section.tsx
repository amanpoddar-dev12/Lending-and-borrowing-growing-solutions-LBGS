import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  submitPayment, reviewPayment, getOrderDeliveryState,
  markOutForDelivery, regenerateDeliveryOtp, verifyDeliveryOtp, CLIENT_PAYMENT_METHODS,
} from "@/lib/delivery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Lock, Truck, ShieldCheck, Clock, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { ProofPreview } from "@/components/proof-preview";
import { prepareUpload, thumbPathFor } from "@/lib/image-compress";
import { qk } from "@/lib/query-keys";
import { usePermissions } from "@/hooks/use-permissions";
import { invalidateFor } from "@/lib/query-mutations";

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

// Payment now happens after delivery:
// processing -> dispatched -> delivered -> payment submitted -> verified/paid.
const STEPS = ["client_approved", "out_for_delivery", "completed", "payment_submitted", "paid"] as const;
const STEP_LABELS: Record<string, string> = {
  client_approved: "Processing",
  out_for_delivery: "Dispatched",
  completed: "Delivered",
  payment_submitted: "Verification",
  paid: "Paid",
};
/** Orders created under the pre-delivery payment flow still map onto the bar. */
const LEGACY_STEP: Record<string, (typeof STEPS)[number]> = {
  payment_pending: "client_approved",
  payment_verified: "client_approved",
};

function Progress({ status }: { status: string }) {
  const idx = STEPS.indexOf((LEGACY_STEP[status] ?? status) as (typeof STEPS)[number]);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s} className="flex-1">
          <div className={cn("h-1.5 rounded-full", i <= idx ? "bg-primary" : "bg-muted")} />
          <div className={cn("mt-1 truncate text-[10px]", i <= idx ? "text-foreground" : "text-muted-foreground")}>
            {STEP_LABELS[s]}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrderDeliverySection({ order, role }: { order: any; role: "admin" | "employee" | "client" }) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const orderId: string = order.id;
  const stateFn = useServerFn(getOrderDeliveryState);
  const submitFn = useServerFn(submitPayment);
  const reviewFn = useServerFn(reviewPayment);
  const outFn = useServerFn(markOutForDelivery);
  const regenFn = useServerFn(regenerateDeliveryOtp);
  const verifyFn = useServerFn(verifyDeliveryOtp);

  const { data } = useQuery({
    queryKey: qk.orderDelivery(orderId),
    queryFn: () => stateFn({ data: { id: orderId } }),
  });

  const payments: any[] = data?.payments ?? [];
  const latest = payments[0] ?? null;
  const otp = data?.otp ?? null;
  const due: any = data?.due ?? null;
  const reminders: any[] = data?.reminders ?? [];
  const creditTerms: number = due?.credit_terms ?? reminders[0]?.credit_terms ?? order.clients?.credit_terms ?? 0;
  const dueAmount = due ? Number(due.balance) : 0;
  const overdue = !!due?.overdue;
  const status: string = order.status;

  const [amount, setAmount] = useState(String(order.total_amount ?? ""));
  const [method, setMethod] = useState<string>("upi");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [code, setCode] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  // Sensitive operations (payment review, OTP verification) stay
  // server-authoritative: we refetch the affected slices, never guess.
  const invalidate = () => invalidateFor(qc, "delivery", { orderId });

  const pay = useMutation({
    mutationFn: async () => {
      let proof_path: string | null = null;
      if (file) {
        setUploading(true);
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) throw new Error("Session expired");
        // Compress on-device before upload: phone photos are several MB and
        // dominate submit time on mobile data. A thumbnail is stored alongside
        // so reviewers never download the full file just to glance at it.
        const prepared = await prepareUpload(file);
        const ext = prepared.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${uid}/${orderId}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("payment-proofs").upload(path, prepared.file);
        if (!error && prepared.thumb) {
          await supabase.storage.from("payment-proofs").upload(thumbPathFor(path), prepared.thumb);
        }
        setUploading(false);
        if (error) throw new Error(error.message);
        proof_path = path;
      }
      return submitFn({
        data: {
          order_id: orderId,
          amount: Number(amount),
          method: method as any,
          reference_id: null,
          proof_path,
          note: note || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Payment submitted for verification");
      setNote(""); setFile(null);
      invalidate();
    },
    onError: (e: any) => { setUploading(false); toast.error(e.message); },
  });

  const review = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      reviewFn({ data: { payment_id: latest.id, action, reason: action === "reject" ? rejectReason : null } }),
    onSuccess: (_r, action) => {
      toast.success(action === "approve" ? "Payment verified" : "Payment rejected");
      setRejectReason("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const dispatch = useMutation({
    mutationFn: () => outFn({ data: { id: orderId } }),
    onSuccess: () => { toast.success("Marked out for delivery — code sent to client"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const regen = useMutation({
    mutationFn: () => regenFn({ data: { id: orderId } }),
    onSuccess: () => { toast.success("New delivery code issued to the client"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { id: orderId, code } }),
    onSuccess: () => { toast.success("Delivery verified — order completed"); setCode(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const staff = (role === "admin" || role === "employee") && can("orders.approve");

  return (
    <>
      <Separator />
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Payment &amp; delivery</h3>
        </div>
        <Progress status={status} />

        {due && dueAmount > 0 && status !== "paid" && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Amount due</span>
              <span className="font-display text-base font-semibold">{inr(dueAmount)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {due.delivered_at && <span>Delivered {fmtDateTime(due.delivered_at)}</span>}
              <span>
                Credit terms: {creditTerms === 0 ? "Immediate payment" : `${creditTerms} days`}
              </span>
              <span className={cn(overdue && "font-medium text-red-600 dark:text-red-400")}>
                Due {fmtDateTime(due.due_date)}{overdue ? " — overdue" : ""}
              </span>
            </div>
          </div>
        )}

        {/* ---- Payment history ---- */}
        {payments.length > 0 && (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{inr(p.amount)} · {METHOD_LABELS[p.method] ?? p.method}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      p.status === "verified" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                      p.status === "rejected" && "bg-red-500/15 text-red-600 dark:text-red-400",
                      p.status === "submitted" && "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                    )}
                  >
                    {p.status === "submitted" ? "Under verification" : p.status === "verified" ? "Verified" : "Rejected"}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {p.reference_id && <div>Ref: {p.reference_id}</div>}
                  <div>Submitted {fmtDateTime(p.submitted_at)}</div>
                  {p.reviewed_at && <div>Reviewed {fmtDateTime(p.reviewed_at)}</div>}
                  {p.note && <div>Note: {p.note}</div>}
                </div>
                {p.rejection_reason && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {p.rejection_reason}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.proof_path && <ProofPreview path={p.proof_path} />}
                  {role === "admin" && p.status === "submitted" && (
                    <>
                      <Button size="sm" disabled={review.isPending} onClick={() => review.mutate("approve")}>
                        Approve payment
                      </Button>
                      <Button size="sm" variant="outline" disabled={review.isPending || !rejectReason.trim()}
                        onClick={() => review.mutate("reject")}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
                {role === "admin" && p.status === "submitted" && (
                  <Input
                    className="mt-2"
                    placeholder="Rejection reason (required to reject)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---- Client: submit / resubmit payment ---- */}
        {role === "client" && (status === "completed" || status === "payment_pending") && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{latest?.status === "rejected" ? "Resubmit payment" : "Submit payment"}</span>
              <span className="font-display text-lg font-semibold">{inr(order.total_amount)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount paid</Label>
                <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLIENT_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-proof">Payment screenshot / proof</Label>
              <Input id="pay-proof" type="file" accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Textarea rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              className="w-full"
              disabled={pay.isPending || uploading || !Number(amount)}
              onClick={() => pay.mutate()}
            >
              {(pay.isPending || uploading) && <Loader2 className="mr-1 size-4 animate-spin" />}
              Submit payment
            </Button>
          </div>
        )}

        {role === "client" && status === "payment_submitted" && (
          <p className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-400">
            <Clock className="size-4" /> Payment under verification by the admin team.
          </p>
        )}

        {status === "payment_verified" && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="size-4" /> Payment verified. {role === "client" ? "Awaiting dispatch." : "Delivery unlocked."}
          </p>
        )}

        {/* ---- Client: delivery code ---- */}
        {role === "client" && status === "out_for_delivery" && (
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-center">
            <p className="flex items-center justify-center gap-2 text-sm font-medium">
              <Truck className="size-4" /> Out for delivery
            </p>
            <p className="text-xs text-muted-foreground">
              When you receive your order, give this verification code to the delivery person.
            </p>
            {otp ? (
              <>
                <div className="font-display text-4xl font-semibold tracking-[0.35em]">{otp.code}</div>
                <p className="text-xs text-muted-foreground">Valid until {fmtDateTime(otp.expires_at)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Your code has expired — the team will issue a new one.</p>
            )}
            <p className="text-xs text-amber-600 dark:text-amber-400">Do not share this code before receiving your order.</p>
          </div>
        )}

        {/* ---- Staff: delivery workflow ---- */}
        {staff && (status === "completed" || status === "payment_submitted") && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <Lock className="size-4" />
            {status === "payment_submitted"
              ? "Payment submitted — awaiting admin verification."
              : "Delivered — payment due from the client."}
          </p>
        )}

        {staff && (status === "client_approved" || status === "payment_verified") && (
          <Button className="w-full" disabled={dispatch.isPending} onClick={() => dispatch.mutate()}>
            {dispatch.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            <Truck className="mr-1 size-4" /> Mark out for delivery
          </Button>
        )}

        {staff && status === "out_for_delivery" && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Complete delivery</p>
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code the client gave to the delivery person.
            </p>
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              className="text-center font-display text-xl tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" disabled={code.length !== 6 || verify.isPending} onClick={() => verify.mutate()}>
                {verify.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                Verify &amp; complete order
              </Button>
              <Button variant="outline" disabled={regen.isPending} onClick={() => regen.mutate()}>
                <RefreshCw className="mr-1 size-4" /> New code
              </Button>
            </div>
          </div>
        )}

        {status === "paid" && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="size-4" /> Payment completed — order closed.
          </p>
        )}
      </section>
    </>
  );
}
