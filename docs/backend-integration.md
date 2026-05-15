# Connecting the frontend to the FastAPI backend

The Lovable frontend talks to the provided FastAPI backend through TanStack
Start **server functions** (`src/server/backend.functions.ts`). The browser
never calls FastAPI directly; instead it calls our server, which proxies the
request. This hides the backend URL, sidesteps CORS, and gives us a single
place to add auth later.

## What "connectors" are in this project

The backend in `backend.zip` is **self-hosted** — not a third-party SaaS — so
there is no Lovable connector to plug in. It depends on three external
services that you run yourself:

| Service | Purpose | How it's configured |
|---|---|---|
| **PostgreSQL** with the `pgvector` extension | Stores chats, dataset metadata, one table per uploaded sheet, and 384-dim embeddings used for schema RAG | `DATABASE_URL` in `backend/.env` |
| **Ollama** (local LLM runtime) | Runs the SQL-generation and answer models (e.g. `gemma3:4b`) | `OLLAMA_BASE_URL`, `SQL_MODEL`, `ANSWER_MODEL` |
| **sentence-transformers** | Generates the embeddings stored in pgvector. Runs in the FastAPI process — no extra config | — |

So "connecting" really means: (1) start Postgres + Ollama, (2) start FastAPI,
(3) point the frontend at it.

## 1. Start the backend

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL, e.g. postgresql+psycopg2://user:pass@localhost:5432/caritas
# make sure CORS_ORIGINS includes your frontend origin if you ever call FastAPI
# directly from the browser (not needed when going through server functions).

pip install -r requirements.txt

# pull the model into Ollama (choose any tag your hardware supports)
ollama pull gemma3:4b

uvicorn main:app --reload --port 8000
```

Sanity check: `curl http://localhost:8000/api/health` should return
`{"status":"ok","version":"0.1.0"}`.

## 2. Point the frontend at it

Set `BACKEND_API_URL` in your environment (NOT prefixed with `VITE_` — it must
stay server-side). Default is `http://localhost:8000/api`.

## 3. Data flow

1. **Upload** — the user attaches a CSV/XLSX in chat input. The browser parses
   it for the inline preview (so the table modal works instantly), then the
   raw bytes are base64-encoded and sent to `apiUpload` (server fn) →
   `POST /api/upload` on FastAPI. FastAPI loads it into a per-dataset Postgres
   table (`ds_<uuid>_<sheet>`), generates column descriptions via the LLM,
   computes the 384-dim embedding, and returns `dataset_id`. We store that
   `remoteId` on the local `ChatDataset`.

2. **Question** — when the user asks something, `apiQuery` →
   `POST /api/query` runs the **RAG pipeline** server-side:
   schema retrieval → SQL generation (with `sqlglot` validation + retry) →
   SQL execution → natural-language answer. Response: `{answer, sql, rows}`.

3. **Visuals** — we keep the existing frontend logic
   (`pickGraph` + `inline-chart` + `dashboard-panel`). When the response has
   `rows`, we synthesize a `ChatDataset` from them so `InlineTable` and
   `InlineChart` work over the real query result. When the user asks for a
   "dashboard", we additionally create a `ChatVisual` + `ChatDashboard` that
   the dashboard panel renders.

## 4. Mock fallback

If `/api/health` fails (backend down, wrong URL, etc.) the chat header shows
**“Mock mode”** and the existing canned-response pipeline runs so the UI
never appears broken. Once the backend is reachable again the badge turns
green and the next message goes through the real LLM.

## 5. Files to know

- `src/server/backend.server.ts` — low-level fetch helper (server only).
- `src/server/backend.functions.ts` — `apiHealth`, `apiUpload`, `apiQuery`,
  `apiListChats`, `apiCreateChat` server functions.
- `src/lib/backend-client.ts` — browser wrapper + health cache.
- `src/components/backend-status-badge.tsx` — green/amber dot in chat header.
- `src/routes/chat.tsx` — `handleSend` orchestrates upload → query → visuals
  with the mock fallback.
