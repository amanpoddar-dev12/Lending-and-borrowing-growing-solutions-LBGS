import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TaskPriority = "action_required" | "pending" | "under_review" | "overdue";

export type PendingTask = {
  id: string;
  type: string;
  priority: TaskPriority;
  title: string;
  description: string;
  entity: string | null;
  amount: number | null;
  created_at: string;
  status: string;
  actionLabel: string;
  /** Opens the order slide-over in place when set. */
  orderId?: string | null;
  /** Opens the client assignment dialog in place when set (admin only). */
  clientId?: string | null;
  clientName?: string | null;
  /** Fallback route when there is no in-place record view. */
  route?: string | null;
};

export type ActivityItem = {
  id: string;
  title: string;
  description: string | null;
  actor: string | null;
  at: string;
  orderId: string | null;
  orderNumber: string | null;
  entity: string | null;
  amount: number | null;
  status: string;
  route: string | null;
  source: "order" | "audit";
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  overdue: 0,
  action_required: 1,
  under_review: 2,
  pending: 3,
};

const roleOf = async (ctx: { supabase: any; userId: string }) => {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const set = new Set((data ?? []).map((r: any) => r.role));
  return set.has("admin") ? "admin" : set.has("employee") ? "employee" : "client";
};

const EVENT_TITLES: Record<string, string> = {
  submitted_for_approval: "Order sent for client approval",
  client_approve: "Order accepted by client",
  client_reject: "Order rejected by client",
  payment_submitted: "Payment proof submitted",
  payment_approved: "Payment approved",
  payment_rejectd: "Payment rejected",
  payment_rejected: "Payment rejected",
  out_for_delivery: "Order marked out for delivery",
  otp_generated: "Delivery code generated",
  otp_regenerated: "Delivery code regenerated",
  otp_failed: "Failed delivery code attempt",
  delivery_verified: "Delivery verified — order completed",
};

const prettyEvent = (e: string) =>
  EVENT_TITLES[e] ?? e.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Actions currently waiting on the signed-in user, derived from live business
 * state. RLS scopes every query, so a user can only ever see their own work.
 */
export const getPendingTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: string; tasks: PendingTask[] }> => {
    const { supabase, userId } = context;
    const role = await roleOf(context as any);
    const tasks: PendingTask[] = [];

    if (role === "admin") {
      const [payments, orders, clients, links] = await Promise.all([
        supabase
          .from("order_payments")
          .select("id, order_id, amount, method, submitted_at, clients(business_name), orders(order_number)")
          .eq("status", "submitted")
          .order("submitted_at", { ascending: true }),
        supabase
          .from("orders")
          .select("id, order_number, total_amount, created_at, clients(business_name)")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase.from("clients").select("id, business_name, created_at").eq("active", true),
        supabase.from("client_employees").select("client_id"),
      ]);

      for (const p of payments.data ?? []) {
        tasks.push({
          id: `payment:${p.id}`,
          type: "payment_approval",
          priority: "action_required",
          title: "Payment approval required",
          description: `${(p as any).orders?.order_number ?? "Order"} — payment awaiting verification`,
          entity: (p as any).clients?.business_name ?? null,
          amount: Number(p.amount),
          created_at: p.submitted_at,
          status: "Action required",
          actionLabel: "Review payment",
          orderId: p.order_id,
        });
      }

      for (const o of orders.data ?? []) {
        tasks.push({
          id: `order:${o.id}`,
          type: "order_approval",
          priority: "pending",
          title: "Order approval pending",
          description: `${o.order_number} exceeded employee limits and needs your approval`,
          entity: (o as any).clients?.business_name ?? null,
          amount: Number(o.total_amount),
          created_at: o.created_at,
          status: "Pending",
          actionLabel: "Review order",
          orderId: o.id,
        });
      }

      const assigned = new Set((links.data ?? []).map((l: any) => l.client_id));
      for (const c of clients.data ?? []) {
        if (assigned.has(c.id)) continue;
        tasks.push({
          id: `assign:${c.id}`,
          type: "client_assignment",
          priority: "pending",
          title: "Client assignment pending",
          description: `${c.business_name} has no employee assigned`,
          entity: c.business_name,
          amount: null,
          created_at: c.created_at,
          status: "Pending",
          actionLabel: "Assign client",
          clientId: c.id,
          clientName: c.business_name,
        });
      }
    }

    if (role === "employee") {
      const [orders, myTasks, reminders, visits] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, total_amount, created_at, delivery_date, clients(business_name)")
          .eq("employee_id", userId)
          .in("status", [
            "confirmed",
            "change_requested",
            "client_rejected",
            "client_approved",
            "payment_submitted",
            "payment_verified",
            "out_for_delivery",
            "completed",
          ])
          .order("created_at", { ascending: true }),
        supabase
          .from("tasks")
          .select("id, title, description, due_date, status, created_at")
          .eq("employee_id", userId)
          .neq("status", "completed")
          .order("due_date", { ascending: true }),
        supabase
          .from("payment_reminders")
          .select("order_id, due_date, amount_due, credit_terms, status, stage")
          .eq("status", "pending"),
        supabase
          .from("field_visits")
          .select("id, visit_date, visit_time, purpose, location, priority, status, prospect_name, clients(business_name)")
          .eq("employee_id", userId)
          .in("status", ["pending", "assigned", "overdue"])
          .order("visit_date", { ascending: true }),
      ]);

      for (const v of visits.data ?? []) {
        const overdue = v.status === "overdue";
        tasks.push({
          id: `visit:${v.id}`,
          type: "field_visit",
          priority: overdue ? "overdue" : v.priority === "urgent" ? "action_required" : "pending",
          title: overdue ? "Field visit overdue" : "Field visit scheduled",
          description: `${v.purpose}${v.location ? ` — ${v.location}` : ""} on ${new Date(`${v.visit_date}T00:00:00`).toLocaleDateString("en-IN")}${v.visit_time ? ` ${String(v.visit_time).slice(0, 5)}` : ""}`,
          entity: (v as any).clients?.business_name ?? v.prospect_name ?? null,
          amount: null,
          created_at: `${v.visit_date}T00:00:00.000Z`,
          status: overdue ? "Overdue" : "Pending",
          actionLabel: "Open field visits",
          route: "/employee/field-visits",
        });
      }

      // Due-date context for delivered orders awaiting payment, taken from the
      // payment reminder rows (order delivery date + the client's credit terms).
      const dueByOrder = new Map<string, any>();
      for (const r of reminders.data ?? []) {
        dueByOrder.set(String(r.order_id), r);
      }

      for (const o of orders.data ?? []) {
        const client = (o as any).clients?.business_name ?? null;
        const base = {
          entity: client,
          amount: Number(o.total_amount),
          created_at: o.created_at,
          orderId: o.id,
        };
        if (o.status === "out_for_delivery") {
          tasks.push({
            ...base,
            id: `delivery:${o.id}`,
            type: "delivery_verification",
            priority: "action_required",
            title: "Delivery verification required",
            description: `${o.order_number} — enter the client's delivery code`,
            status: "Action required",
            actionLabel: "Verify delivery",
          });
        } else if (o.status === "client_approved" || o.status === "payment_verified") {
          tasks.push({
            ...base,
            id: `dispatch:${o.id}`,
            type: "dispatch",
            priority: "action_required",
            title: "Ready for delivery",
            description: `${o.order_number} — client accepted, mark it out for delivery`,
            status: "Action required",
            actionLabel: "Mark out for delivery",
          });
        } else if (o.status === "completed") {
          const rem = dueByOrder.get(o.id);
          const due = rem?.due_date ? new Date(rem.due_date) : null;
          const isOverdue = due ? due.getTime() < Date.now() : false;
          tasks.push({
            ...base,
            id: `collect:${o.id}`,
            type: "payment_follow_up",
            priority: isOverdue ? "overdue" : "action_required",
            amount: rem ? Number(rem.amount_due ?? base.amount) : base.amount,
            title: isOverdue ? "Payment overdue — follow up" : "Payment follow-up",
            description:
              `${o.order_number} — delivered. ` +
              (due
                ? `Due ${due.toLocaleDateString("en-IN")} (${rem?.credit_terms ?? 0}-day terms).`
                : "Collect payment from the client."),
            status: isOverdue ? "Overdue" : "Action required",
            actionLabel: "Open order",
          });
        } else if (o.status === "payment_submitted") {
          tasks.push({
            ...base,
            id: `awaitpay:${o.id}`,
            type: "payment_review",
            priority: "under_review",
            title: "Payment under verification",
            description: `${o.order_number} — waiting for admin verification`,
            status: "Under review",
            actionLabel: "View order",
          });
        } else {
          tasks.push({
            ...base,
            id: `submit:${o.id}`,
            type: "order_follow_up",
            priority: o.status === "client_rejected" ? "action_required" : "pending",
            title: o.status === "client_rejected" ? "Order rejected — follow up" : "Send order for client approval",
            description: `${o.order_number} — ${o.status === "change_requested" ? "client requested changes" : o.status === "client_rejected" ? "revise and resubmit" : "awaiting submission to the client"}`,
            status: o.status === "client_rejected" ? "Action required" : "Pending",
            actionLabel: "Open order",
          });
        }
      }

      const now = Date.now();
      for (const t of myTasks.data ?? []) {
        const overdue = t.due_date ? new Date(t.due_date).getTime() < now : false;
        tasks.push({
          id: `task:${t.id}`,
          type: "assigned_task",
          priority: overdue ? "overdue" : "pending",
          title: t.title,
          description: t.description ?? "Assigned task",
          entity: null,
          amount: null,
          created_at: t.created_at,
          status: overdue ? "Overdue" : "Pending",
          actionLabel: "Open tasks",
          route: "/employee/tasks",
        });
      }
    }

    if (role === "client") {
      const [orders, rejected] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, total_amount, created_at, clients(business_name)")
          .in("status", ["pending_client", "payment_pending", "payment_submitted", "out_for_delivery", "completed"])
          .order("created_at", { ascending: true }),
        supabase
          .from("order_payments")
          .select("id, order_id, rejection_reason, reviewed_at")
          .eq("status", "rejected")
          .order("reviewed_at", { ascending: false }),
      ]);

      const clientDues = new Map<string, any>();
      {
        const dueIds = (orders.data ?? [])
          .filter((o: any) => o.status === "completed" || o.status === "payment_pending")
          .map((o: any) => o.id);
        if (dueIds.length) {
          const rems = await supabase
            .from("payment_reminders")
            .select("order_id, due_date, amount_due, credit_terms")
            .in("order_id", dueIds);
          for (const r of rems.data ?? []) clientDues.set(String(r.order_id), r);
        }
      }

      const lastRejection = new Map<string, any>();
      for (const p of rejected.data ?? []) {
        if (!lastRejection.has(p.order_id)) lastRejection.set(p.order_id, p);
      }

      for (const o of orders.data ?? []) {
        const base = {
          entity: (o as any).clients?.business_name ?? null,
          amount: Number(o.total_amount),
          created_at: o.created_at,
          orderId: o.id,
        };
        if (o.status === "pending_client") {
          tasks.push({
            ...base,
            id: `accept:${o.id}`,
            type: "order_acceptance",
            priority: "action_required",
            title: "Order approval required",
            description: `${o.order_number} — review the items and accept or reject`,
            status: "Action required",
            actionLabel: "Review order",
          });
        } else if (o.status === "payment_pending" || o.status === "completed") {
          const rej = lastRejection.get(o.id);
          const rem = clientDues.get(o.id);
          const due = rem?.due_date ? new Date(rem.due_date) : null;
          const isOverdue = due ? due.getTime() < Date.now() : false;
          tasks.push({
            ...base,
            id: `pay:${o.id}`,
            type: rej ? "payment_resubmission" : "payment_submission",
            priority: isOverdue ? "overdue" : "action_required",
            title: rej
              ? "Payment rejected — resubmit proof"
              : isOverdue
                ? "Payment overdue"
                : "Payment required",
            description: rej
              ? `${o.order_number} — ${rej.rejection_reason ?? "payment proof was rejected"}`
              : due
                ? `${o.order_number} — delivered, payment due ${due.toLocaleDateString("en-IN")}`
                : `${o.order_number} — submit your payment proof`,
            status: isOverdue ? "Overdue" : "Action required",
            actionLabel: rej ? "Resubmit payment" : "Make payment",
          });
        } else if (o.status === "payment_submitted") {
          tasks.push({
            ...base,
            id: `verify:${o.id}`,
            type: "payment_review",
            priority: "under_review",
            title: "Payment under verification",
            description: `${o.order_number} — our team is verifying your payment`,
            status: "Under review",
            actionLabel: "View order",
          });
        } else {
          tasks.push({
            ...base,
            id: `otp:${o.id}`,
            type: "delivery_confirmation",
            priority: "pending",
            title: "Delivery on the way",
            description: `${o.order_number} — share your delivery code when the order arrives`,
            status: "Pending",
            actionLabel: "View code",
          });
        }
      }
    }

    tasks.sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return { role, tasks };
  });

/**
 * Completed activity for the signed-in user. Order events are RLS-scoped, so
 * clients only see their own orders and employees only their assigned ones.
 * Admins additionally get administrative audit entries.
 */
export const getActivityHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(300).default(100) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ role: string; items: ActivityItem[] }> => {
    const { supabase } = context;
    const role = await roleOf(context as any);

    const events = await supabase
      .from("order_events")
      .select("id, order_id, event, note, created_at, from_status, to_status, profiles:actor_id(name), orders(order_number, total_amount, clients(business_name))")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const items: ActivityItem[] = (events.data ?? []).map((e: any) => ({
      id: `evt:${e.id}`,
      title: prettyEvent(e.event),
      description: e.note ?? null,
      actor: e.profiles?.name ?? null,
      at: e.created_at,
      orderId: e.order_id,
      orderNumber: e.orders?.order_number ?? null,
      entity: e.orders?.clients?.business_name ?? null,
      amount: e.orders?.total_amount != null ? Number(e.orders.total_amount) : null,
      status: "Completed",
      route: null,
      source: "order",
    }));

    if (role === "admin") {
      const audit = await supabase
        .from("audit_logs")
        .select("id, action, module, status, remarks, created_at, target_type, target_id, profiles:actor_id(name)")
        .in("module", ["payments", "clients", "delivery"])
        .order("created_at", { ascending: false })
        .limit(data.limit);
      for (const a of audit.data ?? []) {
        items.push({
          id: `aud:${a.id}`,
          title: prettyEvent(String(a.action).replaceAll(".", " ")),
          description: (a as any).remarks ?? null,
          actor: (a as any).profiles?.name ?? null,
          at: a.created_at,
          orderId: a.target_type === "order" ? a.target_id : null,
          orderNumber: null,
          entity: a.module,
          amount: null,
          status: a.status === "success" ? "Completed" : "Failed",
          route: a.module === "payments" ? "/admin/payments" : a.module === "clients" ? "/admin/customers" : null,
          source: "audit",
        });
      }
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { role, items: items.slice(0, data.limit) };
  });
