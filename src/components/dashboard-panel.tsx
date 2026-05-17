import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { X, Maximize2, ExternalLink, Download, Share2, FileImage, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KPICard } from "@/components/kpi-card";
import { ChartGrid } from "@/components/chart-grid";
import { mockKPIs } from "@/lib/mock-data";
import { exportDashboardToPDF, exportDashboardToPNG, shareDashboard } from "@/lib/export-dashboard";

interface DashboardPanelProps {
  open: boolean;
  onClose: () => void;
  onExpand?: () => void;
  expanded?: boolean;
}

export function DashboardPanel({ open, onClose, onExpand, expanded }: DashboardPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  if (!open) return null;

  const handlePDF = () => contentRef.current && exportDashboardToPDF(contentRef.current);
  const handlePNG = () => contentRef.current && exportDashboardToPNG(contentRef.current);
  const handleShare = () => contentRef.current && shareDashboard(contentRef.current, "Caritas Dashboard");

  return (
    <aside
      className={`flex flex-col border-l border-border bg-background transition-all duration-200 ${
        expanded ? "w-[70%]" : "w-[40%]"
      } min-w-[360px]`}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-sm font-semibold text-foreground">Dashboard Preview</h2>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <Download className="mr-1 h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handlePDF}>
                <FileText className="mr-2 h-4 w-4" /> PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePNG}>
                <FileImage className="mr-2 h-4 w-4" /> PNG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={handleShare} className="h-8">
            <Share2 className="mr-1 h-3.5 w-3.5" /> Share
          </Button>
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

      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 bg-background">
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
