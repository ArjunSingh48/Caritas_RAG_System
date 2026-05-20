import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/kpi-card";
import { ChartGrid } from "@/components/chart-grid";
import { AIInsightsPanel } from "@/components/ai-insights-panel";
import { FilterPanel } from "@/components/filter-panel";
import { mockKPIs } from "@/lib/mock-data";

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
            <Button variant="outline" size="sm">
              <Save className="mr-1 h-4 w-4" /> {t("actions.save")}
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-1 h-4 w-4" /> {t("actions.export")}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <div className="flex-1 p-6 space-y-6">
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
