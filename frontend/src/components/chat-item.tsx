import { useState } from "react";
import { ChevronRight, MessageSquare, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { SidebarAssetTree, type AssetSelection } from "@/components/sidebar-asset-tree";
import type { ChatRecord } from "@/lib/chats";

interface ChatItemProps {
  chat: ChatRecord;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onSelectAsset: (sel: AssetSelection) => void;
}

export function ChatItem({ chat, isActive, onOpen, onDelete, onSelectAsset }: ChatItemProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-md border-l-2 transition-colors",
        isActive ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60"
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Toggle chat details"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button
          onClick={onOpen}
          className={cn(
            "flex flex-1 items-center gap-2 truncate text-left text-sm",
            isActive ? "font-semibold text-foreground" : "text-foreground/90"
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="truncate">{chat.title || t("sidebar.newChat")}</span>
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
          aria-label={t("actions.delete")}
          title={t("actions.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && <SidebarAssetTree chat={chat} onSelectAsset={onSelectAsset} />}

      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={onDelete}
      />
    </div>
  );
}
