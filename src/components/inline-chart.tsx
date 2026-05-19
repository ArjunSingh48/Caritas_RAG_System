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

function isNumericLike(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return !isNaN(n) && isFinite(n);
}

function sortRows<T extends { name: string }>(
  rows: T[],
  xIsNumeric: boolean,
): T[] {
  if (xIsNumeric) {
    return [...rows].sort((a, b) => Number(a.name) - Number(b.name));
  }
  // Try date sort
  const looksDate = rows.every((r) => !isNaN(Date.parse(r.name)));
  if (looksDate) {
    return [...rows].sort(
      (a, b) => Date.parse(a.name) - Date.parse(b.name),
    );
  }
  return rows;
}

/**
 * Aggregate rows by X across one or more numeric Y series. If every X value
 * appears only once we skip summing (preserves precomputed values like
 * cumulative totals). Returns rows shaped { name, <y1>, <y2>, ... } plus the
 * actual series keys used (so the chart can render multiple lines/bars).
 */
function aggregateMulti(
  data: Record<string, unknown>[],
  x: string,
  ys: string[],
): { rows: { name: string; [k: string]: number | string }[]; series: string[] } {
  if (!ys.length) return { rows: [], series: [] };
  const seen = new Map<string, Record<string, number>>();
  const order: string[] = [];
  let hasDupes = false;
  for (const r of data) {
    const key = String(r[x] ?? "—");
    if (!seen.has(key)) {
      seen.set(key, Object.fromEntries(ys.map((y) => [y, 0])));
      order.push(key);
    } else {
      hasDupes = true;
    }
    const bucket = seen.get(key)!;
    for (const y of ys) bucket[y] += toNumber(r[y]);
  }
  // If no duplicates, the bucket values already equal the original values.
  // (When there are duplicates we sum — that's the correct behaviour.)
  void hasDupes;
  const xIsNumeric = order.every(isNumericLike);
  const rows = order.map((name) => ({ name, ...seen.get(name)! }));
  return { rows: sortRows(rows, xIsNumeric).slice(0, 60), series: ys };
}

function aggregateBy(
  data: Record<string, unknown>[],
  x: string,
  y: string,
): { name: string; value: number }[] {
  const { rows } = aggregateMulti(data, x, [y]);
  return rows.map((r) => ({ name: r.name, value: r[y] as number }));
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

  // Respect the Y column chosen by pickGraph. Only add a second series when
  // it is clearly a related variant of the same metric (e.g. `funding_gap`
  // and `cumulative_funding_gap`) — never dump every numeric column, which
  // mixes unrelated scales and makes the chart misleading.
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/^(cumulative|cum|total|running|ytd|avg|average|mean|sum)[_\s-]*/, "")
      .replace(/[_\s-]+/g, "");
  const yKey = normalize(y);
  const relatedSeries = (dataset.columns ?? [])
    .filter(
      (c) =>
        c.type === "number" &&
        c.name !== x &&
        c.name !== y &&
        normalize(c.name) === yKey,
    )
    .map((c) => c.name);
  const orderedSeries = [y, ...relatedSeries];

  const renderChart = () => {
    if (kind === "line") {
      const { rows, series } = aggregateMulti(data, x, orderedSeries);
      return (
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
          <YAxis tick={{ fontSize: 11, fill: AXIS }} />
          <Tooltip />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              name={s}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
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
    // Default: grouped bar with every numeric series.
    const { rows, series } = aggregateMulti(data, x, orderedSeries);
    return (
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: AXIS }} />
        <YAxis tick={{ fontSize: 11, fill: AXIS }} />
        <Tooltip />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            name={s}
            fill={COLORS[i % COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
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
