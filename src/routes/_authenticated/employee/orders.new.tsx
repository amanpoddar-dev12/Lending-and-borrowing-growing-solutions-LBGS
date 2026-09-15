import { createFileRoute } from "@tanstack/react-router";
import { NewOrderForm } from "@/components/orders/new-order-form";

export const Route = createFileRoute("/_authenticated/employee/orders/new")({
  head: () => ({
    meta: [
      { title: "New order — LBGS" },
      { name: "description", content: "Punch a new order on behalf of a client." },
      { property: "og:title", content: "New order — LBGS" },
      { property: "og:description", content: "Punch a new order on behalf of a client." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewOrderForm,
});
