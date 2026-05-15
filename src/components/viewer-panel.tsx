import { useMemo, useState } from "react";
import { X, Maximize2, Minimize2, Database, BarChart3, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineChart } from "@/components/inline-chart";
import { KPICard } from "@/components/kpi-card";
import { ChartGrid } from "@/components/chart-grid";
import { mockKPIs } from "@/lib/mock-data";
import type { ChatRecord, ChatDataset, ChatVisual, ChatDashboard } from "@/lib/chats";

export type PanelSelection = { type: "dataset" | "visual" | "dashboard"; id: string };

interface ViewerPanelProps {
  chat: ChatRecord | null;
  active: PanelSelection | null;
  expanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

const PAGE_SIZE = 50;

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n) : String(value);
  }
  return String(value);
}

function DatasetView({ dataset }: { dataset: ChatDataset }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const data = dataset.data ?? [];
  const columns = dataset.columns ?? [];
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [data, page]
  );

  return (
    <Tabs defaultValue="table" className="flex h-full flex-col">
      <div className="border-b border-border px-3 pt-2">
        <TabsList>
          <TabsTrigger value="table">{t("tabs.table")}</TabsTrigger>
          <TabsTrigger value="schema">{t("tabs.schema")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="table" className="m-0 flex-1 overflow-auto">
        <div className="min-w-full bg-card">
          <Table className="min-w-max border-separate border-spacing-0">
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead
                    key={c.name}
                    className="sticky top-0 z-10 min-w-36 max-w-64 whitespace-nowrap border-b border-r border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground last:border-r-0"
                  >
                    <div className="max-w-56 truncate" title={c.name}>{c.name}</div>
                    <div className="text-[10px] font-normal uppercase text-muted-foreground">{c.type}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row, i) => (
                <TableRow key={i} className="odd:bg-background even:bg-muted/20 hover:bg-muted/50">
                  {columns.map((c) => (
                    <TableCell
                      key={c.name}
                      className={`max-w-64 whitespace-nowrap border-r border-border px-3 py-2 text-sm last:border-r-0 ${c.type === "number" ? "text-right tabular-nums" : "text-left"}`}
                    >
                      <span className="block max-w-56 truncate" title={formatCell((row as Record<string, unknown>)[c.name], c.type)}>
                        {formatCell((row as Record<string, unknown>)[c.name], c.type)}
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              ›
            </Button>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="schema" className="m-0 flex-1 overflow-auto p-4">
        <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {columns.length} columns • {data.length} rows
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {columns.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
            >
              <span className="truncate text-sm font-medium text-foreground">
                {c.name}
              </span>
              <Badge variant="secondary" className="ml-2 text-[10px] uppercase tracking-wide">
                {c.type}
              </Badge>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function VisualView({
  visual,
  dataset,
}: {
  visual: ChatVisual;
  dataset: ChatDataset | null;
}) {
  const { t } = useTranslation();
  if (!dataset) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("viewer.datasetMissing")}
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("viewer.basedOn")}:</span> {visual.query || "—"}
      </p>
      <InlineChart dataset={dataset} spec={visual.spec} />
    </div>
  );
}

function DashboardView({
  dashboard,
  chat,
}: {
  dashboard: ChatDashboard;
  chat: ChatRecord;
}) {
  const { t } = useTranslation();
  const visuals = dashboard.visualIds
    .map((vid) => chat.visuals.find((v) => v.id === vid))
    .filter((v): v is ChatVisual => !!v);

  return (
    <div className="space-y-4 overflow-y-auto p-4">
      {dashboard.summary && (
        <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
          {dashboard.summary}
        </p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mockKPIs.slice(0, 4).map((kpi, i) => (
          <KPICard key={i} {...kpi} />
        ))}
      </div>

      {/* Chat-specific visuals if any */}
      {visuals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visuals.map((v) => {
            const ds = chat.datasets.find((d) => d.id === v.datasetId);
            if (!ds) return null;
            return <InlineChart key={v.id} dataset={ds} spec={v.spec} height={240} />;
          })}
        </div>
      )}

      {/* Rich default dashboard charts */}
      <ChartGrid />

      {visuals.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("viewer.noVisuals")}</p>
      )}
    </div>
  );
}

export function ViewerPanel({
  chat,
  active,
  expanded,
  onClose,
  onToggleExpand,
}: ViewerPanelProps) {
  const { t } = useTranslation();
  if (!active || !chat) return null;

  let title = "";
  let icon = Database;
  let body: React.ReactNode = null;

  if (active.type === "dataset") {
    const ds = chat.datasets.find((d) => d.id === active.id) ?? null;
    if (!ds) return null;
    title = ds.name;
    icon = Database;
    body = <DatasetView dataset={ds} />;
  } else if (active.type === "visual") {
    const v = chat.visuals.find((x) => x.id === active.id) ?? null;
    if (!v) return null;
    title = v.name;
    icon = BarChart3;
    body = <VisualView visual={v} dataset={chat.datasets.find((d) => d.id === v.datasetId) ?? null} />;
  } else {
    const d = chat.dashboards.find((x) => x.id === active.id) ?? null;
    if (!d) return null;
    title = d.name;
    icon = LayoutDashboard;
    body = <DashboardView dashboard={d} chat={chat} />;
  }

  const Icon = icon;

  return (
    <aside
      className={`flex flex-col border-l border-border bg-background transition-all duration-200 ${
        expanded ? "w-[80%]" : "w-[45%]"
      } min-w-[360px]`}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onToggleExpand} className="h-8 w-8" title={expanded ? t("actions.collapse") : t("actions.expand")}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" title={t("actions.close")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col">{body}</div>
    </aside>
  );
}
