/**
 * Canonical TanStack Query keys.
 *
 * Every feature reads and invalidates data through these keys so there is a
 * single cache entry per logical resource (no competing implementations).
 * Keys are prefix-structured: invalidating ["orders"] also drops ["orders", id].
 */
export const qk = {
  me: ["me"] as const,
  userSettings: ["user-settings"] as const,
  profileCompletion: ["profile-completion"] as const,

  clients: ["clients"] as const,
  creditRequests: ["credit-requests"] as const,
  creditPurseHistory: (clientId?: string) =>
    clientId ? (["credit-purse-history", clientId] as const) : (["credit-purse-history"] as const),
  clientAssignments: (clientId?: string) =>
    clientId ? (["client-assignments", clientId] as const) : (["client-assignments"] as const),

  employees: ["employees"] as const,
  employeePermissions: ["employee-permissions"] as const,
  payslips: (employeeId?: string) =>
    employeeId ? (["payslips", employeeId] as const) : (["payslips"] as const),
  myPayslips: ["my-payslips"] as const,
  employeeActivity: ["employee-activity"] as const,
  admins: ["admins"] as const,

  duty: ["duty"] as const,
  locations: ["locations"] as const,
  locationHistory: (employeeId: string) => ["location-history", employeeId] as const,

  orders: ["orders"] as const,
  orderWorkflow: (orderId: string | null) => ["order-workflow", orderId] as const,
  orderDelivery: (orderId: string | null) => ["order-delivery", orderId] as const,

  payments: ["payments"] as const,
  ledger: ["ledger"] as const,
  products: ["products"] as const,

  notifications: ["notifications"] as const,
  tasks: ["tasks"] as const,
  fieldVisits: ["field-visits"] as const,
  fieldVisitEvents: (visitId: string | null) =>
    visitId ? (["field-visit-events", visitId] as const) : (["field-visit-events"] as const),
  pendingTasks: ["pending-tasks"] as const,
  activityHistory: (limit?: number) =>
    limit == null ? (["activity-history"] as const) : (["activity-history", limit] as const),

  adminReports: ["admin-reports"] as const,
  analytics: (filters: Record<string, unknown>) => ["analytics", filters] as const,
  audit: (from = "", to = "") => ["audit", from, to] as const,
} as const;

/** Root segment -> staleTime (ms). Applied via queryClient.setQueryDefaults. */
export const STALE_TIMES: Array<[readonly unknown[], number]> = [
  // Identity / config: rarely changes.
  [["me"], 15 * 60_000],
  [["user-settings"], 15 * 60_000],
  [["profile-completion"], 10 * 60_000],
  [["admins"], 10 * 60_000],
  [["products"], 15 * 60_000],

  // Slow-moving business records.
  [["clients"], 45_000],
  [["credit-purse-history"], 45_000],
  [["client-assignments"], 5 * 60_000],
  [["employees"], 5 * 60_000],

  // Live-ish operational data.
  [["orders"], 45_000],
  [["order-workflow"], 30_000],
  [["order-delivery"], 30_000],
  [["payments"], 45_000],
  [["ledger"], 60_000],
  [["duty"], 60_000],
  [["locations"], 60_000],
  [["location-history"], 60_000],
  [["employee-activity"], 30_000],

  // Alert surfaces.
  [["notifications"], 20_000],
  [["pending-tasks"], 20_000],
  [["tasks"], 30_000],
  [["field-visits"], 30_000],
  [["field-visit-events"], 60_000],

  // Reports / history.
  [["activity-history"], 2 * 60_000],
  [["admin-reports"], 2 * 60_000],
  [["analytics"], 2 * 60_000],
  [["audit"], 2 * 60_000],
];

/** staleTime for a key, used when prefetching so warm-ups match the cache policy. */
export function staleTimeFor(key: readonly unknown[]): number {
  const root = key[0];
  const hit = STALE_TIMES.find(([k]) => k[0] === root);
  return hit ? hit[1] : 30_000;
}
