import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { downloadCsv } from "@/lib/csv";

export type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
  value?: (row: T) => string | number;
  sortable?: boolean;
};

/**
 * Shared analytics table: search, sort, paginate and CSV export of the
 * currently filtered rows (so exports always match what's on screen).
 */
export function DataTable<T extends Record<string, any>>({
  rows, columns, exportName, pageSize = 10, emptyLabel = "No data for this period",
}: {
  rows: T[];
  columns: Column<T>[];
  exportName: string;
  pageSize?: number;
  emptyLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  const raw = (row: T, c: Column<T>) => (c.value ? c.value(row) : row[c.key]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows;
    if (needle) {
      out = rows.filter((r) => columns.some((c) => String(raw(r, c) ?? "").toLowerCase().includes(needle)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const av = raw(a, col), bv = raw(b, col);
          const cmp = typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av ?? "").localeCompare(String(bv ?? ""));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search"
            className="h-9 pl-8"
            aria-label={`Search ${exportName}`}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              exportName,
              filtered.map((r) => Object.fromEntries(columns.map((c) => [c.label, raw(r, c) ?? ""]))),
            )
          }
        >
          <Download className="mr-1.5 size-4" /> Export
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={`pb-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                  {c.sortable === false ? c.label : (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() =>
                        setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "desc" }))
                      }
                    >
                      {c.label}
                      {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={columns.length} className="py-8 text-center text-muted-foreground">{emptyLabel}</td></tr>
            )}
            {slice.map((r, i) => (
              <tr key={r.id ?? i} className="border-b border-border/60 last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={`py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.render ? c.render(r) : String(raw(r, c) ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} rows</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="size-7" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span>{current + 1} / {pages}</span>
            <Button variant="outline" size="icon" className="size-7" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
