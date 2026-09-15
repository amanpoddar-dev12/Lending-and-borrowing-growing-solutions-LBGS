import { createFileRoute } from "@tanstack/react-router";
import { OrdersTable } from "@/routes/_authenticated/admin/orders";

export const Route = createFileRoute("/_authenticated/employee/orders/")({
  head: () => ({
    meta: [
      { title: "My orders — LBGS" },
      { name: "description", content: "Track orders you punched and their client approval status." },
      { property: "og:title", content: "My orders — LBGS" },
      { property: "og:description", content: "Track orders you punched and their client approval status." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OrdersTable scope="employee" />,
});
