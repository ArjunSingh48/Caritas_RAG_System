// Server-only helpers for talking to the FastAPI backend.
// BACKEND_API_URL is read at request time (not at module load) so the env
// is reliably picked up in the Worker SSR runtime.

export function getBackendBaseUrl(): string {
  const raw = process.env.BACKEND_API_URL || "http://localhost:8000/api";
  return raw.replace(/\/+$/, "");
}

export class BackendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function backendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getBackendBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new BackendError(
      503,
      `Backend unreachable at ${url}: ${(err as Error).message}`,
    );
  }
  return res;
}

export async function backendJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await backendFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    throw new BackendError(res.status, text || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
