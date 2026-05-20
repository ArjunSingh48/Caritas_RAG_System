import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BarChart3, Upload, MessageSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Dashboard Creator — Caritas Switzerland" },
      { name: "description", content: "Turn your data into insights instantly with AI-powered analytics for Caritas Switzerland." },
      { property: "og:title", content: "AI Dashboard Creator — Caritas Switzerland" },
      { property: "og:description", content: "Turn your data into insights instantly with AI-powered analytics." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { t } = useTranslation();
  const features = [
    { icon: Upload, title: t("landing.featureUploadTitle"), description: t("landing.featureUploadDesc") },
    { icon: MessageSquare, title: t("landing.featureAskTitle"), description: t("landing.featureAskDesc") },
    { icon: BarChart3, title: t("landing.featureVizTitle"), description: t("landing.featureVizDesc") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">{t("common.brand")}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                {t("actions.getStarted")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("landing.heroSubtitle")}
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link to="/login">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8">
                {t("actions.getStarted")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-2xl font-semibold text-foreground">
            {t("landing.howItWorks")}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-muted-foreground">
            {t("landing.howItWorksSubtitle")}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((feature, i) => (
              <Card key={i} className="shadow-sm transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
          {t("landing.footer")}
        </div>
      </footer>
    </div>
  );
}
