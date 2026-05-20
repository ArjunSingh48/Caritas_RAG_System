import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, BarChart3, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Caritas AI Dashboard" },
      { name: "description", content: "Regional admin overview." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "admin") navigate({ to: "/login" });
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
            <span className="text-sm font-semibold">{t("admin.brand")}</span>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" /> {t("common.logout")}
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <Shield className="mx-auto mb-4 h-16 w-16 text-primary/60" strokeWidth={1.5} />
          {user?.region && (
            <p className="mb-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {t("admin.regionLabel", { region: user.region })}
            </p>
          )}
          <h1 className="text-3xl font-semibold text-foreground">{t("admin.wip")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("admin.wipHint")}
          </p>
        </div>
      </main>
    </div>
  );
}
