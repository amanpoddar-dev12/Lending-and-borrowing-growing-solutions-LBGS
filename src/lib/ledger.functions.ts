import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildReceivables } from "@/lib/receivables";

/**
 * Client ledger built from orders and payments (no invoices):
 * a debit for every billable order, a credit for every payment received.
 */
export const getClientLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id?: string }) => z.object({ client_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let clientId = data.client_id;
    if (!clientId) {
      // client role -> derive from user
      const { data: cli } = await context.supabase.from("clients").select("id").eq("user_id", context.userId).maybeSingle();
      clientId = cli?.id;
    }
    if (!clientId) return { client_id: null, receivables: [], payments: [], orders: [] };

    const [orders, payments, orderPayments, client] = await Promise.all([
      context.supabase
        .from("orders")
        .select("id, order_number, client_id, status, total_amount, order_date, delivery_date, created_at, clients(business_name)")
        .eq("client_id", clientId)
        .order("order_date"),
      context.supabase.from("payments").select("*").eq("client_id", clientId).order("payment_date"),
      context.supabase
        .from("order_payments")
        .select("id, order_id, amount, method, status, reviewed_at, submitted_at, orders(order_number)")
        .eq("client_id", clientId)
        .eq("status", "verified")
        .order("submitted_at"),
      context.supabase.from("clients").select("id, credit_terms").eq("id", clientId).maybeSingle(),
    ]);

    const termsByClient = new Map<string, number>([[clientId, Number(client.data?.credit_terms ?? 0)]]);
    const receivables = buildReceivables({
      orders: (orders.data ?? []) as any,
      orderPayments: (orderPayments.data ?? []) as any,
      clientPayments: (payments.data ?? []) as any,
      termsByClient,
    });

    return {
      client_id: clientId,
      receivables,
      orders: orders.data ?? [],
      payments: payments.data ?? [],
      orderPayments: orderPayments.data ?? [],
    };
  });
