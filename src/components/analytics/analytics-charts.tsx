import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { inr } from "@/lib/format";

/**
 * All analytics charts live in one lazily-loaded chunk so the KPI grid and
 * tables paint before the charting library arrives. Colours come from the
 * theme tokens, so every chart works in light and dark mode.
 */

export const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const axis = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, stroke: "var(--border)" };
const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--popover-foreground)",
    fontSize: 12,
  },
} as const;

const compact = (v: number) =>
  new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v ?? 0));

export function RevenueAreaChart({ data, onSelect }: { data: any[]; onSelect?: (bucket: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} onClick={(e: any) => e?.activeLabel && onSelect?.(e.activeLabel)}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any, n: any) => [n === "orders" ? v : inr(v), n]} />
        <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#revFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function OrdersBarChart({ data, onSelect }: { data: any[]; onSelect?: (bucket: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} onClick={(e: any) => e?.activeLabel && onSelect?.(e.activeLabel)}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis {...axis} allowDecimals={false} width={40} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="orders" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ComparisonChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any) => inr(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" name="Current" dataKey="current" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
        <Line type="monotone" name="Previous" dataKey="previous" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AovLineChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip {...tooltipStyle} formatter={(v: any) => inr(v)} />
        <Line type="monotone" dataKey="aov" stroke="var(--chart-5)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data, nameKey, valueKey, currency = true, onSelect,
}: { data: any[]; nameKey: string; valueKey: string; currency?: boolean; onSelect?: (name: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="55%"
          outerRadius="82%"
          paddingAngle={2}
          onClick={(e: any) => onSelect?.(e?.[nameKey] ?? e?.payload?.[nameKey])}
        >
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v: any) => (currency ? inr(v) : v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data, nameKey, valueKey, currency = true, onSelect,
}: { data: any[]; nameKey: string; valueKey: string; currency?: boolean; onSelect?: (name: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8 }} onClick={(e: any) => e?.activeLabel && onSelect?.(e.activeLabel)}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" {...axis} tickFormatter={currency ? compact : undefined} />
        <YAxis type="category" dataKey={nameKey} {...axis} width={110} />
        <Tooltip {...tooltipStyle} formatter={(v: any) => (currency ? inr(v) : v)} />
        <Bar dataKey={valueKey} fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
