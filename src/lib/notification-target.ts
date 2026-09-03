/**
 * Maps a notification to the screen/record it refers to.
 *
 * Order-shaped notifications (order, order_approval, payment, delivery) carry
 * the order id in reference_id and open the order slide-over in place. The
 * remaining types fall back to the role-scoped list screen for the record.
 */
export type NotificationTarget = { orderId: string } | { route: string } | null;

const ORDER_TYPES = new Set(["order", "order_approval", "payment", "delivery", "order_update"]);

export function notificationTarget(
  n: { type?: string | null; reference_id?: string | null },
  role: "admin" | "employee" | "client" | undefined,
): NotificationTarget {
  const type = (n.type ?? "").toLowerCase();
  const ref = n.reference_id ?? null;

  if (ORDER_TYPES.has(type) && ref) return { orderId: ref };

  switch (type) {
    case "invoice":
      return { route: role === "client" ? "/client/invoices" : "/admin/invoices" };
    case "field_visit":
      return { route: role === "employee" ? "/employee/field-visits" : "/admin/field-visits" };
    case "credit_approval":
      return { route: role === "client" ? "/client/profile" : "/admin/credit" };
    case "task":
      return role === "employee" ? { route: "/employee/tasks" } : null;
    case "payment_reminder":
      return { route: role === "client" ? "/client/ledger" : "/admin/payments" };
    default:
      return ref ? { orderId: ref } : null;
  }
}
