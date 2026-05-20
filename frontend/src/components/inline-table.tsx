import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChatDataset } from "@/lib/chats";

interface InlineTableProps {
  dataset: ChatDataset;
  limit?: number;
}

function formatCell(value: unknown, type: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n) : String(value);
  }
  return String(value);
}

export function InlineTable({ dataset, limit = 10 }: InlineTableProps) {
  const rows = dataset.data?.slice(0, limit) ?? [];
  const columns = dataset.columns ?? [];

  if (columns.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        No data attached to this chat yet.
      </div>
    );
  }

  return (
    <div className="max-h-[320px] overflow-auto rounded-md border border-border bg-card">
      <Table className="min-w-max border-separate border-spacing-0">
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.name} className="sticky top-0 z-10 min-w-32 max-w-56 whitespace-nowrap border-b border-r border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground last:border-r-0">
                <div className="max-w-48 truncate" title={c.name}>{c.name}</div>
                <div className="text-[10px] font-normal uppercase text-muted-foreground">{c.type}</div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} className="odd:bg-background even:bg-muted/20 hover:bg-muted/50">
              {columns.map((c) => (
                <TableCell key={c.name} className={`max-w-56 whitespace-nowrap border-r border-border px-3 py-2 text-sm last:border-r-0 ${c.type === "number" ? "text-right tabular-nums" : "text-left"}`}>
                  <span className="block max-w-48 truncate" title={formatCell((row as Record<string, unknown>)[c.name], c.type)}>
                    {formatCell((row as Record<string, unknown>)[c.name], c.type)}
                  </span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
