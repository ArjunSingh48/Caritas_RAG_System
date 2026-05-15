// Browser-side wrapper around backend server functions.
// Provides a mock-fallback so the UI keeps working when FastAPI isn't running.
import {
  apiHealth,
  apiEnsureChat,
  apiUpload,
  apiQuery,
  type BackendUploadResponse,
  type BackendQueryResponse,
} from "@/lib/backend.functions";

let healthCache: { ok: boolean; checkedAt: number } | null = null;
const HEALTH_TTL = 15_000;

export async function isBackendOnline(): Promise<boolean> {
  const now = Date.now();
  if (healthCache && now - healthCache.checkedAt < HEALTH_TTL) {
    return healthCache.ok;
  }
  try {
    const res = await apiHealth();
    healthCache = { ok: res.ok === true, checkedAt: now };
  } catch {
    healthCache = { ok: false, checkedAt: now };
  }
  return healthCache.ok;
}

export function invalidateHealth() {
  healthCache = null;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Backend (FastAPI) requires chat_id to be a valid UUID. Older clients may
// have generated `${Date.now()}-<rand>` ids; strip those before sending so
// the request validates instead of 422-ing.
const safeChatId = (id?: string) => (id && UUID_RE.test(id) ? id : undefined);

export async function ensureBackendChat(chatId?: string): Promise<string | undefined> {
  const safeId = safeChatId(chatId);
  if (!safeId) return undefined;
  const res = await apiEnsureChat({ data: { chatId: safeId } });
  return res.chat_id;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      // @ts-expect-error - subarray is fine here
      bytes.subarray(i, i + chunk),
    );
  }
  return btoa(binary);
}

export async function uploadFileToBackend(
  file: File,
  chatId?: string,
): Promise<BackendUploadResponse[]> {
  const base64 = await fileToBase64(file);
  return apiUpload({
    data: {
      filename: file.name,
      contentType: file.type,
      base64,
      chatId: safeChatId(chatId),
    },
  });
}

export async function queryBackend(
  question: string,
  opts?: { datasetIds?: string[]; chatId?: string; userId?: string },
): Promise<BackendQueryResponse> {
  return apiQuery({
    data: {
      question,
      datasetIds: opts?.datasetIds,
      chatId: safeChatId(opts?.chatId),
      userId: opts?.userId,
    },
  });
}

export type { BackendUploadResponse, BackendQueryResponse };
