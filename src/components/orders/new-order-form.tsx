import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClients } from "@/lib/clients.functions";
import { listEmployees } from "@/lib/employees.functions";
import { createOrder } from "@/lib/orders.functions";
import { listProducts } from "@/lib/products.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, AlertTriangle } from "lucide-react";
import { inr } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";
import { usePermissions } from "@/hooks/use-permissions";
import { invalidateFor } from "@/lib/query-mutations";
import { OrderScanCard, LOW_CONFIDENCE } from "@/components/orders/order-scan-card";
import type { ScanResult } from "@/lib/order-scan.functions";

type LineItem = {
  product_id: string;
  product_name: string;
  product_code: string;
  quantity: number;
  rate: number;
  /** Set when the row came from OCR and needs a human look. */
  flagged?: boolean;
};

const blankItem = (): LineItem => ({ product_id: "", product_name: "", product_code: "", quantity: 1, rate: 0 });

export function NewOrderForm() {
  const { can, role } = usePermissions();
  const isAdmin = role === "admin";
  const clientsFn = useServerFn(listClients);
  const productsFn = useServerFn(listProducts);
  const employeesFn = useServerFn(listEmployees);
  const createFn = useServerFn(createOrder);
  const nav = useNavigate();
  const { data: clients = [] } = useQuery({ queryKey: qk.clients, queryFn: () => clientsFn() });
  const { data: products = [] } = useQuery({ queryKey: qk.products, queryFn: () => productsFn() });
  const { data: employees = [] } = useQuery({ queryKey: qk.employees, queryFn: () => employeesFn(), enabled: isAdmin });
  const activeProducts = (products as any[]).filter((p) => p.active);
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [reference, setReference] = useState("");
  const [items, setItems] = useState<LineItem[]>([blankItem()]);
  const [scanned, setScanned] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const total = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.rate || 0), 0);
  const flaggedCount = items.filter((i) => i.flagged).length;

  const mut = useMutation({
    mutationFn: () => createFn({
      data: {
        client_id: clientId,
        employee_id: isAdmin && employeeId ? employeeId : null,
        // Delivery date is no longer captured at creation time; the column stays
        // intact for existing orders and later workflow updates.
        delivery_date: null,
        notes: reference.trim() ? `Ref: ${reference.trim()}` : null,
        items: items.map((i) => ({
          product_name: i.product_name,
          product_code: i.product_code || null,
          quantity: Number(i.quantity),
          rate: Number(i.rate),
        })),
      },
    }),
    onSuccess: (o: any) => {
      invalidateFor(qc, "order");
      toast.success(`Order ${o.order_number} created`);
      nav({ to: "/dashboard" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  function pickProduct(i: number, productId: string) {
    const p = activeProducts.find((x) => x.id === productId);
    setItems(items.map((it, j) => j === i
      ? { ...it, product_id: productId, product_name: p?.name ?? "", product_code: p?.code ?? "", rate: Number(p?.unit_price ?? 0), flagged: false }
      : it));
  }

  function update(i: number, key: keyof LineItem, value: any) {
    setItems(items.map((it, j) => j === i ? { ...it, [key]: value } : it));
  }

  /** Fill the existing form from an OCR result. Missing values stay empty. */
  function applyScan(r: ScanResult) {
    if (r.client_id) setClientId(r.client_id);
    if (r.reference_number) setReference(r.reference_number);
    const mapped: LineItem[] = r.items.map((it) => ({
      product_id: it.product_id ?? "",
      product_name: it.product_name ?? "",
      product_code: it.product_code ?? "",
      quantity: it.quantity ?? 0,
      rate: it.rate ?? 0,
      flagged: it.confidence < LOW_CONFIDENCE || !it.product_id || it.quantity == null || it.rate == null,
    }));
    setItems(mapped.length ? mapped : [blankItem()]);
    setScanned(true);
    setReviewed(false);
    toast.info("Values filled in. Check the highlighted fields, then submit.");
  }

  const valid = Boolean(clientId) && items.length > 0 && items.every((i) => i.product_id && i.quantity > 0 && i.rate >= 0);
  const needsReview = scanned && flaggedCount > 0 && !reviewed;
  const canSubmit = valid && !needsReview && !mut.isPending;

  if (!can("orders.create")) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <h1 className="font-display text-xl font-semibold">Permission required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to create orders. Ask an administrator to grant it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">New order</h1>
        {isAdmin && <p className="text-sm text-muted-foreground">Orders you punch are recorded against your admin account unless you assign an employee.</p>}
      </div>

      <OrderScanCard onApply={applyScan} />

      <Card>
        <CardHeader><CardTitle>Client</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1"><Label>Client</Label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select client…</option>
              {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div className="space-y-1">
              <Label>Assign to employee <span className="text-muted-foreground">(optional)</span></Label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Keep with me (admin)</option>
                {(employees as any[]).map((e) => (
                  <option key={e.id} value={e.id}>{e.profiles?.name ?? e.profiles?.email ?? "Employee"}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Reference number <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="From the order sheet" />
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="flex flex-row items-center">
          <CardTitle>Line items</CardTitle>
          <Button size="sm" variant="outline" className="ml-auto"
            onClick={() => setItems([...items, blankItem()])}>
            <Plus className="mr-1 size-4" />Add item
          </Button>
        </CardHeader>
        <CardContent>
          {activeProducts.length === 0 && (
            <p className="mb-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              No products in the catalog yet. Ask an admin to add products before punching orders.
            </p>
          )}
          <div className="space-y-2">
            {items.map((it, i) => (
              <div
                key={i}
                className={`grid grid-cols-12 gap-2 rounded-md ${it.flagged ? "border border-destructive/50 bg-destructive/5 p-2" : ""}`}
              >
                <select
                  className="col-span-6 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={it.product_id}
                  onChange={(e) => pickProduct(i, e.target.value)}
                >
                  <option value="">Select product…</option>
                  {activeProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
                <Input className="col-span-2" type="number" min="0" step="any" placeholder="Qty" value={it.quantity}
                  onChange={(e) => update(i, "quantity", Number(e.target.value))} />
                <Input className="col-span-3" type="number" min="0" step="any" placeholder="Rate" value={it.rate}
                  onChange={(e) => update(i, "rate", Number(e.target.value))} />
                <Button className="col-span-1" size="icon" variant="ghost"
                  onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1}>
                  <Trash2 className="size-4" />
                </Button>
                {it.flagged && (
                  <p className="col-span-12 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="size-3" />
                    {it.product_name && !it.product_id
                      ? `Scanned as "${it.product_name}" — pick the matching product.`
                      : "Low-confidence scan — verify product, quantity and rate."}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="font-display text-xl font-semibold">{inr(total)}</div>
          </div>
        </CardContent>
      </Card>

      {scanned && flaggedCount > 0 && (
        <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} className="mt-0.5" />
          <span>
            {flaggedCount} scanned {flaggedCount === 1 ? "line" : "lines"} need review. I have checked the highlighted
            values and confirm they are correct.
          </span>
        </label>
      )}

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={!canSubmit}>
          {mut.isPending ? "Creating…" : "Create order"}
        </Button>
      </div>

    </div>
  );
}
