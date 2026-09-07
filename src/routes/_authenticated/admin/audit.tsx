import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";
import { listAuditLogs } from "@/lib/reports.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDateTime, maskPhone } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Kredix" },
      { name: "description", content: "Enterprise audit trail for compliance, GST, and reconciliation." },
      { property: "og:title", content: "Audit log — Kredix" },
      { property: "og:description", content: "Enterprise audit trail for compliance, GST, and reconciliation." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Audit,
});

type Row = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  user_agent: string | null;
  module: string | null;
  status: string | null;
  remarks: string | null;
  actor_role: string | null;
  profiles?: { name?: string | null; email?: string | null; phone?: string | null } | null;
};

const CRITICAL = /delete|revoke|permission|role|failed|declin|cancel/i;

const inferModule = (r: Row): string => {
  if (r.module) return r.module;
  if (r.target_type) return r.target_type;
  const a = r.action?.toLowerCase() ?? "";
  if (a.includes("invoice")) return "invoices";
  if (a.includes("payment")) return "payments";
  if (a.includes("order")) return "orders";
  if (a.includes("client")) return "clients";
  if (a.includes("kyc")) return "clients";
  if (a.includes("login") || a.includes("logout")) return "auth";
  return "system";
};

const actionKind = (action: string): "create" | "update" | "delete" | "auth" | "other" => {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("remove")) return "delete";
  if (a.includes("create") || a.includes("insert") || a.includes("added")) return "create";
  if (a.includes("update") || a.includes("toggle") || a.includes("change")) return "update";
  if (a.includes("login") || a.includes("logout") || a.includes("signin") || a.includes("signout")) return "auth";
  return "other";
};

const kindClass = (k: string) => {
  switch (k) {
    case "create": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "update": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "delete": return "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20";
    case "auth":   return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    default:       return "bg-muted text-muted-foreground border-border";
  }
};

function toCSV(rows: Row[]): string {
  const headers = [
    "Timestamp","User Name","User Email","User Phone","Role","Action","Module",
    "Target Type","Record ID","Status","IP Address","User Agent","Remarks",
    "Previous Value","Updated Value",
  ];
  const esc = (v: any) => {
    const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) => [
    new Date(r.created_at).toISOString(),
    r.profiles?.name ?? "",
    r.profiles?.email ?? "",
    r.profiles?.phone ?? "",
    r.actor_role ?? "",
    r.action,
    inferModule(r),
    r.target_type ?? "",
    r.target_id ?? "",
    r.status ?? "success",
    r.ip_address ?? "",
    r.user_agent ?? "",
    r.remarks ?? "",
    r.old_value,
    r.new_value,
  ].map(esc).join(","));
  return [headers.map((h) => `"${h}"`).join(","), ...lines].join("\n");
}

function download(name: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZES = [25, 50, 100, 200];

function Audit() {
  const fn = useServerFn(listAuditLogs);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Date range is applied in the database so only the needed window is fetched.
  const { data = [], isLoading } = useQuery({
    queryKey: qk.audit(from, to),
    queryFn: () => fn({ data: { from: from || null, to: to || null } }),
  });
  const rows = data as Row[];


  const [role, setRole] = useState<string>("all");
  const [mod, setMod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);

  const moduleOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(inferModule(r)));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    const fromT = from ? new Date(from).getTime() : -Infinity;
    const toT = to ? new Date(to).getTime() + 864e5 : Infinity;
    const list = rows.filter((r) => {
      const t = new Date(r.created_at).getTime();
      if (t < fromT || t > toT) return false;
      if (role !== "all" && (r.actor_role ?? "") !== role) return false;
      if (mod !== "all" && inferModule(r) !== mod) return false;
      if (status !== "all" && (r.status ?? "success") !== status) return false;
      if (kind !== "all" && actionKind(r.action) !== kind) return false;
      if (qLower) {
        const hay = [
          r.action, r.target_type, r.target_id, r.ip_address, r.user_agent,
          r.remarks, r.module, r.profiles?.name, r.profiles?.email, r.profiles?.phone,
          JSON.stringify(r.old_value ?? ""), JSON.stringify(r.new_value ?? ""),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      const d = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortDesc ? d : -d;
    });
    return list;
  }, [rows, q, from, to, role, mod, status, kind, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stats = useMemo(() => {
    let critical = 0;
    const actors = new Set<string>();
    for (const r of filtered) {
      if (CRITICAL.test(r.action) || (r.status && r.status !== "success")) critical += 1;
      if (r.actor_id) actors.add(r.actor_id);
    }
    return { critical, actors: actors.size };
  }, [filtered]);

  const resetFilters = () => {
    setQ(""); setFrom(""); setTo(""); setRole("all"); setMod("all");
    setStatus("all"); setKind("all"); setPage(1);
  };

  const exportCsv = (all: boolean) => {
    const src = all ? rows : filtered;
    download(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(src));
  };

  const activeFilterCount = [q, from, to,
    role !== "all" ? role : "",
    mod !== "all" ? mod : "",
    status !== "all" ? status : "",
    kind !== "all" ? kind : "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Audit log</h1>
          <p className="text-sm text-muted-foreground">
            Immutable record of every system activity — for compliance, GST filing, and reconciliation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv(false)} className="gap-2">
            <Download className="h-4 w-4" /> Export filtered
          </Button>
          <Button variant="secondary" size="sm" onClick={() => exportCsv(true)} className="gap-2">
            <Download className="h-4 w-4" /> Export all
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total entries" value={rows.length} />
        <StatCard label="In view" value={filtered.length} />
        <StatCard
          label="Critical actions"
          value={stats.critical}
          tone="danger"
        />
        <StatCard
          label="Unique actors"
          value={stats.actors}
        />
      </div>

      {/* Search + filter toolbar */}
      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Search by user, action, record ID, order #, remarks…"
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              className="gap-2 sm:w-auto"
            >
              <Filter className="h-4 w-4" />
              Filters {activeFilterCount > 0 && <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterField label="From date">
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
              </FilterField>
              <FilterField label="To date">
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
              </FilterField>
              <FilterField label="Role">
                <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Module">
                <Select value={mod} onValueChange={(v) => { setMod(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    {moduleOptions.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Activity type">
                <Select value={kind} onValueChange={(v) => { setKind(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="auth">Auth</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Status">
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Page size">
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s} / page</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-3 py-3">
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSortDesc((s) => !s)}
                    >
                      When <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3">User</th>
                  <th className="py-3">Role</th>
                  <th className="py-3">Action</th>
                  <th className="py-3">Module</th>
                  <th className="py-3">Record ID</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 pr-4">IP</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Loading…</td></tr>}
                {!isLoading && paged.length === 0 && (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No matching entries</td></tr>
                )}
                {paged.map((r) => {
                  const k = actionKind(r.action);
                  const isOpen = !!expanded[r.id];
                  const critical = CRITICAL.test(r.action);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={`border-b border-border/60 transition-colors hover:bg-muted/30 ${critical ? "bg-red-500/[0.03]" : ""}`}
                      >
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                            className="rounded p-1 hover:bg-muted"
                            aria-label="Expand"
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{fmtDateTime(r.created_at)}</td>
                        <td className="py-3">
                          <div className="font-medium">{r.profiles?.name ?? "system"}</div>
                          <div className="text-xs text-muted-foreground">{r.profiles?.email ?? maskPhone(r.profiles?.phone) ?? "—"}</div>
                        </td>
                        <td className="py-3">
                          {r.actor_role ? <Badge variant="outline" className="capitalize">{r.actor_role}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="py-3">
                          <Badge variant="outline" className={`${kindClass(k)} capitalize`}>{r.action}</Badge>
                        </td>
                        <td className="py-3 text-xs capitalize text-muted-foreground">{inferModule(r)}</td>
                        <td className="py-3 font-mono text-xs">{r.target_id ? r.target_id.slice(0, 8) : "—"}</td>
                        <td className="py-3">
                          {(r.status ?? "success") === "success" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="h-3.5 w-3.5" /> <span className="text-xs">Success</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                              <ShieldAlert className="h-3.5 w-3.5" /> <span className="text-xs capitalize">{r.status}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{r.ip_address ?? "—"}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border/60 bg-muted/20">
                          <td colSpan={9} className="px-6 py-4">
                            <ExpandedDetails row={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked list */}
          <div className="divide-y divide-border md:hidden">
            {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && paged.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">No matching entries</div>
            )}
            {paged.map((r) => {
              const k = actionKind(r.action);
              const isOpen = !!expanded[r.id];
              return (
                <div key={r.id} className={`p-3 ${CRITICAL.test(r.action) ? "bg-red-500/[0.03]" : ""}`}>
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={`${kindClass(k)}`}>{r.action}</Badge>
                        {r.actor_role && <Badge variant="outline" className="capitalize text-xs">{r.actor_role}</Badge>}
                      </div>
                      <div className="mt-1 text-sm font-medium truncate">{r.profiles?.name ?? "system"}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{fmtDateTime(r.created_at)}</span>
                        <span className="capitalize">{inferModule(r)}</span>
                        {r.target_id && <span className="font-mono">{r.target_id.slice(0, 8)}</span>}
                      </div>
                    </div>
                    {isOpen ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}
                  </button>
                  {isOpen && <div className="mt-3"><ExpandedDetails row={r} /></div>}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Showing {(paged.length && (currentPage - 1) * pageSize + 1) || 0}–
              {(currentPage - 1) * pageSize + paged.length} of {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${tone === "danger" && value > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
          {value.toLocaleString("en-IN")}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ExpandedDetails({ row }: { row: Row }) {
  const fields: [string, React.ReactNode][] = [
    ["Timestamp", <span className="font-mono">{new Date(row.created_at).toISOString()}</span>],
    ["User", `${row.profiles?.name ?? "—"} (${row.profiles?.email ?? maskPhone(row.profiles?.phone) ?? "—"})`],
    ["Role", row.actor_role ?? "—"],
    ["Action", row.action],
    ["Module", row.module ?? "—"],
    ["Target type", row.target_type ?? "—"],
    ["Record ID", <span className="font-mono text-xs">{row.target_id ?? "—"}</span>],
    ["Status", row.status ?? "success"],
    ["IP address", row.ip_address ?? "—"],
    ["Device / User agent", <span className="text-xs">{row.user_agent ?? "—"}</span>],
    ["Remarks", row.remarks ?? "—"],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {fields.map(([k, v]) => (
          <div key={k} className="flex flex-col sm:flex-row sm:gap-2">
            <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
            <span className="min-w-0 break-words">{v}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <JsonBlock title="Previous value" value={row.old_value} />
        <JsonBlock title="Updated value" value={row.new_value} />
      </div>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: any }) {
  const has = value != null && !(typeof value === "object" && Object.keys(value).length === 0);
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
        {has ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
