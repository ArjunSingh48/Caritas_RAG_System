# Backend (FastAPI)

Text-to-SQL service for the Caritas chat UI. See the [root README](../README.md)
for the one-command Docker setup. This file covers running the backend
**without** Docker.

## Manual run

Requires Python 3.11+, a Postgres 14+ with `pgvector`, and a running Ollama.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit DATABASE_URL, e.g.
#   DATABASE_URL=postgresql+psycopg2://caritas:caritas@localhost:5432/caritas
# make sure pgvector is installed in that DB:
#   CREATE EXTENSION IF NOT EXISTS vector;

# pull the model
ollama pull gemma3:4b

uvicorn main:app --reload --port 8000
```

Health: `curl http://localhost:8000/api/health` → `{"status":"ok",...}`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/health` | Liveness |
| `POST` | `/api/upload` | Multipart `file` + optional `chat_id`. Returns one row per sheet. |
| `POST` | `/api/query`  | `{question, user_id?, chat_id?, dataset_ids?}` → `{answer, sql, rows}` |
| `GET`  | `/api/upload` | List datasets |
| `GET`  | `/api/upload/{id}` | Dataset metadata |
| `GET`  | `/api/upload/{id}/preview` | First 5 rows |
| `DELETE` | `/api/upload/{id}` | Drop dataset + its table |
| `DELETE` | `/api/upload/all` | Wipe all datasets + orphan tables |
| `*` | `/api/chats` | Chat CRUD scoped by `user_id` |

## Code map

- `main.py` — FastAPI app, CORS, table create-on-boot.
- `app/core/config.py` — env-driven settings (Pydantic).
- `app/db/` — SQLAlchemy engine, models (`Chat`, `Dataset`).
- `app/routes/upload.py` — file → per-sheet Postgres table + schema embedding.
- `app/routes/query.py` — schema fetch → SQL gen → execute → answer gen.
- `app/routes/chats.py` — chat CRUD.
- `app/services/llm_service.py` — Ollama prompts (SQL + answer).
- `app/services/embedding_service.py` — sentence-transformers → pgvector.
- `migrations/0001_initial.sql` — reference schema (live schema is created via SQLAlchemy on boot).
- `cleanup_datasets.py` — utility to drop orphan `ds_*` tables.
