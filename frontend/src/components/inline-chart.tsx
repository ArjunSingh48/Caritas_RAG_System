import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ChatDataset } from "@/lib/chats";
import type { GraphSpec } from "@/lib/graph-pick";

interface InlineChartProps {
  dataset: ChatDataset;
  spec: GraphSpec;
  height?: number;
}

const PRIMARY = "oklch(0.52 0.22 25)";
const GRID = "oklch(0.92 0 0)";
const AXIS = "oklch(0.55 0.01 0)";
const COLORS = [
  "oklch(0.52 0.22 25)",
  "oklch(0.62 0.16 260)",
  "oklch(0.67 0.17 145)",
  "oklch(0.75 0.10 80)",
  "oklch(0.55 0.12 300)",
];

function toNumber(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function aggregateBy(
  data: Record<string, unknown>[],
  x: string,
  y: string
): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const r of data) {
    const key = String(r[x] ?? "—");
    map.set(key, (map.get(key) ?? 0) + toNumber(r[y]));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .slice(0, 30);
}

function histogram(
  data: Record<string, unknown>[],
  y: string,
  bins = 10
): { name: string; value: number }[] {
  const nums = data.map((r) => toNumber(r[y])).filter((n) => !isNaN(n));
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const step = (max - min) / bins || 1;
  const buckets = new Array(bins).fill(0);
  for (const n of nums) {
    const idx = Math.min(bins - 1, Math.floor((n - min) / step));
    buckets[idx]++;
  }
  return buckets.map((value, i) => ({
    name: `${(min + i * step).toFixed(1)}`,
    value,
  }));
}

export function InlineChart({ dataset, spec, height = 260 }: InlineChartProps) {
  const data = dataset.data ?? [];
  const { kind, x, y, title } = spec;

  const renderChart = () => {
    if (kind === "line") {
      const agg = aggregateBy(data, x, y);
      return (
        <LineChart data={agg}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
          <YAxis tick={{ fontSize: 11, fill: AXIS }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      );
    }
    if (kind === "pie") {
      const agg = aggregateBy(data, x, y).slice(0, 8);
      return (
        <PieChart>
          <Pie
            data={agg}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={3}
            label={({ name, percent }: { name: string; percent: number }) =>
              `${name} ${(percent * 100).toFixed(0)}%`
            }
          >
            {agg.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      );
    }
    if (kind === "scatter") {
      const points = data
        .map((r) => ({ x: toNumber(r[x]), y: toNumber(r[y]) }))
        .slice(0, 200);
      return (
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis type="number" dataKey="x" name={x} tick={{ fontSize: 11, fill: AXIS }} />
          <YAxis type="number" dataKey="y" name={y} tick={{ fontSize: 11, fill: AXIS }} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={points} fill={PRIMARY} />
        </ScatterChart>
      );
    }
    if (kind === "histogram") {
      const agg = histogram(data, y);
      return (
        <BarChart data={agg}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
          <YAxis tick={{ fontSize: 11, fill: AXIS }} />
          <Tooltip />
          <Bar dataKey="value" fill={PRIMARY} radius={[4, 4, 0, 0]} />
        </BarChart>
      );
    }
    const agg = aggregateBy(data, x, y);
    return (
      <BarChart data={agg}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} />
        <Tooltip />
        <Bar dataKey="value" fill={PRIMARY} radius={[4, 4, 0, 0]} />
      </BarChart>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="truncate text-xs font-medium text-foreground">{title}</p>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{kind}</span>
      </div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
