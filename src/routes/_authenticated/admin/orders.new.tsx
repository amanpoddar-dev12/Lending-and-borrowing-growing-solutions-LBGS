import { createFileRoute } from "@tanstack/react-router";
import { NewOrderForm } from "@/components/orders/new-order-form";

export const Route = createFileRoute("/_authenticated/admin/orders/new")({
  head: () => ({
    meta: [
      { title: "New order — LBGS" },
      { name: "description", content: "Create an order on behalf of a client as an administrator." },
      { property: "og:title", content: "New order — LBGS" },
      { property: "og:description", content: "Create an order on behalf of a client as an administrator." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewOrderForm,
});
