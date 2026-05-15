import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ParsedFile, ParsedSheet } from "@/lib/parse-file";

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n)
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)
      : String(value);
  }
  return String(value);
}

interface DataPreviewModalProps {
  open: boolean;
  parsed: ParsedFile | null;
  onConfirm: () => void;
  onReplace: () => void;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Excel-style A, B, …, Z, AA column letters
function colLetter(idx: number): string {
  let n = idx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function DataPreviewModal({
  open,
  parsed,
  onConfirm,
  onReplace,
  onCancel,
}: DataPreviewModalProps) {
  const { t } = useTranslation();
  const sheets: ParsedSheet[] = useMemo(() => parsed?.sheets ?? [], [parsed]);
  const [activeSheet, setActiveSheet] = useState<string>("");

  useEffect(() => {
    if (sheets.length && !sheets.find((s) => s.name === activeSheet)) {
      setActiveSheet(sheets[0].name);
    }
  }, [sheets, activeSheet]);

  if (!parsed) return null;
  const current = sheets.find((s) => s.name === activeSheet) ?? sheets[0];
  const previewRows = current?.data.slice(0, 100) ?? [];
  const columns = current?.columns ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-[#217346] px-4 py-3 text-white">
          <DialogTitle className="text-white">{t("modal.previewTitle")}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-white/90">
            <span className="font-medium text-white">{parsed.name}</span>
            <span>•</span>
            <span>{formatSize(parsed.size)}</span>
            <span>•</span>
            <span>{sheets.length} {sheets.length === 1 ? "sheet" : "sheets"}</span>
            {current && (
              <>
                <span>•</span>
                <span>{t("modal.rows", { count: current.rows })}</span>
                <span>•</span>
                <span>{t("modal.columns", { count: columns.length })}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="table" className="flex min-h-0 flex-1 flex-col px-4 pt-3">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="table">{t("tabs.table")}</TabsTrigger>
            <TabsTrigger value="schema">{t("tabs.schema")}</TabsTrigger>
          </TabsList>

          <TabsContent
            value="table"
            className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border bg-white"
          >
            {/* Excel-like grid */}
            <Table className="min-w-max border-separate border-spacing-0 font-sans text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 top-0 z-30 w-10 border-b border-r border-border bg-[#f3f3f3] px-2 py-1 text-center text-[11px] font-normal text-muted-foreground" />
                  {columns.map((c, i) => (
                    <TableHead
                      key={c.name}
                      className="sticky top-0 z-20 min-w-32 border-b border-r border-border bg-[#f3f3f3] px-0 py-0 text-[11px] font-normal text-muted-foreground last:border-r-0"
                    >
                      <div className="border-b border-border px-2 py-0.5 text-center">
                        {colLetter(i)}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 w-10 border-b border-r border-border bg-[#f3f3f3] px-2 py-1 text-center text-[11px] font-normal text-muted-foreground">
                    1
                  </TableHead>
                  {columns.map((c) => (
                    <TableHead
                      key={c.name}
                      className="min-w-32 max-w-72 whitespace-nowrap border-b border-r border-border bg-[#fafafa] px-2 py-1.5 text-left text-[12px] font-semibold text-foreground last:border-r-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="max-w-56 truncate" title={c.name}>{c.name}</span>
                        <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase">
                          {c.type}
                        </Badge>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, i) => (
                  <TableRow key={i} className="hover:bg-[#e8f0fe]/40">
                    <TableCell className="sticky left-0 z-10 w-10 border-b border-r border-border bg-[#f3f3f3] px-2 py-1 text-center text-[11px] font-normal text-muted-foreground">
                      {i + 2}
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell
                        key={c.name}
                        className={cn(
                          "max-w-72 whitespace-nowrap border-b border-r border-border px-2 py-1 text-[13px] last:border-r-0",
                          c.type === "number" ? "text-right tabular-nums" : "text-left",
                        )}
                        title={formatCell(row[c.name], c.type)}
                      >
                        <span className="block max-w-64 truncate">
                          {formatCell(row[c.name], c.type)}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {previewRows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      className="border-b border-border px-3 py-8 text-center text-sm text-muted-foreground"
                    >
                      No rows in this sheet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent
            value="schema"
            className="mt-3 max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/20 p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {columns.map((c) => (
                <div
                  key={c.name}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 shadow-sm"
                >
                  <span className="truncate text-sm font-medium text-foreground" title={c.name}>
                    {c.name}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {c.type}
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Excel-style sheet tabs */}
        <div className="flex items-center gap-0 overflow-x-auto border-t border-border bg-[#f3f3f3] px-2 py-1">
          {sheets.map((s) => {
            const isActive = s.name === current?.name;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => setActiveSheet(s.name)}
                className={cn(
                  "relative -mb-px whitespace-nowrap border-r border-border px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "border-t-2 border-t-[#217346] bg-white font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-white/60",
                )}
                title={`${s.name} — ${s.rows} rows`}
              >
                {s.name}
              </button>
            );
          })}
        </div>

        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {t("modal.confirmHint")}
        </p>

        <DialogFooter className="gap-2 border-t border-border px-4 py-3 sm:gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
          <Button variant="outline" onClick={onReplace}>
            {t("actions.replaceFile")}
          </Button>
          <Button onClick={onConfirm}>{t("actions.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
