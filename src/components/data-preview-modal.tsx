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
import type { ParsedFile } from "@/lib/parse-file";

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n) : String(value);
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

export function DataPreviewModal({
  open,
  parsed,
  onConfirm,
  onReplace,
  onCancel,
}: DataPreviewModalProps) {
  const { t } = useTranslation();
  if (!parsed) return null;
  const previewRows = parsed.data.slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("modal.previewTitle")}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{parsed.name}</span>
            <span>•</span>
            <span>{formatSize(parsed.size)}</span>
            <span>•</span>
            <span>{t("modal.rows", { count: parsed.rows })}</span>
            <span>•</span>
            <span>{t("modal.columns", { count: parsed.columns.length })}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="table" className="min-h-0">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto">
            <TabsTrigger value="schema">{t("tabs.schema")}</TabsTrigger>
            <TabsTrigger value="table">{t("tabs.table")}</TabsTrigger>
          </TabsList>

          <TabsContent value="schema" className="max-h-[380px] overflow-auto rounded-md border border-border bg-muted/20 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {parsed.columns.map((c) => (
                <div
                  key={c.name}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 shadow-sm"
                >
                  <span className="truncate text-sm font-medium text-foreground" title={c.name}>{c.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {c.type}
                  </Badge>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="table">
            <div className="max-h-[420px] overflow-auto rounded-md border border-border bg-card">
              <Table className="min-w-max border-separate border-spacing-0">
                <TableHeader>
                  <TableRow>
                    {parsed.columns.map((c) => (
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
                  {previewRows.map((row, i) => (
                    <TableRow key={i} className="odd:bg-background even:bg-muted/20 hover:bg-muted/50">
                      {parsed.columns.map((c) => (
                        <TableCell
                          key={c.name}
                          className={`max-w-64 whitespace-nowrap border-r border-border px-3 py-2 text-sm last:border-r-0 ${c.type === "number" ? "text-right tabular-nums" : "text-left"}`}
                          title={formatCell(row[c.name], c.type)}
                        >
                          <span className="block max-w-56 truncate">{formatCell(row[c.name], c.type)}</span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">{t("modal.confirmHint")}</p>

        <DialogFooter className="gap-2 sm:gap-2">
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
