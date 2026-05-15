import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, ArrowLeft, LogIn, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { destinationForRole } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Login — Caritas AI Dashboard" },
      { name: "description", content: "Login to access the Caritas AI Dashboard Creator." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  // Intentionally no auto-redirect when a saved session exists.
  // The user must explicitly submit the sign-in form.

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = login(email, password);
    setSubmitting(false);
    if (!result) {
      toast.error(t("auth.invalidCredentials"));
      return;
    }
    toast.success(t("auth.welcomeToast", { email: result.email }));
    navigate({ to: destinationForRole(result) });
  };

  const handleSignup = (e: FormEvent) => {
    e.preventDefault();
    setSignupSubmitting(true);
    const result = signup(signupEmail, signupPassword);
    setSignupSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("auth.accountCreatedToast", { email: result.user.email }));
    navigate({ to: destinationForRole(result.user) });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">{t("common.brand")}</span>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-6">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <LogIn className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">{t("auth.welcomeBack")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("auth.signInPrompt")}
              </p>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.signup")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user1@test.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Password123"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {submitting ? t("auth.signingIn") : t("auth.signIn")}
                  </Button>
                </form>

                <div className="mt-6 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t("auth.demoTitle")}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    <li>{t("auth.demoSuper")}</li>
                    <li>{t("auth.demoAdmin")}</li>
                    <li>{t("auth.demoUser")}</li>
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">{t("auth.email")}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">{t("auth.password")}</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder={t("auth.passwordPlaceholder")}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showSignupPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                        tabIndex={-1}
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("auth.newAccountsHint")}
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={signupSubmitting}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {signupSubmitting ? t("auth.creatingAccount") : t("auth.createAccount")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
