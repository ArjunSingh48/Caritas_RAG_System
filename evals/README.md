# Evals

Benchmark harness that hits the running FastAPI backend with a list of
known questions and scores the answers. Not part of the runtime app.

## Run

1. Make sure the backend is up (`docker compose up -d` from repo root) and
   datasets referenced by the benchmark are uploaded.
2. From the repo root:

```bash
cd evals
pip install -r ../backend/requirements.txt
python run_evals.py benchmark_100_simple.json
```

Available benchmarks: `benchmark_100_simple.json` (EN), `_de`, `_fr`, `_it`,
and `benchmark_100_intermediate.json`.

## Files

- `run_evals.py` — driver, calls `POST /api/query` per question.
- `make_schema.py` — generates schema fixtures from raw datasets.
- `benchmark_*.json` — question + expected-answer pairs.
- `schemas/` — pre-computed dataset schemas used by the benchmarks.
- `datasets/raw/`, `prompts/` — placeholders, drop your data/prompts here.
