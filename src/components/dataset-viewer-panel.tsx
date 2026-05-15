import { useState, useMemo } from "react";
import { X, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChatDataset } from "@/lib/chats";

interface DatasetViewerPanelProps {
  dataset: ChatDataset | null;
  open: boolean;
  expanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
}

const PAGE_SIZE = 50;

export function DatasetViewerPanel({
  dataset,
  open,
  expanded,
  onClose,
  onToggleExpand,
}: DatasetViewerPanelProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  const data = dataset?.data ?? [];
  const columns = dataset?.columns ?? [];
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [data, page]
  );

  if (!open || !dataset) return null;

  return (
    <aside
      className={`flex flex-col border-l border-border bg-background transition-all duration-200 ${
        expanded ? "w-[80%]" : "w-[45%]"
      } min-w-[360px]`}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {dataset.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {data.length} / {dataset.rows ?? data.length} •{" "}
            {columns.length} {t("modal.columns", { count: columns.length })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onToggleExpand} className="h-8">
            <Maximize2 className="mr-1 h-3.5 w-3.5" />
            {expanded ? t("actions.collapse") : t("actions.expand")}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.name} className="whitespace-nowrap text-xs">
                  {c.name}
                  <span className="ml-1 text-muted-foreground">({c.type})</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.name} className="whitespace-nowrap text-sm">
                    {String((row as Record<string, unknown>)[c.name] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-3 text-xs text-muted-foreground">
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
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
