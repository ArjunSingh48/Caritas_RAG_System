# Caritas AI Dashboard

NGO-friendly chat UI that turns Excel/CSV uploads into answers + auto-generated charts. Built for the Caritas Switzerland hackathon.

## Project structure

This is a **monorepo** with three logical parts. The frontend lives at the
repo root (a hard requirement of the Lovable build pipeline — moving it would
break the in-Lovable preview), and the backend + evals sit in their own
top-level folders.

```
caritas/
│
├── 🖥️  FRONTEND  (TanStack Start + React, runs on bun dev / Cloudflare Workers)
│   ├── src/                  ← all UI code, routes, hooks, lib
│   │   ├── routes/           ← file-based routing (index, chat, login, …)
│   │   ├── components/       ← shadcn UI + app components
│   │   ├── hooks/            ← React hooks (auth, chats, …)
│   │   └── lib/              ← backend client, i18n, utils
│   ├── public/               ← static assets
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── wrangler.jsonc        ← Cloudflare Workers config
│   └── .env.example          ← BACKEND_API_URL
│
├── ⚙️  BACKEND   (FastAPI + Postgres/pgvector + Ollama, text-to-SQL)
│   └── backend/
│       ├── app/
│       │   ├── core/         ← settings
│       │   ├── db/           ← SQLAlchemy models + session
│       │   ├── routes/       ← /upload, /query, /chats, /schema
│       │   └── services/     ← LLM + embedding services
│       ├── migrations/
│       ├── main.py
│       ├── requirements.txt
│       ├── Dockerfile
│       └── README.md         ← backend-only docs
│
├── 🧪  EVALS    (benchmark harness — dev tool, not runtime)
│   └── evals/
│       ├── benchmark_*.json  ← EN / DE / FR / IT question sets
│       ├── datasets/raw/     ← test Excel files
│       ├── schemas/          ← expected schemas
│       ├── run_evals.py
│       ├── make_schema.py
│       └── README.md         ← how to run benchmarks
│
└── 🐳  ORCHESTRATION
    └── docker-compose.yml    ← boots db + ollama + backend in one command
```

**Why frontend at root?** Lovable's build/preview expects `package.json` and
`src/` at the repo root. Keeping it there means you can keep editing in
Lovable *and* `git clone` locally — both work. The backend and evals are
fully self-contained in their own folders.

The frontend has a built-in **mock mode** — if the backend is unreachable, the chat header shows an amber dot and canned responses are used so the UI is never broken.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2)
- Node 20+ or [Bun](https://bun.sh)
- ~6 GB free disk for the Ollama model

## 1. Start the backend stack

From the repo root:

```bash
docker compose up -d
# first time only — pull the LLM into the Ollama container (~3 GB):
docker compose exec ollama ollama pull gemma3:4b
```

Wait until both the database and Ollama are healthy before testing queries:

```bash
docker compose ps
```

Expected state after the first pull finishes:
- `db` → `healthy`
- `ollama` → `healthy`
- `backend` → `running`

Sanity check:

```bash
curl http://localhost:8000/api/health
# {"status":"ok","version":"0.1.0"}
```

What just started:
- **db** — Postgres 16 with `pgvector`, on `localhost:5432` (`caritas`/`caritas`/`caritas`).
- **ollama** — local LLM runtime on `localhost:11434`.
- **backend** — FastAPI on `localhost:8000`, auto-creates tables on first boot.

## 2. Start the frontend

```bash
cp .env.example .env       # sets BACKEND_API_URL=http://localhost:8000/api
bun install                # or: npm install
bun dev                    # or: npm run dev
```

If you downloaded a fresh ZIP from GitHub, run the commands from the repo root exactly in that order.

Open the printed URL (usually `http://localhost:5173`). The status badge in the chat header should turn **green** ("Backend online") within ~15s.

## 3. Use it

1. Sign in (mock auth — any email/password works).
2. Start a chat → upload one or more `.xlsx` / `.csv` files.
3. Ask questions like *"What is the grant success rate by region and donor type?"* — the backend embeds the schema, asks the LLM to write SQL, runs it against the per-dataset table, and returns an answer + rows. The frontend renders an inline chart automatically.

## How the "RAG" actually works

The LLM never sees the raw cells. On upload:
1. Each Excel sheet → its own Postgres table (`ds_<uuid>_<sheet>`).
2. The column schema is embedded with `sentence-transformers` and stored in `pgvector`.

On query:
1. Backend fetches the schemas for the chat's datasets.
2. Ollama writes SQL → validated with `sqlglot` → executed.
3. Ollama summarizes the result rows into a natural-language answer.

So scaling = scaling Postgres + Ollama, not stuffing tokens.

## Stopping / resetting

```bash
docker compose down       # stop, keep data
docker compose down -v    # stop + wipe DB, uploads, model cache
```

## Running the evals

See [`evals/README.md`](evals/README.md).

## Deploying

- **Frontend** → published from Lovable (Cloudflare Workers). Set the `BACKEND_API_URL` runtime secret to your backend's public `/api` URL.
- **Backend** → any host that can run Docker + Postgres + Ollama (Fly.io, Render, a VPS with a GPU). Cloudflare Workers cannot host it (Python + native deps + multi-GB model).
- For the hackathon demo, running everything locally with `docker compose up` is the simplest path.

## Configuration knobs

`backend/.env` (overrides `docker-compose.yml` env if you run backend outside Docker):

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | `postgresql+psycopg2://...` with pgvector enabled |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Where Ollama is reachable |
| `SQL_MODEL` / `ANSWER_MODEL` | `gemma3:4b` | Any tag you've `ollama pull`ed |
| `GENERATE_COLUMN_DESCRIPTION` | `False` | `True` makes uploads slower but improves SQL quality |
| `CORS_ORIGINS` | includes `:5173` | JSON array string |

> ⚠️ The default in `app/core/config.py` is `gemma4:e4b`, which doesn't exist. Always set `SQL_MODEL` / `ANSWER_MODEL` via env (compose already does this).

## Troubleshooting

- **Hydration warning on first load** — if you previously had an older local build, stop the dev server and start `bun dev` again so the fresh root layout is used.
- **Badge stays amber** — `curl http://localhost:8000/api/health`. If 404/refused: `docker compose logs backend`.
- **`relation "datasets" does not exist`** — backend hasn't finished init. Wait 10s and retry, or `docker compose restart backend`.
- **`model "gemma3:4b" not found`** — run `docker compose exec ollama ollama pull gemma3:4b`.
- **Upload works but query returns 500** — the model usually is not ready yet. Check `docker compose logs -f ollama backend`, wait for the pull to finish, then retry.
- **Ollama OOM** — switch to a smaller tag (`gemma2:2b`) and update both `SQL_MODEL` and `ANSWER_MODEL`.
- **Lovable preview can't reach my backend** — by design. The hosted preview can't talk to your `localhost`. Either run the frontend locally, or expose the backend with `ngrok http 8000` and set `BACKEND_API_URL` to the public URL.

## Fresh-machine checklist

After downloading the project ZIP from GitHub, this sequence should work on a clean machine:

1. Install Docker Desktop (or Docker Engine + Compose v2)
2. Install Bun or Node 20+
3. From the repo root: `docker compose up -d`
4. Pull the local model once: `docker compose exec ollama ollama pull gemma3:4b`
5. Create frontend env: `cp .env.example .env`
6. Install frontend packages: `bun install`
7. Start frontend: `bun dev`
8. Open the local URL and verify `curl http://localhost:8000/api/health`

## Pushing to GitHub

In the Lovable editor: **+ menu → GitHub → Connect project**. Lovable will auto-sync every commit to that repo from then on. Teammates can `git clone` and follow steps 1–2 above.
