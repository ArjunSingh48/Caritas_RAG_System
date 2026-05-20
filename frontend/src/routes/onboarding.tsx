import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { User, ArrowRight, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — Caritas AI Dashboard" },
      { name: "description", content: "Tell us a bit about yourself to personalize your experience." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, completeOnboarding } = useAuth();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [context, setContext] = useState("");

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
  }, [user, navigate]);

  const finish = () => {
    completeOnboarding({
      name: name || undefined,
      location: location || undefined,
      branch: branch || undefined,
      department: department || undefined,
      jobRole: role || undefined,
      context: context || undefined,
    });
    navigate({ to: "/chat" });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    finish();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex items-center justify-center p-4 pt-12">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">{t("onboarding.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.subtitle")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("onboarding.name")}</Label>
                <Input placeholder={t("onboarding.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("onboarding.location")}</Label>
                  <Input placeholder={t("onboarding.locationPlaceholder")} value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("onboarding.branch")}</Label>
                  <Input placeholder={t("onboarding.branchPlaceholder")} value={branch} onChange={(e) => setBranch(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.department")}</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("onboarding.selectDepartment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fundraising">{t("onboarding.depts.fundraising")}</SelectItem>
                    <SelectItem value="programs">{t("onboarding.depts.programs")}</SelectItem>
                    <SelectItem value="finance">{t("onboarding.depts.finance")}</SelectItem>
                    <SelectItem value="hr">{t("onboarding.depts.hr")}</SelectItem>
                    <SelectItem value="communications">{t("onboarding.depts.communications")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("onboarding.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="analyst">{t("onboarding.roles.analyst")}</SelectItem>
                    <SelectItem value="manager">{t("onboarding.roles.manager")}</SelectItem>
                    <SelectItem value="director">{t("onboarding.roles.director")}</SelectItem>
                    <SelectItem value="coordinator">{t("onboarding.roles.coordinator")}</SelectItem>
                    <SelectItem value="volunteer">{t("onboarding.roles.volunteer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.contextOptional")}</Label>
                <Textarea
                  placeholder={t("onboarding.contextPlaceholder")}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={finish}>
                  <SkipForward className="mr-2 h-4 w-4" /> {t("actions.skip")}
                </Button>
                <Button type="submit" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  {t("actions.continue")} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
