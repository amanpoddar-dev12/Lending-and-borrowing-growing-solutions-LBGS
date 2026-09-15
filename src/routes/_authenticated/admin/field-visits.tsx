import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listFieldVisits,
  listFieldVisitEvents,
  upsertFieldVisit,
  setFieldVisitStatus,
  refreshOverdueFieldVisits,
  FIELD_VISIT_PRIORITIES,
  FIELD_VISIT_STATUSES,
} from "@/lib/field-visits.functions";
import { listEmployees } from "@/lib/employees.functions";
import { listClients } from "@/lib/clients.functions";
import { qk } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { VisitPriorityBadge, VisitStatusBadge, visitTarget, visitWhen } from "@/components/field-visits/field-visit-bits";
import { VoiceNotePlayer } from "@/components/field-visits/voice-note-player";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/field-visits")({
  head: () => ({
    meta: [
      { title: "Field visits — LBGS" },
      { name: "description", content: "Assign and track employee field-visit reminders." },
      { property: "og:title", content: "Field visits — LBGS" },
      { property: "og:description", content: "Assign and track employee field-visit reminders." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FieldVisitsPage,
});

const NONE = "__none__";

/** listEmployees returns employee_profiles rows with the profile embedded. */
const empName = (e: any) => e?.profiles?.name ?? e?.profiles?.email ?? e?.name ?? e?.email ?? "Unnamed employee";

type FormState = {
  id: string | null;
  employee_id: string;
  client_id: string;
  prospect_name: string;
  visit_date: string;
  visit_time: string;
  location: string;
  purpose: string;
  instructions: string;
  priority: string;
};

const emptyForm = (): FormState => ({
  id: null,
  employee_id: NONE,
  client_id: NONE,
  prospect_name: "",
  visit_date: new Date().toISOString().slice(0, 10),
  visit_time: "",
  location: "",
  purpose: "",
  instructions: "",
  priority: "medium",
});

function FieldVisitsPage() {
  const listFn = useServerFn(listFieldVisits);
  const empFn = useServerFn(listEmployees);
  const clientFn = useServerFn(listClients);
  const saveFn = useServerFn(upsertFieldVisit);
  const statusFn = useServerFn(setFieldVisitStatus);
  const overdueFn = useServerFn(refreshOverdueFieldVisits);
  const qc = useQueryClient();

  const visits = useQuery({ queryKey: qk.fieldVisits, queryFn: () => listFn() });
  const employees = useQuery({ queryKey: qk.employees, queryFn: () => empFn() });
  const clients = useQuery({ queryKey: qk.clients, queryFn: () => clientFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [historyFor, setHistoryFor] = useState<any | null>(null);
  const [closing, setClosing] = useState<{ visit: any; status: "completed" | "cancelled" } | null>(null);
  const [closeNote, setCloseNote] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.fieldVisits });
    qc.invalidateQueries({ queryKey: qk.notifications });
  };

  const save = useMutation({
    mutationFn: (v: FormState) =>
      saveFn({
        data: {
          id: v.id,
          employee_id: v.employee_id === NONE ? null : v.employee_id,
          client_id: v.client_id === NONE ? null : v.client_id,
          prospect_name: v.prospect_name || undefined,
          visit_date: v.visit_date,
          visit_time: v.visit_time || undefined,
          location: v.location || undefined,
          purpose: v.purpose,
          instructions: v.instructions || undefined,
          priority: v.priority as any,
        },
      }),
    onSuccess: () => {
      toast.success(form.id ? "Field visit updated" : "Field visit assigned");
      setOpen(false);
      setForm(emptyForm());
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the visit"),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: "completed" | "cancelled" | "assigned"; note?: string }) =>
      statusFn({ data: v }),
    onSuccess: () => {
      toast.success("Visit updated");
      setClosing(null);
      setCloseNote("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the visit"),
  });

  const scanOverdue = useMutation({
    mutationFn: () => overdueFn(),
    onSuccess: (r: any) => {
      toast.success(r.flagged ? `${r.flagged} visit(s) marked overdue` : "No overdue visits");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = useMemo(() => {
    const all = (visits.data ?? []) as any[];
    return all.filter(
      (v) =>
        (statusFilter === "all" || v.status === statusFilter) &&
        (employeeFilter === "all" || v.employee_id === employeeFilter),
    );
  }, [visits.data, statusFilter, employeeFilter]);

  const openEdit = (v: any) => {
    setForm({
      id: v.id,
      employee_id: v.employee_id ?? NONE,
      client_id: v.client_id ?? NONE,
      prospect_name: v.prospect_name ?? "",
      visit_date: v.visit_date,
      visit_time: v.visit_time ? String(v.visit_time).slice(0, 5) : "",
      location: v.location ?? "",
      purpose: v.purpose ?? "",
      instructions: v.instructions ?? "",
      priority: v.priority ?? "medium",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Field visits</h1>
          <p className="text-sm text-muted-foreground">Assign visit reminders to employees and track their outcome.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => scanOverdue.mutate()} disabled={scanOverdue.isPending}>
            {scanOverdue.isPending ? "Checking…" : "Check overdue"}
          </Button>
          <Button onClick={() => { setForm(emptyForm()); setOpen(true); }}>Assign visit</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {FIELD_VISIT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {(employees.data ?? []).map((e: any) => (
              <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{rows.length} visit(s)</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {visits.isLoading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No field visits match these filters.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 p-3 md:hidden">
                {rows.map((v) => (
                  <div key={v.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{visitTarget(v)}</div>
                        <div className="text-xs text-muted-foreground">{visitWhen(v)} · {v.purpose}</div>
                      </div>
                      <VisitStatusBadge status={v.status} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <VisitPriorityBadge priority={v.priority} />
                      <span>{v.profiles?.name ?? "Unassigned"}</span>
                    </div>
                    {v.voice_note_path && <VoiceNotePlayer path={v.voice_note_path} />}
                    <VisitActions v={v} onEdit={openEdit} onClose={(s) => setClosing({ visit: v, status: s })}
                      onReopen={() => changeStatus.mutate({ id: v.id, status: "assigned" })} onHistory={() => setHistoryFor(v)} />
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client / prospect</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="min-w-[220px]">
                          <div className="font-medium">{visitTarget(v)}</div>
                          {v.location && <div className="text-xs text-muted-foreground">{v.location}</div>}
                          {v.voice_note_path && <div className="mt-2"><VoiceNotePlayer path={v.voice_note_path} /></div>}
                        </TableCell>
                        <TableCell>{v.profiles?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell className="whitespace-nowrap">{visitWhen(v)}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{v.purpose}</TableCell>
                        <TableCell><VisitPriorityBadge priority={v.priority} /></TableCell>
                        <TableCell><VisitStatusBadge status={v.status} /></TableCell>
                        <TableCell className="text-right">
                          <VisitActions v={v} onEdit={openEdit} onClose={(s) => setClosing({ visit: v, status: s })}
                            onReopen={() => changeStatus.mutate({ id: v.id, status: "assigned" })} onHistory={() => setHistoryFor(v)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit field visit" : "Assign field visit"}</DialogTitle>
            <DialogDescription>The employee is notified as soon as the visit is saved.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned (pending)</SelectItem>
                  {(employees.data ?? []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Prospect (not a client yet)</SelectItem>
                  {(clients.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.business_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.client_id === NONE && (
              <div className="grid gap-1.5">
                <Label>Prospect name</Label>
                <Input value={form.prospect_name} onChange={(e) => setForm((f) => ({ ...f, prospect_name: e.target.value }))}
                  placeholder="e.g. Sharma Traders" />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Visit date</Label>
                <Input type="date" value={form.visit_date} onChange={(e) => setForm((f) => ({ ...f, visit_date: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Time (optional)</Label>
                <Input type="time" value={form.visit_time} onChange={(e) => setForm((f) => ({ ...f, visit_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Shop address / area" />
            </div>
            <div className="grid gap-1.5">
              <Label>Purpose</Label>
              <Input value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="e.g. Payment collection" />
            </div>
            <div className="grid gap-1.5">
              <Label>Instructions / notes</Label>
              <Textarea rows={3} value={form.instructions} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_VISIT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={save.isPending || !form.purpose.trim() || !form.visit_date ||
                (form.client_id === NONE && !form.prospect_name.trim())}
            >
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Assign visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete / cancel */}
      <Dialog open={!!closing} onOpenChange={(o) => { if (!o) { setClosing(null); setCloseNote(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{closing?.status === "completed" ? "Complete visit" : "Cancel visit"}</DialogTitle>
            <DialogDescription>
              {closing ? `${visitTarget(closing.visit)} · ${visitWhen(closing.visit)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={closeNote} onChange={(e) => setCloseNote(e.target.value)}
            placeholder={closing?.status === "completed" ? "Outcome notes (optional)" : "Reason for cancelling"} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>Back</Button>
            <Button
              variant={closing?.status === "cancelled" ? "destructive" : "default"}
              disabled={changeStatus.isPending}
              onClick={() => closing && changeStatus.mutate({ id: closing.visit.id, status: closing.status, note: closeNote || undefined })}
            >
              {changeStatus.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VisitHistoryDialog visit={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function VisitActions({
  v, onEdit, onClose, onReopen, onHistory,
}: {
  v: any;
  onEdit: (v: any) => void;
  onClose: (s: "completed" | "cancelled") => void;
  onReopen: () => void;
  onHistory: () => void;
}) {
  const closed = v.status === "completed" || v.status === "cancelled";
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={onHistory}>History</Button>
      {!closed && <Button size="sm" variant="outline" onClick={() => onEdit(v)}>Edit</Button>}
      {!closed && <Button size="sm" onClick={() => onClose("completed")}>Complete</Button>}
      {!closed && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onClose("cancelled")}>Cancel</Button>}
      {closed && <Button size="sm" variant="outline" onClick={onReopen}>Reopen</Button>}
    </div>
  );
}

function VisitHistoryDialog({ visit, onClose }: { visit: any | null; onClose: () => void }) {
  const eventsFn = useServerFn(listFieldVisitEvents);
  const { data = [], isLoading } = useQuery({
    queryKey: qk.fieldVisitEvents(visit?.id ?? null),
    queryFn: () => eventsFn({ data: { visitId: visit!.id } }),
    enabled: !!visit,
  });
  return (
    <Dialog open={!!visit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reminder history</DialogTitle>
          <DialogDescription>{visit ? `${visitTarget(visit)} · ${visit.purpose}` : ""}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ul className="space-y-2">
            {(data as any[]).map((e) => (
              <li key={e.id} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{String(e.event).replaceAll("_", " ")}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtDateTime(e.created_at)}{e.profiles?.name ? ` · ${e.profiles.name}` : ""}
                </div>
                {e.note && <div className="mt-1 text-xs">{e.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
