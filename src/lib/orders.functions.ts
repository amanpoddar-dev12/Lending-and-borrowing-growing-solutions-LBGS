import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { requirePermission } from "./permission-guard";

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, order_number, client_id, employee_id, order_date, delivery_date, status, total_amount, notes, change_request, created_at, updated_at, clients(business_name), profiles:employee_id(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("*, clients(id, business_name, phone, email), order_items(*), profiles:employee_id(name)")
      .eq("id", data.id)
      .maybeSingle();
    return order;
  });

const orderItemSchema = z.object({
  product_name: z.string().min(1),
  product_code: z.string().optional().nullable(),
  quantity: z.number().positive(),
  rate: z.number().nonnegative(),
});

const createOrderSchema = z.object({
  client_id: z.string().uuid(),
  employee_id: z.string().uuid().optional().nullable(),
  delivery_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(orderItemSchema).min(1),
});

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createOrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context, "orders.create", "create orders");
    const { supabase, userId } = context;
    const total = data.items.reduce((s, i) => s + i.quantity * i.rate, 0);

    // Check role
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isEmp } = await supabase.rpc("has_role", { _user_id: userId, _role: "employee" });

    let status: "pending" | "confirmed" = "confirmed";
    let employee_id = data.employee_id ?? null;

    // Admins can punch orders too; the order is recorded against the admin
    // unless they explicitly assign it to an employee.
    if (isAdmin && !employee_id) employee_id = userId;

    if (isEmp && !isAdmin) {
      employee_id = userId;
      // Check limits
      const { data: emp } = await supabase.from("employee_profiles").select("max_order_value, order_limit").eq("id", userId).maybeSingle();
      const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
      if (emp && (total > Number(emp.max_order_value) || totalQty > emp.order_limit)) {
        status = "pending"; // needs admin approval
      }
    }

    const { data: order, error } = await supabase
      .from("orders")
      .insert({ client_id: data.client_id, employee_id, delivery_date: data.delivery_date, notes: data.notes, total_amount: total, status })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const items = data.items.map((i) => ({ ...i, order_id: order.id, amount: i.quantity * i.rate }));
    await supabase.from("order_items").insert(items);

    // Auto-route straight to the client for approval. Orders that tripped the
    // employee limit stay "pending" so admin approval still happens first.
    let autoSubmitted = false;
    if (status === "confirmed") {
      const { error: submitError } = await supabase.rpc("submit_order_for_client", { p_id: order.id });
      if (!submitError) {
        autoSubmitted = true;
        order.status = "pending_client";
      }
    }

    // Notify client (the approval RPC already notifies when auto-submitted).
    const { data: cli } = await supabase.from("clients").select("user_id, business_name").eq("id", data.client_id).maybeSingle();
    if (cli?.user_id && !autoSubmitted) {
      await supabase.from("notifications").insert({
        user_id: cli.user_id, type: "order", title: "New order received",
        message: `Order ${order.order_number} pending your review`, reference_id: order.id,
      });
    }

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "order.created",
      module: "orders",
      status: "success",
      target_type: "order",
      target_id: order.id,
      new_value: {
        order_number: order.order_number,
        client_id: data.client_id,
        employee_id,
        total_amount: total,
        created_by_role: isAdmin ? "admin" : "employee",
      },
    });

    return order;
  });

export const respondToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; action: "accept" | "decline" | "request_changes"; change_request?: unknown }) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["accept", "decline", "request_changes"]),
      change_request: z.unknown().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context, "orders.edit", "respond to orders");
    const status = data.action === "accept" ? "confirmed" as const : data.action === "decline" ? "declined" as const : "change_requested" as const;
    const patch = data.action === "request_changes"
      ? { status, change_request: (data.change_request ?? null) as any }
      : { status };
    const { error } = await context.supabase.from("orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, status };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["pending","confirmed","declined","change_requested","paid"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("orders").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
