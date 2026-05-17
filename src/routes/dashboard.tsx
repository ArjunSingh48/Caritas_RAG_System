import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, Download, Share2, FileImage, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KPICard } from "@/components/kpi-card";
import { ChartGrid } from "@/components/chart-grid";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { FilterPanel } from "@/components/filter-panel";
import { mockKPIs } from "@/lib/mock-data";
import { exportDashboardToPDF, exportDashboardToPNG, shareDashboard } from "@/lib/export-dashboard";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Insights Dashboard — Caritas AI Dashboard" },
      { name: "description", content: "Interactive dashboard with AI-powered data insights and visualizations." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const dashboardRef = useRef<HTMLDivElement>(null);

  const handlePDF = () => dashboardRef.current && exportDashboardToPDF(dashboardRef.current);
  const handlePNG = () => dashboardRef.current && exportDashboardToPNG(dashboardRef.current);
  const handleShare = () => dashboardRef.current && shareDashboard(dashboardRef.current, "Caritas Dashboard");
  const handleSave = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Dashboard link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link to="/chat">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" /> {t("dashboard.backToChat")}
              </Button>
            </Link>
            <span className="text-sm font-semibold text-foreground">{t("dashboard.header")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSave}>
              <Save className="mr-1 h-4 w-4" /> {t("actions.save")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-4 w-4" /> {t("actions.export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handlePDF}>
                  <FileText className="mr-2 h-4 w-4" /> Download as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePNG}>
                  <FileImage className="mr-2 h-4 w-4" /> Download as PNG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="default" size="sm" onClick={handleShare}>
              <Share2 className="mr-1 h-4 w-4" /> Share
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <div ref={dashboardRef} className="flex-1 p-6 space-y-6 bg-muted/30">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {mockKPIs.map((kpi) => (
              <KPICard key={kpi.title} {...kpi} />
            ))}
          </div>
          <ChartGrid />
          <AIInsightsPanel />
        </div>
        <aside className="hidden w-64 shrink-0 border-l border-border bg-background p-4 xl:block">
          <FilterPanel />
        </aside>
      </div>
    </div>
  );
}
