import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Caritas AI Dashboard" },
      { name: "description", content: "View and edit your profile details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [context, setContext] = useState("");

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    setName(user.name ?? "");
    setLocation(user.location ?? "");
    setBranch(user.branch ?? "");
    setDepartment(user.department ?? "");
    setJobRole(user.jobRole ?? "");
    setContext(user.context ?? "");
  }, [user, navigate]);

  const handleSave = () => {
    updateProfile({
      name: name || undefined,
      location: location || undefined,
      branch: branch || undefined,
      department: department || undefined,
      jobRole: jobRole || undefined,
      context: context || undefined,
    });
    toast.success(t("profile.saved"));
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="flex h-14 items-center gap-3 px-6">
          <Link to="/chat">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
            </Button>
          </Link>
          <span className="text-sm font-semibold text-foreground">{t("profile.header")}</span>
        </div>
      </header>
      <div className="flex items-center justify-center p-4 pt-8">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">{t("profile.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {user?.email}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("onboarding.name")}</Label>
              <Input
                placeholder={t("onboarding.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("onboarding.location")}</Label>
                <Input
                  placeholder={t("onboarding.locationPlaceholder")}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.branch")}</Label>
                <Input
                  placeholder={t("onboarding.branchPlaceholder")}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
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
              <Select value={jobRole} onValueChange={setJobRole}>
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
              <Label>{t("profile.contextHistory")}</Label>
              <Textarea
                placeholder={t("profile.contextPlaceholder")}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
              />
            </div>
            <div className="pt-2">
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleSave}
              >
                <Save className="mr-2 h-4 w-4" /> {t("actions.saveChanges")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
