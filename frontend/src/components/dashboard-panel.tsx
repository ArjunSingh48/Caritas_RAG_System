import { Link } from "@tanstack/react-router";
import { X, Maximize2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/kpi-card";
import { ChartGrid } from "@/components/chart-grid";
import { mockKPIs } from "@/lib/mock-data";

interface DashboardPanelProps {
  open: boolean;
  onClose: () => void;
  onExpand?: () => void;
  expanded?: boolean;
}

export function DashboardPanel({ open, onClose, onExpand, expanded }: DashboardPanelProps) {
  if (!open) return null;

  return (
    <aside
      className={`flex flex-col border-l border-border bg-background transition-all duration-200 ${
        expanded ? "w-[70%]" : "w-[40%]"
      } min-w-[360px]`}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-semibold text-foreground">Dashboard Preview</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onExpand} className="h-8">
            <Maximize2 className="mr-1 h-3.5 w-3.5" />
            {expanded ? "Collapse" : "Expand"}
          </Button>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="h-8">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Full Page
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {mockKPIs.slice(0, 4).map((kpi, i) => (
            <KPICard key={i} {...kpi} />
          ))}
        </div>
        <div className="mt-4">
          <ChartGrid />
        </div>
      </div>
    </aside>
  );
}
