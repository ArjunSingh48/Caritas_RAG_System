import { mockDatasetPreview } from "@/lib/mock-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DatasetPreview() {
  const { columns, rows } = mockDatasetPreview;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Dataset Preview</CardTitle>
        <div className="flex gap-2">
          {columns.map((col) => (
            <Badge key={col.name} variant="secondary" className="text-xs">
              {col.name} <span className="ml-1 text-muted-foreground">({col.type})</span>
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.name} className="text-xs font-medium">
                    {col.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.name} className="text-sm">
                      {String(row[col.name as keyof typeof row])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
