import { createFileRoute } from "@tanstack/react-router";
import { OrdersTable } from "@/routes/_authenticated/admin/orders";

export const Route = createFileRoute("/_authenticated/admin/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Kredix" },
      { name: "description", content: "All orders across clients and employees." },
      { property: "og:title", content: "Orders — Kredix" },
      { property: "og:description", content: "All orders across clients and employees." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OrdersTable scope="admin" />,
});
