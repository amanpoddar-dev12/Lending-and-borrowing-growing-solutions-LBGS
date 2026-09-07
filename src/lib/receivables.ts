/**
 * Receivables without invoices.
 *
 * Amount due for an order = order total − money received against it.
 * Due date       = delivery date (falling back to order date) + the client's
 *                  credit terms in days.
 * Money received = verified order payments for that order, plus any
 *                  admin-recorded client payments allocated oldest-due-first.
 */

export type ReceivableOrder = {
  id: string;
  order_number?: string | null;
  client_id: string;
  status: string;
  total_amount: number | string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  created_at?: string | null;
  clients?: { business_name?: string | null } | null;
};

export type Receivable = {
  id: string;
  order_id: string;
  order_number: string | null;
  client_id: string;
  client: string;
  amount: number;
  paid: number;
  balance: number;
  due_date: string;
  days_overdue: number;
  status: string;
};

/** Orders that represent money owed (delivered or awaiting payment). */
export const BILLABLE_STATUSES = new Set([
  "out_for_delivery",
  "completed",
  "payment_pending",
  "payment_submitted",
  "payment_verified",
  "paid",
  "invoiced",
]);

const n = (v: unknown) => Number(v ?? 0) || 0;

export function dueDateFor(order: ReceivableOrder, creditTerms: number): string {
  const base = order.delivery_date ?? order.order_date ?? order.created_at ?? new Date().toISOString();
  return new Date(new Date(base).getTime() + Math.max(0, creditTerms) * 864e5).toISOString();
}

export function buildReceivables(input: {
  orders: ReceivableOrder[];
  /** Verified order payments: { order_id, amount, status } */
  orderPayments?: { order_id: string; amount: number | string | null; status?: string | null }[];
  /** Client-level recorded payments: { client_id, amount } */
  clientPayments?: { client_id: string; amount: number | string | null }[];
  termsByClient: Map<string, number>;
  now?: number;
}): Receivable[] {
  const now = input.now ?? Date.now();

  const paidByOrder = new Map<string, number>();
  for (const p of input.orderPayments ?? []) {
    if (p.status && p.status !== "verified") continue;
    paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) ?? 0) + n(p.amount));
  }

  const poolByClient = new Map<string, number>();
  for (const p of input.clientPayments ?? []) {
    poolByClient.set(p.client_id, (poolByClient.get(p.client_id) ?? 0) + n(p.amount));
  }

  const rows: Receivable[] = input.orders
    .filter((o) => BILLABLE_STATUSES.has(o.status))
    .map((o) => {
      const terms = input.termsByClient.get(o.client_id) ?? 0;
      const amount = n(o.total_amount);
      const paid = Math.min(amount, paidByOrder.get(o.id) ?? 0);
      const due = dueDateFor(o, terms);
      return {
        id: o.id,
        order_id: o.id,
        order_number: o.order_number ?? null,
        client_id: o.client_id,
        client: o.clients?.business_name ?? "—",
        amount,
        paid,
        balance: Math.max(0, amount - paid),
        due_date: due,
        days_overdue: Math.max(0, Math.floor((now - new Date(due).getTime()) / 864e5)),
        status: o.status,
      };
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  // Allocate admin-recorded client payments oldest-due-first.
  for (const r of rows) {
    const pool = poolByClient.get(r.client_id) ?? 0;
    if (pool <= 0 || r.balance <= 0) continue;
    const applied = Math.min(pool, r.balance);
    r.paid += applied;
    r.balance -= applied;
    poolByClient.set(r.client_id, pool - applied);
  }

  return rows;
}

export const openReceivables = (rows: Receivable[]) => rows.filter((r) => r.balance > 0.005);
export const overdueReceivables = (rows: Receivable[], now = Date.now()) =>
  openReceivables(rows).filter((r) => new Date(r.due_date).getTime() < now);
export const totalBalance = (rows: Receivable[]) => rows.reduce((s, r) => s + r.balance, 0);
