// Per-user chat persistence (frontend only, localStorage).

import type { GraphSpec } from "@/lib/graph-pick";
import type { ParsedSheet } from "@/lib/parse-file";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  // Raw text content (for user messages and legacy AI messages).
  content: string;
  // Optional translation key for AI mock messages so they re-translate when
  // the user switches language. When present, ChatMessage renders t(contentKey).
  contentKey?: string;
  contentParams?: Record<string, unknown>;
  hasChart?: boolean;
  query?: string;
  files?: { name: string; size: number }[];
  dashboardId?: string;
  // Optional inline result rows from the backend /query endpoint.
  resultRows?: Record<string, unknown>[];
  resultColumns?: string[];
  sql?: string;
}

export interface ChatDatasetColumn {
  name: string;
  type: "number" | "date" | "string";
}

export interface ChatDataset {
  id: string;
  name: string;
  size?: number;
  rows?: number;
  columns?: ChatDatasetColumn[];
  data?: Record<string, unknown>[];
  sheets?: ParsedSheet[];
  activeSheetName?: string;
  // Backend dataset_id when uploaded to FastAPI; absent when running mock-only.
  remoteId?: string;
  tableDescription?: string;
}

export interface ChatVisual {
  id: string;
  name: string;
  datasetId: string;
  query: string;
  spec: GraphSpec;
  createdAt: number;
}

export interface ChatDashboard {
  id: string;
  name: string;
  visualIds: string[];
  summary?: string;
}

export interface ChatRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  datasets: ChatDataset[];
  visuals: ChatVisual[];
  dashboards: ChatDashboard[];
  createdAt: number;
  updatedAt: number;
}

const keyFor = (email: string) => `chats_${email.toLowerCase()}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function sortByRecent(chats: ChatRecord[]): ChatRecord[] {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
}

function migrate(chat: Partial<ChatRecord>): ChatRecord {
  return {
    id: isUuid(chat.id) ? (chat.id as string) : newChatId(),
    // Legacy chats may store an English "New Chat" — strip it so UI shows translated fallback.
    title: chat.title === "New Chat" ? "" : chat.title ?? "",
    messages: chat.messages ?? [],
    datasets: chat.datasets ?? [],
    visuals: chat.visuals ?? [],
    dashboards: (chat.dashboards ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      visualIds: (d as ChatDashboard).visualIds ?? [],
      summary: (d as ChatDashboard).summary,
    })),
    createdAt: chat.createdAt ?? Date.now(),
    updatedAt: chat.updatedAt ?? Date.now(),
  };
}

export function listChats(email: string): ChatRecord[] {
  if (typeof window === "undefined" || !email) return [];
  try {
    const raw = localStorage.getItem(keyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ChatRecord>[];
    return sortByRecent(parsed.map(migrate));
  } catch {
    return [];
  }
}

export function saveChats(email: string, chats: ChatRecord[]) {
  if (typeof window === "undefined" || !email) return;
  localStorage.setItem(keyFor(email), JSON.stringify(sortByRecent(chats)));
}

export function newChatId(): string {
  // Backend (FastAPI) validates chat_id as a UUID, so we must use UUIDs everywhere.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function makeNewChat(): ChatRecord {
  const now = Date.now();
  return {
    id: newChatId(),
    title: "",
    messages: [],
    datasets: [],
    visuals: [],
    dashboards: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 30 ? trimmed.slice(0, 30) + "…" : trimmed;
}
