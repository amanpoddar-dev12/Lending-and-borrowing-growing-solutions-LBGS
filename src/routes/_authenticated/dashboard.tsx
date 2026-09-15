import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/me.functions";
import { AdminOverview } from "@/components/dashboards/admin-overview";
import { EmployeeOverview } from "@/components/dashboards/employee-overview";
import { ClientOverview } from "@/components/dashboards/client-overview";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LBGS" },
      { name: "description", content: "Your LBGS workspace overview." },
      { property: "og:title", content: "Dashboard — LBGS" },
      { property: "og:description", content: "Your LBGS workspace overview." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useSuspenseQuery({ queryKey: qk.me, queryFn: () => getMe() });
  // Key by userId so switching accounts fully remounts the correct overview
  // rather than letting a stale role's component fire a forbidden server fn.
  if (me.role === "admin") return <AdminOverview key={me.userId} />;
  if (me.role === "employee") return <EmployeeOverview key={me.userId} />;
  return <ClientOverview key={me.userId} />;
}
