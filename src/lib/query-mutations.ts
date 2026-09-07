import type { QueryClient } from "@tanstack/react-query";
import { qk } from "./query-keys";

/**
 * Scoped cache invalidation for mutations.
 *
 * Each scope lists ONLY the queries a mutation can actually affect, so an
 * action never refetches unrelated data (products, other clients, reports…).
 * Business rules and workflows are untouched — this only controls refetching.
 */
export type MutationScope =
  | "order"
  | "orderReview"
  | "payment"
  | "delivery"
  | "client"
  | "clientAssignment"
  | "product"
  | "task"
  | "fieldVisit"
  | "notification"
  | "employee"
  | "duty"
  | "settings";

export function invalidateFor(
  qc: QueryClient,
  scope: MutationScope,
  ids?: { orderId?: string | null; clientId?: string | null },
) {
  const keys: Array<readonly unknown[]> = [];
  const orderId = ids?.orderId ?? null;

  switch (scope) {
    case "order":
      keys.push(qk.orders, qk.pendingTasks, qk.activityHistory(), qk.adminReports);
      if (orderId) keys.push(qk.orderWorkflow(orderId), qk.orderDelivery(orderId));
      break;
    case "orderReview":
      keys.push(qk.orders, qk.pendingTasks, qk.activityHistory(), qk.notifications);
      if (orderId) keys.push(qk.orderWorkflow(orderId), qk.orderDelivery(orderId));
      break;
    case "payment":
    case "delivery":
      keys.push(
        qk.orders,
        qk.payments,
        qk.pendingTasks,
        qk.notifications,
        qk.activityHistory(),
        qk.adminReports,
      );
      if (orderId) keys.push(qk.orderWorkflow(orderId), qk.orderDelivery(orderId));
      break;
      break;
    case "client":
      keys.push(qk.clients, qk.creditRequests, qk.notifications, qk.pendingTasks);
      break;
    case "clientAssignment":
      keys.push(qk.clients, qk.clientAssignments(), qk.pendingTasks);
      if (ids?.clientId) keys.push(qk.clientAssignments(ids.clientId));
      break;
    case "product":
      keys.push(qk.products);
      break;
    case "fieldVisit":
      keys.push(qk.fieldVisits, qk.fieldVisitEvents(null), qk.notifications, qk.pendingTasks);
      break;
    case "task":
      keys.push(qk.tasks, qk.pendingTasks, qk.activityHistory());
      break;
    case "notification":
      keys.push(qk.notifications);
      break;
    case "employee":
      keys.push(qk.employees, qk.employeeActivity, qk.employeePermissions);
      break;
    case "duty":
      keys.push(qk.duty);
      break;
    case "settings":
      keys.push(qk.userSettings);
      break;
  }

  for (const key of keys) qc.invalidateQueries({ queryKey: key as unknown[] });
}

/** Optimistically patch one row inside a cached list query. */
export function patchListRow<T extends { id: string }>(
  qc: QueryClient,
  key: readonly unknown[],
  id: string,
  patch: Partial<T>,
) {
  const prev = qc.getQueryData<T[]>(key as unknown[]);
  if (Array.isArray(prev)) {
    qc.setQueryData<T[]>(
      key as unknown[],
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  return prev;
}
