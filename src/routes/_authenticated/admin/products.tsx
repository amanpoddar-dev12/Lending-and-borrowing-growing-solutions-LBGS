import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProducts, createProduct, updateProduct, deleteProduct } from "@/lib/products.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { inr } from "@/lib/format";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";
import { invalidateFor } from "@/lib/query-mutations";

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({
    meta: [
      { title: "Products — LBGS" },
      { name: "description", content: "Manage the product catalog for order punching." },
      { property: "og:title", content: "Products — LBGS" },
      { property: "og:description", content: "Manage the product catalog for order punching." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProductsPage,
});

type ProductForm = {
  id?: string;
  code: string;
  name: string;
  unit: string;
  unit_price: string;
  active: boolean;
};

const empty: ProductForm = { code: "", name: "", unit: "", unit_price: "0", active: true };

function ProductsPage() {
  const listFn = useServerFn(listProducts);
  const createFn = useServerFn(createProduct);
  const updateFn = useServerFn(updateProduct);
  const deleteFn = useServerFn(deleteProduct);
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: qk.products, queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(empty);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        unit: form.unit || null,
        unit_price: Number(form.unit_price) || 0,
        active: form.active,
      };
      if (form.id) return updateFn({ data: { id: form.id, patch: payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      invalidateFor(qc, "product");
      toast.success(form.id ? "Product updated" : "Product added");
      setOpen(false); setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { invalidateFor(qc, "product"); toast.success("Product removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  function openNew() { setForm(empty); setOpen(true); }
  function openEdit(p: any) {
    setForm({
      id: p.id, code: p.code, name: p.name,
      unit: p.unit ?? "",
      unit_price: String(p.unit_price ?? 0), active: !!p.active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Products</h1>
          <p className="text-sm text-muted-foreground">Catalog used by employees when punching orders.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="mr-1 size-4" />Add product</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Code</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SKU-001" /></div>
                <div className="space-y-1"><Label>Unit</Label>
                  <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg / box / pcs" /></div>
              </div>
              <div className="space-y-1"><Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Unit price (₹)</Label>
                  <Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
                <div className="space-y-1"><Label>Status</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.active ? "1" : "0"}
                    onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}>
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMut.mutate()} disabled={!form.code || !form.name || saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Catalog ({products.length})</CardTitle></CardHeader>
        <CardContent>
          {products.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No products yet — add your first item.</p>}
          <div className="divide-y divide-border">
            {products.map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{p.code}</Badge>
                    {!p.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.unit ? `${p.unit} · ` : ""}{p.code}
                  </div>
                </div>
                <div className="ml-auto w-24 shrink-0 text-right font-medium">{inr(p.unit_price)}</div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete ${p.name}?`)) delMut.mutate(p.id); }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
