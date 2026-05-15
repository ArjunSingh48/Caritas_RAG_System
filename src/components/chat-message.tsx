import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, LayoutDashboard, Table as TableIcon, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InlineTable } from "@/components/inline-table";
import { InlineChart } from "@/components/inline-chart";
import { pickGraph, type GraphSpec } from "@/lib/graph-pick";
import type { ChatDataset, ChatVisual } from "@/lib/chats";

interface ChatMessageProps {
  messageId: string;
  role: "user" | "ai";
  content: string;
  contentKey?: string;
  contentParams?: Record<string, unknown>;
  hasChart?: boolean;
  query?: string;
  dataset?: ChatDataset | null;
  onShowDashboard?: () => void;
  onCreateVisual?: (visual: ChatVisual) => void;
  onOpenVisual?: (visualId: string) => void;
}

function describeSpec(spec: GraphSpec, t: (k: string, p?: Record<string, unknown>) => string): string {
  if (spec.kind === "histogram") return t("auto.chartLabel.histogram", { y: spec.y });
  return t(`auto.chartLabel.${spec.kind}`, { x: spec.x, y: spec.y });
}

export function ChatMessage({
  messageId,
  role,
  content,
  contentKey,
  contentParams,
  hasChart,
  query,
  dataset,
  onShowDashboard,
  onCreateVisual,
  onOpenVisual,
}: ChatMessageProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<"none" | "table" | "visual">("none");
  const visualIdRef = useRef<string | null>(null);
  const isUser = role === "user";

  const hasDataset = !!dataset && (dataset.columns?.length ?? 0) > 0;
  const spec: GraphSpec | null =
    hasDataset && query ? pickGraph(query, dataset!.columns ?? []) : null;

  useEffect(() => {
    if (view !== "visual" || !spec || !dataset || !onCreateVisual) return;
    if (visualIdRef.current) return;
    const id = `v-${messageId}`;
    visualIdRef.current = id;
    onCreateVisual({
      id,
      name: describeSpec(spec, t),
      datasetId: dataset.id,
      query: query ?? "",
      spec,
      createdAt: Date.now(),
    });
  }, [view, spec, dataset, onCreateVisual, query, messageId]);

  if (isUser) {
    return (
      <div className="mb-6 flex justify-end">
        <div className="max-w-[75%] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {content.split("\n").map((line, i) => (
            <p key={i} className={i > 0 ? "mt-1" : ""}>{line || "\u00A0"}</p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
        <Bot className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div
          className={cn(
            "text-sm leading-relaxed text-foreground",
            "[&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0",
            "[&>h1]:mt-4 [&>h1]:mb-2 [&>h1]:text-lg [&>h1]:font-semibold",
            "[&>h2]:mt-4 [&>h2]:mb-2 [&>h2]:text-base [&>h2]:font-semibold",
            "[&>h3]:mt-3 [&>h3]:mb-1.5 [&>h3]:text-sm [&>h3]:font-semibold",
            "[&>ul]:my-2 [&>ul]:ml-5 [&>ul]:list-disc [&>ul]:space-y-1",
            "[&>ol]:my-2 [&>ol]:ml-5 [&>ol]:list-decimal [&>ol]:space-y-1",
            "[&>blockquote]:border-l-2 [&>blockquote]:border-border [&>blockquote]:pl-3 [&>blockquote]:italic",
            "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
            "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3",
            "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
            "[&_a]:text-primary [&_a]:underline",
            "[&_strong]:font-semibold",
            "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse",
            "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
            "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {(() => {
              if (!contentKey) return content;
              const params = contentParams ?? {};
              const queryRaw = (params as { query?: string }).query;
              const queryPart = queryRaw ? t("ai.dashboardForQuery", { query: queryRaw }) : "";
              if (contentKey === "ai.fullDashboard") {
                return [
                  t("ai.dashboardIntro", { queryPart }),
                  "",
                  `**${t("ai.keyFindings")}**`,
                  "",
                  `- ${t("ai.bulletTrend")}`,
                  `- ${t("ai.bulletPattern")}`,
                  `- ${t("ai.bulletRecommendation")}`,
                  "",
                  t("ai.dashboardCta"),
                ].join("\n");
              }
              if (contentKey === "ai.fullQuickLook") {
                return [
                  t("ai.quickLook", { queryPart }),
                  "",
                  `- ${t("ai.quickBullet1")}`,
                  `- ${t("ai.quickBullet2")}`,
                  `- ${t("ai.quickBullet3")}`,
                  "",
                  t("ai.quickHint"),
                ].join("\n");
              }
              return t(contentKey, params);
            })()}
          </ReactMarkdown>
        </div>

        {hasDataset && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={view === "table" ? "default" : "outline"}
              onClick={() => setView(view === "table" ? "none" : "table")}
              className="h-7 text-xs"
            >
              <TableIcon className="mr-1 h-3 w-3" /> {t("actions.table")}
            </Button>
            <Button
              size="sm"
              variant={view === "visual" ? "default" : "outline"}
              onClick={() => setView(view === "visual" ? "none" : "visual")}
              className="h-7 text-xs"
            >
              <BarChart3 className="mr-1 h-3 w-3" /> {t("actions.visual")}
            </Button>
          </div>
        )}

        {view === "table" && hasDataset && <InlineTable dataset={dataset!} />}

        {view === "visual" && hasDataset && spec && (
          <button
            onClick={() => visualIdRef.current && onOpenVisual?.(visualIdRef.current)}
            className="block w-full text-left transition hover:opacity-90"
            title={t("actions.expand")}
          >
            <InlineChart dataset={dataset!} spec={spec} />
          </button>
        )}

        {hasChart && onShowDashboard && (
          <div>
            <Button size="sm" variant="outline" onClick={onShowDashboard} className="h-7 text-xs">
              <LayoutDashboard className="mr-1 h-3 w-3" /> {t("actions.showDashboard")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
