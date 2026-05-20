import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
}

export function KPICard({ title, value, change, trend }: KPICardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        <div className="mt-2 flex items-center gap-1 text-xs">
          {trend === "up" ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-destructive" />
          )}
          <span className={trend === "up" ? "text-success" : "text-destructive"}>
            {change}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
