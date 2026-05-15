import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, LogOut, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/super-admin")({
  head: () => ({
    meta: [
      { title: "Super Admin — Caritas AI Dashboard" },
      { name: "description", content: "Super admin global overview." },
    ],
  }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "super-admin") navigate({ to: "/login" });
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">{t("superAdmin.brand")}</span>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" /> {t("common.logout")}
          </Button>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="flex items-center justify-center border-r border-border bg-muted/30 p-8">
          <div className="text-center">
            <Globe className="mx-auto h-32 w-32 text-muted-foreground/40" strokeWidth={1} />
            <p className="mt-4 text-sm text-muted-foreground">{t("superAdmin.worldMap")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("superAdmin.worldMapHint")}</p>
          </div>
        </div>

        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-foreground">{t("superAdmin.wip")}</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("superAdmin.wipHint")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
