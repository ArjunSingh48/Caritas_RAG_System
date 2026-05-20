import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { SuggestionChips } from "@/components/suggestion-chips";
import { ViewerPanel, type PanelSelection } from "@/components/viewer-panel";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowLeft, Sparkles, Bot, BookOpen, Database } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChats } from "@/hooks/use-chats";
import type { ChatDataset, ChatDashboard, ChatVisual } from "@/lib/chats";
import type { ParsedFile } from "@/lib/parse-file";
import { pickGraph } from "@/lib/graph-pick";
import { toast } from "sonner";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Caritas AI Dashboard" },
      { name: "description", content: "Chat with your data and get AI-powered insights." },
    ],
  }),
  component: ChatPage,
});

const DASHBOARD_INTENT = /(generate|create|show|build|make|erstell|generier|zeig|crée|créer|génér|affich|crea|gener|mostr)\b[\s\S]{0,30}(dashboard|tableau|tabella)/i;


function ChatPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    activeChat,
    activeChatId,
    newChat,
    appendMessage,
    addDataset,
    addVisual,
    addDashboard,
    clearActive,
  } = useChats();

  const [isThinking, setIsThinking] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelSelection | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastDashboardForMessage = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (user.role === "super-admin") navigate({ to: "/super-admin" });
    else if (user.role === "admin") navigate({ to: "/admin" });
    else if (!user.hasOnboarded) navigate({ to: "/onboarding" });
  }, [user, navigate]);

  const messages = activeChat?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isThinking]);

  const closePanel = () => {
    setActivePanel(null);
    setPanelExpanded(false);
  };

  const handleNewChatReset = () => {
    clearActive();
    closePanel();
    setIsThinking(false);
  };

  const describeKind = (kind: string, x: string, y: string) => {
    if (kind === "histogram") return t("auto.chartLabel.histogram", { y });
    return t(`auto.chartLabel.${kind}`, { x, y });
  };

  const handleSend = (text: string, parsed?: ParsedFile[]) => {
    const wantsDashboard = DASHBOARD_INTENT.test(text);
    const chatId = activeChatId ?? newChat();

    if (parsed?.length) {
      for (const p of parsed) {
        const ds: ChatDataset = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: p.name,
          size: p.size,
          rows: p.rows,
          columns: p.columns,
          data: p.data,
        };
        addDataset(chatId, ds);
      }
    }

    const userContent = text || (parsed && parsed.length ? t("auto.uploadedFiles", { count: parsed.length }) : "");
    const userMsg = {
      id: Date.now().toString(),
      role: "user" as const,
      content: userContent,
      files: parsed?.map((p) => ({ name: p.name, size: p.size })),
    };
    appendMessage(chatId, userMsg);
    setIsThinking(true);

    setTimeout(() => {
      const aiId = (Date.now() + 1).toString();

      let dashboardId: string | undefined;
      if (wantsDashboard) {
        const chat = activeChat ?? null;
        const existingVisuals = chat?.visuals ?? [];
        let visualIds = existingVisuals.map((v) => v.id);

        if (visualIds.length === 0) {
          const ds = chat?.datasets[chat.datasets.length - 1];
          if (ds && ds.columns?.length) {
            const spec = pickGraph(text, ds.columns);
            const visual: ChatVisual = {
              id: `v-${aiId}`,
              name: describeKind(spec.kind, spec.x, spec.y),
              datasetId: ds.id,
              query: text,
              spec,
              createdAt: Date.now(),
            };
            addVisual(chatId, visual);
            visualIds = [visual.id];
          }
        }

        const dashboard: ChatDashboard = {
          id: `d-${aiId}`,
          name: t("auto.dashboardN", { n: (chat?.dashboards.length ?? 0) + 1 }),
          visualIds,
          summary: text ? t("auto.summaryFor", { query: text }) : t("auto.autoDashboard"),
        };
        addDashboard(chatId, dashboard);
        dashboardId = dashboard.id;
        lastDashboardForMessage.current[aiId] = dashboard.id;
      }

      const aiMsg = {
        id: aiId,
        role: "ai" as const,
        // Stored as translation-key reference so language switch re-translates history.
        content: "",
        contentKey: wantsDashboard ? "ai.fullDashboard" : "ai.fullQuickLook",
        contentParams: { query: text },
        hasChart: wantsDashboard,
        query: text,
        dashboardId,
      };
      appendMessage(chatId, aiMsg);
      setIsThinking(false);
    }, 900);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    const ok = dropped.filter((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (ok.length !== dropped.length) toast.error(t("toast.unsupportedFiles"));
    if (!ok.length) return;
    const { parseFile } = await import("@/lib/parse-file");
    const parsedAll: ParsedFile[] = [];
    for (const f of ok) {
      try {
        parsedAll.push(await parseFile(f));
      } catch {
        toast.error(t("toast.failedParse", { name: f.name }));
      }
    }
    if (parsedAll.length) handleSend("", parsedAll);
  };

  // Default dataset for AI message context (latest in chat)
  const latestDataset: ChatDataset | null =
    activeChat?.datasets[activeChat.datasets.length - 1] ?? null;

  const isInitial = messages.length === 0;
  const datasetsInChat = activeChat?.datasets ?? [];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar
          onNewChat={handleNewChatReset}
          onSelectAsset={(sel) => {
            setActivePanel({ type: sel.type, id: sel.id });
            setPanelExpanded(false);
          }}
        />

        <div className="flex flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 pr-20">
            <SidebarTrigger />
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-sm font-semibold text-foreground">
                {activeChat ? (activeChat.title || t("sidebar.newChat")) : t("chat.title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {user?.email
                  ? t("chat.signedInAs", { email: user.email })
                  : t("chat.signedOutHint")}
              </p>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  title={t("actions.dataAccess")}
                  aria-label={t("actions.dataAccess")}
                >
                  <BookOpen className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                  {t("viewer.quickAccess")}
                </p>
                {datasetsInChat.length === 0 ? (
                  <p className="px-2 pb-1 text-xs text-muted-foreground/70">
                    {t("viewer.none")}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {datasetsInChat.map((d) => (
                      <li key={d.id}>
                        <button
                          onClick={() => {
                            setActivePanel({ type: "dataset", id: d.id });
                            setPanelExpanded(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          <Database className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{d.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>

            
          </header>

          <div className="flex flex-1 overflow-hidden">
            <div
              className={`flex flex-col transition-all duration-200 ${
                activePanel ? (panelExpanded ? "w-[20%]" : "w-[55%]") : "w-full"
              } ${dragOver ? "bg-primary/5" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {isInitial ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4">
                  <div className="w-full max-w-2xl">
                    <div className="mb-8 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Sparkles className="h-6 w-6 text-primary" />
                      </div>
                      <h2 className="text-2xl font-semibold text-foreground">
                        {t("chat.howCanIHelp")}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("chat.subtitle")}
                      </p>
                    </div>
                    <ChatInput onSend={handleSend} />
                    <div className="mt-4 flex justify-center">
                      <SuggestionChips onSelect={(s) => handleSend(s)} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
                    <div className="mx-auto max-w-3xl">
                      {messages.map((msg) => (
                        <div key={msg.id}>
                          <ChatMessage
                            messageId={msg.id}
                            role={msg.role}
                            content={msg.content}
                            contentKey={msg.contentKey}
                            contentParams={msg.contentParams}
                            hasChart={msg.hasChart}
                            query={msg.query}
                            dataset={msg.role === "ai" ? latestDataset : undefined}
                            onShowDashboard={() => {
                              const dashId =
                                msg.dashboardId ??
                                lastDashboardForMessage.current[msg.id] ??
                                activeChat?.dashboards[activeChat.dashboards.length - 1]?.id;
                              if (dashId) {
                                setActivePanel({ type: "dashboard", id: dashId });
                                setPanelExpanded(false);
                              }
                            }}
                            onCreateVisual={(v) => {
                              if (activeChatId) addVisual(activeChatId, v);
                            }}
                            onOpenVisual={(visualId) => {
                              setActivePanel({ type: "visual", id: visualId });
                              setPanelExpanded(false);
                            }}
                          />
                          {msg.files && msg.files.length > 0 && (
                            <div className={`mb-4 flex flex-wrap gap-1.5 ${msg.role === "user" ? "justify-end" : "ml-11"}`}>
                              {msg.files.map((f, i) => (
                                <span
                                  key={i}
                                  className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
                                >
                                  📎 {f.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {isThinking && (
                        <div className="mb-6 flex gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                            <Bot className="h-4 w-4 text-primary-foreground" />
                          </div>
                          <div className="flex items-center gap-1.5 py-3">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-border bg-background p-4">
                    <div className="mx-auto max-w-3xl space-y-3">
                      <SuggestionChips onSelect={(s) => handleSend(s)} />
                      <ChatInput onSend={handleSend} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <ViewerPanel
              chat={activeChat}
              active={activePanel}
              expanded={panelExpanded}
              onClose={closePanel}
              onToggleExpand={() => setPanelExpanded((v) => !v)}
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
