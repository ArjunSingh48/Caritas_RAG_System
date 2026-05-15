"""
Run NL-to-SQL evaluation across one or more Ollama models.

Usage:
    python run_evals.py
    python run_evals.py --models qwen3:1.7b llama3.2
    python run_evals.py --cases benchmark_100_simple.json --models qwen3:1.7b --output results.json
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

import duckdb
import httpx
import pandas as pd

EVALS_DIR = Path(__file__).parent
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODELS = ["qwen3:1.7b"]
CASES_FILE = EVALS_DIR / "benchmark_100_simple.json"
SCHEMA_FILE = EVALS_DIR / "schemas" / "IC_Funding_Gap_MockData.json"


# ---------------------------------------------------------------------------
# Table registry — resolves short names ("projects") to full table dicts
# ---------------------------------------------------------------------------


def load_table_registry(schema_path: Path) -> dict[str, dict]:
    """Build a name→table-dict mapping from a schema JSON file, keyed by sheet name."""
    if not schema_path.exists():
        return {}
    with open(schema_path) as f:
        tables = json.load(f)
    return {
        t["sheet"]: {
            "name": t["sheet"],
            "file": t["file"],
            "sheet": t["sheet"],
            "schema": t["schema"],
        }
        for t in tables
        if t.get("sheet")
    }


def resolve_tables(tables: list, registry: dict) -> list[dict]:
    """Convert string table names to full dicts using the registry; pass dicts through."""
    resolved = []
    for t in tables:
        if isinstance(t, str):
            if t not in registry:
                raise KeyError(f"Table '{t}' not found in schema registry")
            resolved.append(registry[t])
        else:
            resolved.append(t)
    return resolved


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------


def ollama_generate(model: str, prompt: str, base_url: str) -> str:
    resp = httpx.post(
        f"{base_url}/api/generate",
        json={"model": model, "prompt": prompt, "stream": False, "think": False},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["response"].strip()


# ---------------------------------------------------------------------------
# Prompt — identical format to backend/app/services/llm_service.py
# ---------------------------------------------------------------------------


def _col_def(col: str, info: dict) -> str:
    parts = [f"{col} ({info['dtype']})"]
    if info.get("description"):
        parts.append(info["description"])
    if info.get("sample_values"):
        samples = ", ".join(str(v) for v in info["sample_values"][:3])
        parts.append(f"e.g. {samples}")
    return " — ".join(parts)


def build_prompt(tables: list[dict], question: str) -> str:
    table_blocks = []
    for t in tables:
        col_lines = "\n".join(f"    {_col_def(col, info)}" for col, info in t["schema"].items())
        table_blocks.append(f"Table: {t['name']}\n{col_lines}")
    tables_section = "\n\n".join(table_blocks)

    return f"""You are an expert SQL assistant working with a PostgreSQL database.

Available tables:
{tables_section}

User question: "{question}"

Rules:
- Each column belongs ONLY to the table it is listed under. Never reference a column in a table that does not contain it.
- To use a column from another table you MUST JOIN that table on the shared key (project_id links projects, budget_actuals, and grant_applications).
- Use ONLY the exact table and column names listed above. Do not invent or modify them.
- Only include tables whose columns are actually needed. If one table is sufficient, use only that table.
- Return ONLY the raw SQL SELECT query — no explanation, no markdown, no code fences.
SQL:"""


# ---------------------------------------------------------------------------
# DuckDB execution
# ---------------------------------------------------------------------------


def load_table(conn: duckdb.DuckDBPyConnection, table: dict, base_dir: Path) -> None:
    if not table.get("file"):
        return
    file_path = (base_dir / table["file"]).resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"Data file not found: {file_path}")

    # Build dtype overrides from schema: force "string" columns to str so pandas/DuckDB
    # don't infer them as int64 (which breaks WHERE col = 'P002' comparisons).
    str_cols = {
        col: str
        for col, info in table.get("schema", {}).items()
        if info.get("dtype") == "string"
    }

    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(file_path, dtype=str_cols)
    elif suffix in {".xlsx", ".xls"}:
        sheet = table.get("sheet")
        df = pd.read_excel(file_path, sheet_name=sheet if sheet else 0, dtype=str_cols)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    conn.register(table["name"], df)


def execute_sql(
    sql: str, tables: list[dict], base_dir: Path
) -> tuple[list[dict], str | None]:
    conn = duckdb.connect()
    try:
        for t in tables:
            load_table(conn, t, base_dir)
        result = conn.execute(sql)
        cols = [d[0] for d in result.description]
        rows = [dict(zip(cols, row)) for row in result.fetchall()]
        return rows, None
    except Exception as e:
        return [], str(e)
    finally:
        conn.close()


def normalise_sql(sql: str) -> str:
    return re.sub(r"\s+", " ", sql.strip().lower())


def _norm_value(v):
    """Coerce booleans to int so True/False compare equal to 1/0."""
    if isinstance(v, bool):
        return int(v)
    return v


def normalise_rows(rows: list[dict]) -> list[dict]:
    """Round-trip through JSON (datetimes/Decimals → strings) and coerce booleans to int."""
    rows = json.loads(json.dumps(rows, default=str))
    return [{k: _norm_value(v) for k, v in row.items()} for row in rows]


def value_match(generated: list[dict], expected: list[dict]) -> bool:
    """Loose match: compare row values only (ignore column names) in any order."""

    def row_key(row: dict) -> tuple:
        return tuple(str(v) for v in row.values())

    return sorted(row_key(r) for r in generated) == sorted(row_key(r) for r in expected)


# ---------------------------------------------------------------------------
# Single case runner
# ---------------------------------------------------------------------------


def run_case(case: dict, model: str, base_url: str, base_dir: Path) -> dict:
    tables = case["tables"]
    prompt_tables = case.get("prompt_tables", tables)
    question = case["question"]
    expected_sql = case.get("expected_sql", "")

    prompt = build_prompt(prompt_tables, question)

    t0 = time.time()
    try:
        raw = ollama_generate(model, prompt, base_url)
    except Exception as e:
        return {
            "status": "llm_error",
            "error": str(e),
            "latency_s": round(time.time() - t0, 2),
        }
    latency = round(time.time() - t0, 2)

    generated_sql = re.sub(r"```(?:sql)?|```", "", raw).strip()

    # Use prompt_tables for execution: the model can reference any table it was shown
    generated_rows, exec_error = execute_sql(generated_sql, prompt_tables, base_dir)

    # expected_rows: prefer pre-stored rows (benchmark format), else run expected_sql
    stored_expected = case.get("expected_rows") or (
        case.get("expected_answer")
        if isinstance(case.get("expected_answer"), list)
        else None
    )
    expected_rows: list[dict] = []
    if stored_expected is not None:
        expected_rows = stored_expected
    elif expected_sql:
        expected_rows, _ = execute_sql(expected_sql, prompt_tables, base_dir)

    sql_match = (
        normalise_sql(generated_sql) == normalise_sql(expected_sql)
        if expected_sql
        else None
    )
    _have_expected = bool(expected_rows) and not exec_error
    norm_gen = normalise_rows(generated_rows) if _have_expected else None
    norm_exp = normalise_rows(expected_rows) if _have_expected else None

    result_match = (norm_gen == norm_exp) if _have_expected else None
    val_match = value_match(norm_gen, norm_exp) if _have_expected else None

    return {
        "status": "ok" if not exec_error else "exec_error",
        "generated_sql": generated_sql,
        "expected_sql": expected_sql,
        "exec_error": exec_error,
        "sql_exact_match": sql_match,
        "result_match": result_match,
        "value_match": val_match,
        "generated_rows_sample": generated_rows[:5],
        "expected_rows_sample": expected_rows[:5],
        "latency_s": latency,
        "prompt": prompt,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="NL-to-SQL eval runner")
    parser.add_argument("--models", nargs="+", default=DEFAULT_MODELS)
    parser.add_argument(
        "--cases",
        type=Path,
        default=CASES_FILE,
        help="Path to cases JSON (queries_gold.json or benchmark_100_simple.json)",
    )
    parser.add_argument(
        "--schema",
        type=Path,
        default=SCHEMA_FILE,
        help="Schema JSON used to resolve string table names",
    )
    parser.add_argument("--ollama", default=OLLAMA_BASE_URL)
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Save results to JSON file (default: evals/results/<benchmark>_<models>.json)",
    )
    parser.add_argument(
        "--all-tables",
        action="store_true",
        help="Pass all tables from the schema to the prompt instead of only per-case tables.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Only run the first N cases (useful for a quick sanity check).",
    )
    args = parser.parse_args()

    if not args.cases.exists():
        print(f"Cases file not found: {args.cases}")
        sys.exit(1)

    results_dir = EVALS_DIR / "results"
    results_dir.mkdir(exist_ok=True)
    benchmark = args.cases.stem

    with open(args.cases) as f:
        cases = json.load(f)

    if not cases:
        print(f"No test cases in {args.cases}.")
        sys.exit(0)

    if args.limit:
        cases = cases[: args.limit]

    registry = load_table_registry(args.schema)
    all_schema_tables = list(registry.values()) if args.all_tables else None

    base_dir = args.cases.parent
    prompts: dict[str, str] = {}

    for model in args.models:
        print(f"\n{'='*60}\nModel: {model}\n{'='*60}")
        model_results = []

        print(f"Loaded {len(cases)} cases from {args.cases}")

        for i, case in enumerate(cases):
            case = {**case, "tables": resolve_tables(case["tables"], registry)}
            if all_schema_tables is not None:
                case = {**case, "prompt_tables": all_schema_tables}
            cid = case.get("id", f"q{i+1:03d}")
            question_preview = case["question"][:55] + (
                "..." if len(case["question"]) > 55 else ""
            )
            print(f"  [{cid}] {question_preview:<58}", end=" ", flush=True)

            result = run_case(case, model, args.ollama, base_dir)
            result["id"] = cid
            result["question"] = case["question"]
            model_results.append(result)

            # TODO: Change this to store multiple prompts per case if we want to test different prompt variants; for now just store the first one we see for reference.
            if prompts.get(cid) is None:
                prompts[cid] = result["prompt"]

            status_icon = "✓" if result["status"] == "ok" else "✗"
            sql_flag = f"sql={'✓' if result.get('sql_exact_match') else '✗' if result.get('sql_exact_match') is False else '-'}"
            res_flag = f"result={'✓' if result.get('result_match') else '✗' if result.get('result_match') is False else '-'}"
            val_flag = f"value={'✓' if result.get('value_match') else '✗' if result.get('value_match') is False else '-'}"
            print(
                f"{status_icon} {sql_flag} {res_flag} {val_flag} ({result['latency_s']}s)"
            )

            if result.get("exec_error"):
                print(f"    ERROR: {result['exec_error'][:100]}")

        total = len(model_results)
        executed = sum(1 for r in model_results if r["status"] == "ok")
        sql_matches = sum(1 for r in model_results if r.get("sql_exact_match") is True)
        res_matches = sum(1 for r in model_results if r.get("result_match") is True)
        val_matches = sum(1 for r in model_results if r.get("value_match") is True)

        # Skip first result (model warm-up) when computing average latency
        warm_latencies = [r["latency_s"] for r in model_results[1:] if "latency_s" in r]
        avg_latency = (
            round(sum(warm_latencies) / len(warm_latencies), 2)
            if warm_latencies
            else None
        )

        print(
            f"\n  {executed}/{total} executed  |  {sql_matches}/{total} SQL exact  |"
            f"  {res_matches}/{total} result exact  |  {val_matches}/{total} value match"
            f"  |  avg latency (ex. warmup): {avg_latency}s"
        )

        model_slug = model.replace(":", "-").replace("/", "-")
        out_path = results_dir / f"{benchmark}__{model_slug}.json"
        model_data = {
            "summary": {
                "total": total,
                "executed": executed,
                "sql_exact_match": sql_matches,
                "result_match": res_matches,
                "value_match": val_matches,
                "sql_exact_match_pct": (
                    round(100 * sql_matches / total, 1) if total else 0
                ),
                "result_match_pct": round(100 * res_matches / total, 1) if total else 0,
                "value_match_pct": round(100 * val_matches / total, 1) if total else 0,
                "avg_latency_s_ex_warmup": avg_latency,
            },
            "cases": model_results,
        }
        with open(out_path, "w") as f:
            json.dump(model_data, f, indent=2, default=str)
        print(f"  Results saved to {out_path}")

    prompts_path = results_dir / f"{benchmark}__prompts.json"
    with open(prompts_path, "w") as f:
        json.dump(prompts, f, indent=2, ensure_ascii=False)
    print(f"Prompts saved to {prompts_path}")


if __name__ == "__main__":
    main()
