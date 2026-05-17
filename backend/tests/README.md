# Backend tests

Four suites live here. Run them all with `pytest backend/tests` from the
`backend/` directory.

| Suite | What it covers | Needs running backend? |
| --- | --- | --- |
| `test_query_planner.py` | Static checks: the planner produces SQL of the expected shape for each suggested question, and infers table roles from sheet/column names. | No |
| `test_planner_regression.py` | Loads the IC Funding Gap mock workbook into in-memory DuckDB, runs every deterministic planner's SQL, and asserts row-by-row against a ground-truth pandas computation. Catches drift in any of the 12 suggested questions. | No |
| `test_random_dataset.py` | Synthetic e-commerce CSV → proves the planner is **not** hard-coded to IC Funding Gap (returns `None`), the guard accepts relevant questions, and the guard refuses chit-chat / off-topic / vague prompts. | No |
| `test_e2e_funding_gap.py` | Live HTTP test: uploads the mock workbook to a running backend, runs each suggested question, and asserts the **answer text** contains the expected ground-truth numbers (not just "non-empty"). Also verifies an off-topic question is politely refused. | **Yes** |

## Offline (CI-safe) — runs anywhere

```bash
cd backend
pip install -r requirements.txt pytest duckdb
pytest tests/test_query_planner.py tests/test_planner_regression.py tests/test_random_dataset.py -v
```

These suites cover:

- All 12 suggested questions from the IC Funding Gap README, asserted
  against ground-truth values computed directly from the workbook.
- Three documented anomalies (NULL approved amounts on non-successful
  grants, Status 1-3 projects with no budget rows, active-but-past-end
  data-quality check).
- The 7-vs-8 region wording trap.
- The "average per entity" trap (per-project aggregation, not line-item
  averaging).
- The funding-gap formula (`costs + indirect − income − co-financing`).
- A foreign synthetic dataset to confirm the planner doesn't accidentally
  fire for non-IC schemas.
- Guard behaviour for chit-chat, weather/crypto/jokes, vague aggregates,
  and empty input.

## Live E2E — point at your backend

```bash
docker compose up -d backend
BACKEND_URL=http://localhost:8000 pytest backend/tests/test_e2e_funding_gap.py -s -v
```

The script uploads the workbook fresh into a new chat, then asserts each
answer **contains the right numbers**, not just that it returned something.
This is the strict check you want to run after any prompt or planner edit.

## Adding a new question

1. Add the question + the formula it should answer to
   `test_planner_regression.py` (offline ground truth) and to
   `test_e2e_funding_gap.py` (live answer text).
2. If the deterministic planner should handle it, add a routing rule in
   `backend/app/services/query_planner.py::maybe_plan_structured_query`
   and write the SQL.
3. If the LLM fallback should handle it, no code change is needed — the
   test will tell you whether the prompt and validator do their job.

## Adding a new dataset

The planner only fires when it detects the IC Funding Gap schema (presence
of `budget_actuals` / `grant_applications` columns). For any other
dataset, the request falls through to the LLM SQL generator with a
**generic** prompt — no IC-specific rules are injected unless the data
clearly matches. Use `test_random_dataset.py` as the template for adding
regression coverage for a new dataset family.
