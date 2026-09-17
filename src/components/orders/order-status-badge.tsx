import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const styles: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  pending_client: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  client_approved: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  client_rejected: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-400",
  confirmed: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  declined: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-400",
  change_requested: "bg-purple-500/15 text-purple-600 ring-purple-500/30 dark:text-purple-400",
  invoiced: "bg-indigo-500/15 text-indigo-600 ring-indigo-500/30 dark:text-indigo-400",
  paid: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  payment_pending: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
  payment_submitted: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-400",
  payment_verified: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400",
  out_for_delivery: "bg-indigo-500/15 text-indigo-600 ring-indigo-500/30 dark:text-indigo-400",
  completed: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-400",
};

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
        styles[status] ?? "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {t(`orderStatus.${status}`, { defaultValue: status })}
    </span>
  );
}
