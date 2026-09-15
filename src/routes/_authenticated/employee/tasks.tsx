import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, updateTaskStatus } from "@/lib/tasks.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";
import { invalidateFor, patchListRow } from "@/lib/query-mutations";

export const Route = createFileRoute("/_authenticated/employee/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — LBGS" },
      { name: "description", content: "Your assigned tasks and their status." },
      { property: "og:title", content: "Tasks — LBGS" },
      { property: "og:description", content: "Your assigned tasks and their status." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Tasks,
});

function Tasks() {
  const listFn = useServerFn(listTasks);
  const updFn = useServerFn(updateTaskStatus);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: qk.tasks, queryFn: () => listFn() });
  const upd = useMutation({
    mutationFn: (v: any) => updFn({ data: v }),
    // Optimistic: task status is a simple, safe field to flip locally.
    onMutate: async (v: any) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const prev = patchListRow<any>(qc, qk.tasks, v.id, { status: v.status });
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(qk.tasks as unknown as unknown[], ctx.prev);
      toast.error(e?.message ?? "Failed to update task");
    },
    onSuccess: () => toast.success("Updated"),
    onSettled: () => invalidateFor(qc, "task"),
  });

  const groups = { todo: [] as any[], in_progress: [] as any[], completed: [] as any[] };
  data.forEach((t: any) => groups[t.status as keyof typeof groups]?.push(t));

  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-xl font-semibold sm:text-2xl">Tasks</h1></div>
      <div className="grid gap-4 md:grid-cols-3">
        {(["todo", "in_progress", "completed"] as const).map((col) => (
          <div key={col} className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{col.replace("_", " ")}</div>
            {groups[col].length === 0 && <p className="text-xs text-muted-foreground">Empty</p>}
            {groups[col].map((t) => (
              <Card key={t.id}><CardContent className="p-3 space-y-2">
                <div className="font-medium text-sm">{t.title}</div>
                {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                {t.due_date && <div className="text-xs text-muted-foreground">Due {fmtDateTime(t.due_date)}</div>}
                <div className="flex gap-1">
                  {col !== "in_progress" && <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: t.id, status: "in_progress" })}>Start</Button>}
                  {col !== "completed" && <Button size="sm" onClick={() => upd.mutate({ id: t.id, status: "completed" })}>Complete</Button>}
                </div>
              </CardContent></Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
