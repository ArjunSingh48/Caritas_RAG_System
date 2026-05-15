import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type ChatRecord,
  type ChatMessage,
  type ChatDataset,
  type ChatDashboard,
  type ChatVisual,
  listChats,
  saveChats,
  makeNewChat,
  deriveTitle,
} from "@/lib/chats";
import { useAuth } from "@/hooks/use-auth";

interface ChatsContextValue {
  chats: ChatRecord[];
  activeChatId: string | null;
  activeChat: ChatRecord | null;
  newChat: () => string;
  openChat: (id: string) => void;
  appendMessage: (id: string, msg: ChatMessage) => void;
  addDataset: (id: string, ds: ChatDataset) => void;
  addVisual: (id: string, v: ChatVisual) => void;
  addDashboard: (id: string, db: ChatDashboard) => void;
  deleteChat: (id: string) => void;
  removeDataset: (chatId: string, datasetId: string) => void;
  removeVisual: (chatId: string, visualId: string) => void;
  removeDashboard: (chatId: string, dashboardId: string) => void;
  clearActive: () => void;
}

const ChatsContext = createContext<ChatsContextValue | undefined>(undefined);

function sortRecent(list: ChatRecord[]) {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function ChatsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setChats([]);
      setActiveChatId(null);
      return;
    }
    setChats(listChats(email));
    setActiveChatId(null);
  }, [email]);

  useEffect(() => {
    if (email) saveChats(email, chats);
  }, [chats, email]);

  const update = useCallback((updater: (prev: ChatRecord[]) => ChatRecord[]) => {
    setChats((prev) => sortRecent(updater(prev)));
  }, []);

  const newChat = useCallback((): string => {
    const chat = makeNewChat();
    update((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    return chat.id;
  }, [update]);

  const openChat = useCallback(
    (id: string) => {
      const now = Date.now();
      update((prev) => prev.map((c) => (c.id === id ? { ...c, updatedAt: now } : c)));
      setActiveChatId(id);
    },
    [update]
  );

  const appendMessage = useCallback(
    (id: string, msg: ChatMessage) => {
      const now = Date.now();
      update((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const messages = [...c.messages, msg];
          let title = c.title;
          if (msg.role === "user" && (title === "New Chat" || !title)) {
            title = deriveTitle(msg.content);
          }
          return { ...c, messages, title, updatedAt: now };
        })
      );
    },
    [update]
  );

  const addDataset = useCallback(
    (id: string, ds: ChatDataset) => {
      update((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, datasets: [...c.datasets, ds], updatedAt: Date.now() } : c
        )
      );
    },
    [update]
  );

  const addVisual = useCallback(
    (id: string, v: ChatVisual) => {
      update((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          if (c.visuals.some((x) => x.id === v.id)) return c;
          return { ...c, visuals: [...c.visuals, v], updatedAt: Date.now() };
        })
      );
    },
    [update]
  );

  const addDashboard = useCallback(
    (id: string, db: ChatDashboard) => {
      update((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, dashboards: [...c.dashboards, db], updatedAt: Date.now() } : c
        )
      );
    },
    [update]
  );

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => {
      const next = sortRecent(prev.filter((c) => c.id !== id));
      setActiveChatId((current) => (current === id ? (next[0]?.id ?? null) : current));
      return next;
    });
  }, []);

  const removeDataset = useCallback(
    (chatId: string, datasetId: string) => {
      update((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, datasets: c.datasets.filter((d) => d.id !== datasetId) } : c
        )
      );
    },
    [update]
  );

  const removeVisual = useCallback(
    (chatId: string, visualId: string) => {
      update((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                visuals: c.visuals.filter((v) => v.id !== visualId),
                dashboards: c.dashboards.map((d) => ({
                  ...d,
                  visualIds: d.visualIds.filter((vid) => vid !== visualId),
                })),
              }
            : c
        )
      );
    },
    [update]
  );

  const removeDashboard = useCallback(
    (chatId: string, dashboardId: string) => {
      update((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, dashboards: c.dashboards.filter((d) => d.id !== dashboardId) }
            : c
        )
      );
    },
    [update]
  );

  const clearActive = useCallback(() => setActiveChatId(null), []);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  return (
    <ChatsContext.Provider
      value={{
        chats,
        activeChatId,
        activeChat,
        newChat,
        openChat,
        appendMessage,
        addDataset,
        addVisual,
        addDashboard,
        deleteChat,
        removeDataset,
        removeVisual,
        removeDashboard,
        clearActive,
      }}
    >
      {children}
    </ChatsContext.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error("useChats must be used within ChatsProvider");
  return ctx;
}
