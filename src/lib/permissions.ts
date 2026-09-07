/**
 * Granular employee permissions.
 *
 * Admins implicitly hold every permission. Employees hold exactly the keys
 * stored in `public.employee_permissions`; the database helper
 * `has_employee_permission()` is the single source of truth and is enforced in
 * RLS policies, workflow RPCs, server functions and the UI.
 */
export const EMPLOYEE_PERMISSIONS = [
  { key: "orders.view", label: "View orders", hint: "See orders, order history and order details" },
  { key: "orders.create", label: "Create orders", hint: "Punch new orders, including document scanning" },
  { key: "orders.edit", label: "Edit orders", hint: "Change notes, delivery date and other order details" },
  { key: "orders.delete", label: "Delete / cancel orders", hint: "Withdraw or cancel an order" },
  { key: "orders.approve", label: "Submit, dispatch & verify delivery", hint: "Send for client approval, mark out for delivery, verify delivery OTP" },
  { key: "payments.manage", label: "Manage payments", hint: "Record or modify payment information" },
  { key: "clients.manage", label: "Manage client information", hint: "Create and edit client business details" },
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: EmployeePermission[] = EMPLOYEE_PERMISSIONS.map((p) => p.key);

/** Read-only preset from the spec: can look, cannot touch. */
export const READ_ONLY_PRESET: EmployeePermission[] = ["orders.view"];

export function permissionLabel(key: string) {
  return EMPLOYEE_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}
