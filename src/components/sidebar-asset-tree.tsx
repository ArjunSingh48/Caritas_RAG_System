import { useState } from "react";
import {
  ChevronRight,
  Database,
  BarChart3,
  LayoutDashboard,
  Eye,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useChats } from "@/hooks/use-chats";
import type { ChatRecord } from "@/lib/chats";

export type AssetType = "dataset" | "visual" | "dashboard";
export interface AssetSelection {
  type: AssetType;
  id: string;
  chatId: string;
}

interface SidebarAssetTreeProps {
  chat: ChatRecord;
  onSelectAsset: (sel: AssetSelection) => void;
}

interface SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  children: React.ReactNode;
}

function Section({ icon: Icon, label, count, children }: SectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        <Icon className="h-3 w-3" />
        <span className="flex-1 truncate text-left">{label}</span>
        <span className="text-[10px] text-muted-foreground/70">{count}</span>
      </button>
      {open && <div className="ml-4 mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

interface AssetRowProps {
  name: string;
  onView: () => void;
  onDelete: () => void;
  viewLabel: string;
  deleteLabel: string;
}

function AssetRow({ name, onView, onDelete, viewLabel, deleteLabel }: AssetRowProps) {
  return (
    <div className="group/row flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted/60">
      <button
        onClick={onView}
        className="flex-1 truncate text-left text-xs text-foreground/80 hover:text-foreground"
        title={name}
      >
        {name}
      </button>
      <button
        onClick={onView}
        className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover/row:flex"
        aria-label={viewLabel}
        title={viewLabel}
      >
        <Eye className="h-3 w-3" />
      </button>
      <button
        onClick={onDelete}
        className="hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/row:flex"
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function SidebarAssetTree({ chat, onSelectAsset }: SidebarAssetTreeProps) {
  const { t } = useTranslation();
  const { removeDataset, removeVisual, removeDashboard } = useChats();
  const [pending, setPending] = useState<
    | { type: AssetType; id: string; name: string }
    | null
  >(null);

  const handleDelete = () => {
    if (!pending) return;
    if (pending.type === "dataset") removeDataset(chat.id, pending.id);
    else if (pending.type === "visual") removeVisual(chat.id, pending.id);
    else removeDashboard(chat.id, pending.id);
  };

  return (
    <div className="space-y-1.5 px-2 pb-2 pt-1">
      <Section icon={Database} label={t("sidebar.datasets")} count={chat.datasets.length}>
        {chat.datasets.length === 0 ? (
          <p className="px-1.5 text-[11px] text-muted-foreground/70">{t("sidebar.empty")}</p>
        ) : (
          chat.datasets.map((d) => (
            <AssetRow
              key={d.id}
              name={d.name}
              onView={() => onSelectAsset({ type: "dataset", id: d.id, chatId: chat.id })}
              onDelete={() => setPending({ type: "dataset", id: d.id, name: d.name })}
              viewLabel={t("actions.view")}
              deleteLabel={t("actions.delete")}
            />
          ))
        )}
      </Section>

      <Section icon={BarChart3} label={t("sidebar.visuals")} count={chat.visuals.length}>
        {chat.visuals.length === 0 ? (
          <p className="px-1.5 text-[11px] text-muted-foreground/70">{t("sidebar.empty")}</p>
        ) : (
          chat.visuals.map((v) => (
            <AssetRow
              key={v.id}
              name={v.name}
              onView={() => onSelectAsset({ type: "visual", id: v.id, chatId: chat.id })}
              onDelete={() => setPending({ type: "visual", id: v.id, name: v.name })}
              viewLabel={t("actions.view")}
              deleteLabel={t("actions.delete")}
            />
          ))
        )}
      </Section>

      <Section
        icon={LayoutDashboard}
        label={t("sidebar.dashboards")}
        count={chat.dashboards.length}
      >
        {chat.dashboards.length === 0 ? (
          <p className="px-1.5 text-[11px] text-muted-foreground/70">{t("sidebar.empty")}</p>
        ) : (
          chat.dashboards.map((d) => (
            <AssetRow
              key={d.id}
              name={d.name}
              onView={() => onSelectAsset({ type: "dashboard", id: d.id, chatId: chat.id })}
              onDelete={() => setPending({ type: "dashboard", id: d.id, name: d.name })}
              viewLabel={t("actions.view")}
              deleteLabel={t("actions.delete")}
            />
          ))
        )}
      </Section>

      <ConfirmDeleteDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
