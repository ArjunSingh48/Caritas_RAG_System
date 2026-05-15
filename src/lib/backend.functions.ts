// Server functions proxying to the FastAPI backend.
import { createServerFn } from "@tanstack/react-start";
import { backendFetch, backendJson, BackendError } from "@/server/backend.server";

// ---------- Types mirroring backend Pydantic models ----------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };
type JsonObject = { [k: string]: JsonValue };

export interface BackendUploadResponse {
  dataset_id: string;
  filename: string;
  sheet_name: string | null;
  rows: number;
  columns: string[];
  preview: JsonObject[];
  df_schema: JsonObject;
}

export interface BackendQueryResponse {
  question: string;
  answer: string;
  sql: string | null;
  rows: JsonObject[];
  chart: JsonValue | null;
}

export interface BackendChat {
  chat_id: string;
  name: string;
}

export interface BackendEnsureChatResponse {
  chat_id: string;
  name: string;
  created: boolean;
}

// ---------- Health ----------

export const apiHealth = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const data = await backendJson<{ status: string; version: string }>(
      "/health",
    );
    return { ok: true as const, ...data };
  } catch (err) {
    const e = err as BackendError;
    return { ok: false as const, status: e.status ?? 0, error: e.message };
  }
});

// ---------- Chats (optional; UI also keeps local chats) ----------

export const apiListChats = createServerFn({ method: "GET" }).handler(
  async () => backendJson<BackendChat[]>("/chats"),
);

export const apiCreateChat = createServerFn({ method: "POST" }).handler(
  async () =>
    backendJson<BackendChat>("/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
);

export const apiEnsureChat = createServerFn({ method: "POST" })
  .inputValidator((input: { chatId: string }) => input)
  .handler(async ({ data }) =>
    backendJson<BackendEnsureChatResponse>("/chats/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: data.chatId }),
    }),
  );

// ---------- Upload ----------
// We accept file bytes as base64 from the browser and rebuild a multipart body
// on the server before forwarding to FastAPI's POST /api/upload.

export const apiUpload = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      filename: string;
      contentType: string;
      base64: string;
      chatId?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], {
      type: data.contentType || "application/octet-stream",
    });
    const form = new FormData();
    form.append("file", blob, data.filename);
    if (data.chatId) form.append("chat_id", data.chatId);

    const res = await backendFetch("/upload", { method: "POST", body: form });
    const text = await res.text();
    if (!res.ok) {
      throw new BackendError(res.status, text || `Upload failed (${res.status})`);
    }
    return JSON.parse(text) as BackendUploadResponse[];
  });

// ---------- Query ----------

export const apiQuery = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      question: string;
      datasetIds?: string[];
      chatId?: string;
      userId?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const datasetIds = Array.from(
      new Set((data.datasetIds ?? []).filter(Boolean)),
    );

    // Matches FastAPI QueryRequest: { question, user_id?, chat_id?, dataset_ids? }
    try {
      return await backendJson<BackendQueryResponse>("/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: data.question,
          user_id: data.userId,
          chat_id: data.chatId,
          dataset_ids: datasetIds.length ? datasetIds : undefined,
        }),
      });
    } catch (err) {
      if (err instanceof BackendError) {
        let detail = err.message;
        try {
          const parsed = JSON.parse(err.message) as { detail?: string };
          if (parsed?.detail) detail = parsed.detail;
        } catch {
          // keep raw text message when backend returned plain text
        }
        throw new BackendError(err.status, `Query failed (${err.status}): ${detail}`);
      }
      throw err;
    }
  });
