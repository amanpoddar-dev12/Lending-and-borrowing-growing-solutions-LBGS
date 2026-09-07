import type { QueryClient } from "@tanstack/react-query";
import { qk, staleTimeFor } from "@/lib/query-keys";
import { listClients } from "@/lib/clients.functions";
import { listEmployees, listEmployeeActivity } from "@/lib/employees.functions";
import { listOrders } from "@/lib/orders.functions";
import { listProducts } from "@/lib/products.functions";
import { listEmployeeLatestLocations, getMyDutyStatus } from "@/lib/duty.functions";
import { listAuditLogs, adminReports } from "@/lib/reports.functions";
import { listTasks } from "@/lib/tasks.functions";
import { getClientLedger } from "@/lib/ledger.functions";
import { getUserSettings } from "@/lib/user-settings.functions";

type Entry = { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> };

const clients: Entry = { queryKey: qk.clients, queryFn: () => listClients() as any };
const orders: Entry = { queryKey: qk.orders, queryFn: () => listOrders() as any };
const products: Entry = { queryKey: qk.products, queryFn: () => listProducts() as any };

const map: Record<string, Entry[]> = {
  "/admin/analytics": [clients],
  "/admin/customers": [clients],
  "/admin/credit": [clients],
  "/admin/employees": [{ queryKey: qk.employees, queryFn: () => listEmployees() as any }],
  "/admin/activity": [{ queryKey: qk.employeeActivity, queryFn: () => listEmployeeActivity() as any }],
  "/admin/orders": [orders],
  "/admin/products": [products],
  "/admin/locations": [{ queryKey: qk.locations, queryFn: () => listEmployeeLatestLocations() as any }],
  "/admin/audit": [{ queryKey: qk.audit(), queryFn: () => listAuditLogs({ data: { from: null, to: null } }) as any }],
  "/employee/clients": [clients],
  "/employee/orders/new": [clients, products],
  "/admin/orders/new": [clients, products],
  "/employee/orders": [orders],
  "/employee/tasks": [{ queryKey: qk.tasks, queryFn: () => listTasks() as any }],
  "/employee/duty": [{ queryKey: qk.duty, queryFn: () => getMyDutyStatus() as any }],
  "/client/orders": [orders],
  "/client/ledger": [{ queryKey: qk.ledger, queryFn: () => getClientLedger({ data: {} }) as any }],
  "/client/profile": [clients],
  "/settings": [{ queryKey: qk.userSettings, queryFn: () => getUserSettings() as any }],
};

const dashboardByRole: Record<string, Entry[]> = {
  admin: [{ queryKey: qk.adminReports, queryFn: () => adminReports() as any }],
  employee: [
    { queryKey: qk.duty, queryFn: () => getMyDutyStatus() as any },
    { queryKey: qk.tasks, queryFn: () => listTasks() as any },
    orders,
  ],
  client: [
    { queryKey: qk.ledger, queryFn: () => getClientLedger({ data: {} }) as any },
    orders,
  ],
};

/** Warm the TanStack Query cache for the data a route will render. */
export function prefetchRouteData(qc: QueryClient, url: string, role?: string) {
  const entries = url === "/dashboard" ? dashboardByRole[role ?? ""] ?? [] : map[url] ?? [];
  for (const e of entries) {
    void qc.prefetchQuery({ ...e, staleTime: staleTimeFor(e.queryKey) });
  }
}
