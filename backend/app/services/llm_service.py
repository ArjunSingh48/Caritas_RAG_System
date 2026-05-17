import difflib
import json
import re
import httpx
import sqlglot
import sqlglot.expressions as exp
from app.core.config import settings

MAX_SQL_RETRIES = 2
FUZZY_THRESHOLD = 0.7
TEMPERATURE = 0


def _validate_sql(sql: str, alias_map: dict, tables: list[dict]) -> list[str]:
    """ Parse the generated SQL and check every table alias and column against the known schema. Returns a list of error strings. """
    real_to_alias = {v: k for k, v in alias_map.items()}
    alias_to_cols: dict[str, set] = {
        real_to_alias[t["table_name"]]: set(t["schema"].keys()) for t in tables
    }
    try:
        parsed = sqlglot.parse_one(sql, dialect="postgres")
    except Exception as e:
        return [f"SQL parse error: {e}"]

    errors: list[str] = []

    for tbl in parsed.find_all(exp.Table):
        if tbl.name and tbl.name not in alias_to_cols:
            errors.append(
                f"Table '{tbl.name}' does not exist. Available tables: {list(alias_to_cols)}"
            )

    for col in parsed.find_all(exp.Column):
        col_name = col.name
        tbl_ref = col.table
        if tbl_ref:
            if tbl_ref in alias_to_cols and col_name not in alias_to_cols[tbl_ref]:
                errors.append(
                    f"Column '{col_name}' does not exist in table '{tbl_ref}'. "
                    f"Available: {sorted(alias_to_cols[tbl_ref])}"
                )
        else:
            all_cols = set().union(*alias_to_cols.values())
            if col_name not in all_cols:
                errors.append(
                    f"Column '{col_name}' does not exist in any table."
                )
    return errors


def _fuzzy_fix_sql(sql: str, alias_map: dict, tables: list[dict]) -> tuple[str, list[str]]:
    """ Last-resort repair: find hallucinated table/column names and replace them with the closest real name using fuzzy matching. """
    real_to_alias = {v: k for k, v in alias_map.items()}
    alias_to_cols: dict[str, set] = {
        real_to_alias[t["table_name"]]: set(t["schema"].keys()) for t in tables
    }
    all_aliases = list(alias_to_cols.keys())
    all_cols = list(set().union(*alias_to_cols.values()))

    try:
        parsed = sqlglot.parse_one(sql, dialect="postgres")
    except Exception:
        return sql, []

    replacements: dict[str, str] = {}

    for tbl in parsed.find_all(exp.Table):
        name = tbl.name
        if name and name not in alias_to_cols:
            matches = difflib.get_close_matches(name, all_aliases, n=1, cutoff=FUZZY_THRESHOLD)
            if matches:
                replacements[name] = matches[0]

    for col in parsed.find_all(exp.Column):
        col_name = col.name
        tbl_ref = col.table
        if tbl_ref and tbl_ref in alias_to_cols:
            if col_name not in alias_to_cols[tbl_ref]:
                matches = difflib.get_close_matches(
                    col_name, list(alias_to_cols[tbl_ref]), n=1, cutoff=FUZZY_THRESHOLD
                )
                if matches:
                    replacements[col_name] = matches[0]
        elif not tbl_ref and col_name not in all_cols:
            matches = difflib.get_close_matches(col_name, all_cols, n=1, cutoff=FUZZY_THRESHOLD)
            if matches:
                replacements[col_name] = matches[0]

    if not replacements:
        return sql, []

    fixes = [f"'{wrong}' → '{correct}'" for wrong, correct in replacements.items()]
    fixed = sql
    for wrong, correct in replacements.items():
        fixed = re.sub(rf"\b{re.escape(wrong)}\b", correct, fixed)
    return fixed, fixes


def _ollama_generate(model: str, prompt: str) -> str:
    # print(f"\n{'='*60}\nPROMPT ({model}):\n{prompt}\n{'='*60}\n")
    resp = httpx.post(
        f"{settings.OLLAMA_BASE_URL}/api/generate",
        # think: False disables qwen3's reasoning/thinking mode which can stall for minutes
        json={"model": model, "prompt": prompt, "stream": False, "think": False, "temperature": TEMPERATURE},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["response"].strip()


def _clean_sql_output(raw: str) -> str:
    cleaned = re.sub(r"```(?:sql)?|```", "", raw, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^SQL\s*:\s*", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = cleaned.split(";", 1)[0].strip()
    return cleaned + ";"


def _build_alias_map(tables: list[dict]) -> dict[str, str]:
    """Build a mapping of readable_alias -> real_table_name."""
    alias_map: dict[str, str] = {}
    for t in tables:
        file_stem = re.sub(r"\.[^.]+$", "", t["filename"])
        sheet = t.get("sheet_name")
        raw = f"{file_stem}_{sheet}" if sheet else file_stem
        alias = re.sub(r"[^a-zA-Z0-9]+", "_", raw).strip("_").lower()
        alias_map[alias] = t["table_name"]
    return alias_map


def _col_def(col: str, info: dict) -> str:
    dtype = info['dtype']
    if info.get("primary_key"):
        dtype += ", primary key"
    parts = [f"{col} ({dtype})"]
    if info.get("description"):
        parts.append(info["description"])
    if info.get("sample_values"):
        samples = ", ".join(str(v) for v in info["sample_values"][:3])
        parts.append(f"e.g. {samples}")
    return " - ".join(parts)


def _detect_funding_gap_schema(tables: list[dict]) -> bool:
    """True only when at least one table looks like the IC budget_actuals
    fact table. Used to decide whether to inject the funding-gap formula
    into the prompt — for arbitrary datasets we don't want to bias the LLM
    with a domain-specific calculation that isn't applicable."""
    for t in tables:
        cols = {c.lower() for c in (t.get("schema") or {}).keys()}
        if {"budget_line", "amount_chf"}.issubset(cols):
            return True
    return False


def generate_sql(tables: list[dict], question: str) -> tuple[str, str]:
    """
    Generate a SQL SELECT query using readable aliases, then substitute back to
    real table names before returning.

    Returns (executable_sql, aliased_sql_for_display).
    tables: list of {"table_name": str, "filename": str, "schema": dict}
    """
    alias_map = _build_alias_map(tables)
    real_to_alias = {v: k for k, v in alias_map.items()}

    table_blocks = []
    for t in tables:
        alias = real_to_alias[t["table_name"]]
        desc_line = (
            f"  Description: {t['table_description']}\n"
            if t.get("table_description")
            else ""
        )
        col_lines = "\n".join(
            f"    {_col_def(col, info)}" for col, info in t["schema"].items()
        )
        table_blocks.append(f"Table: {alias}\n{desc_line}{col_lines}")

    tables_section = "\n\n".join(table_blocks)

    # Domain-specific rule only when the schema clearly matches.
    domain_rule = ""
    if _detect_funding_gap_schema(tables):
        domain_rule = (
            "\n    - For funding gap on this dataset: Funding Gap = "
            "SUM(amount_chf WHERE budget_line IN ('Total project costs','Indirect Costs')) "
            "- SUM(amount_chf WHERE budget_line IN ('Total income','Co-financing')). "
            "Use this exact definition unless the question overrides it."
        )

    prompt = f"""You are an expert PostgreSQL analyst. Produce ONE correct SELECT statement.

    Available tables:
    {tables_section}

    User question: "{question}"

    HARD RULES (violating any of these makes the answer wrong):
    - Use ONLY the exact table and column names listed above. Each column belongs ONLY to the table it is listed under. Never invent, alias, or modify names.
    - Use JOINs (on primary-key / foreign-key columns) whenever the question references attributes (name, region, country, type, status, …) that live in a different table from the numeric column you aggregate.
    - Only include tables whose columns you actually use.
    - Return a single valid PostgreSQL SELECT statement. No prefix, no markdown, no code fences, no explanation.

    AGGREGATION RULES (critical for correctness):
    - When the question asks for an "average per <entity>" (e.g. average size per group), you MUST first aggregate to the entity level in a CTE / subquery, THEN average across that entity. NEVER apply AVG() directly to raw rows — that averages line items instead of entities and produces wrong numbers.
    - Always use COALESCE(col, 0) inside SUM/AVG over numeric columns that may be NULL.
    - When filtering by a categorical value, use the EXACT string from the schema sample values. Quote string literals with single quotes.
    - Do NOT trust counts the user mentions in the question (e.g. "the 7 regions", "the 5 themes"). Compute against the actual data; the user may be wrong.
    - Always ORDER BY the primary metric so the top result is unambiguous, and include a COUNT(*) column when grouping so the answer layer can sanity-check group counts.{domain_rule}

    SQL:"""

    error_context = ""
    aliased_sql = ""
    validation_errors: list[str] = []
    for _ in range(MAX_SQL_RETRIES + 1):
        retry_note = (
            f"\n\nYour previous attempt had these errors — fix them:\n{error_context}"
            if error_context else ""
        )
        raw = _ollama_generate(settings.SQL_MODEL, prompt + retry_note)
        aliased_sql = _clean_sql_output(raw)

        validation_errors = _validate_sql(aliased_sql, alias_map, tables)
        if not validation_errors:
            break
        error_context = "\n".join(f"- {e}" for e in validation_errors)

    # Fuzzy fix as last resort if retries exhausted with errors
    if validation_errors:
        aliased_sql, fixes = _fuzzy_fix_sql(aliased_sql, alias_map, tables)
        if fixes:
            validation_errors = _validate_sql(aliased_sql, alias_map, tables)

    if validation_errors:
        raise ValueError(
            f"Could not generate a valid SQL query after {MAX_SQL_RETRIES + 1} attempts. "
            f"Remaining issues: {'; '.join(validation_errors)}"
        )

    # Substitute readable aliases back to real UUID-based table names
    executable_sql = aliased_sql
    for alias, real_name in alias_map.items():
        executable_sql = re.sub(rf"\b{re.escape(alias)}\b", real_name, executable_sql)

    return executable_sql, aliased_sql


def generate_answer(question: str, sql: str, rows: list[dict]) -> str:
    """Call Ollama to produce a natural language answer from the query results.
    Falls back to a plain data dump if ANSWER_MODEL is not configured."""
    total_rows = len(rows)
    sample = json.dumps(rows[:10], default=str)

    if not settings.ANSWER_MODEL:
        return f"Query returned {total_rows} row(s). Results: {sample}"

    prompt = f"""You are a senior data analyst writing for a non-technical NGO programme manager.
    A user asked: "{question}"

    SQL executed:
    {sql}

    Result: {total_rows} total row(s). First {min(total_rows, 10)} shown below as JSON:
    {sample}

    HARD RULES — violating any of these makes the answer wrong:
    - Use ONLY numbers and labels that appear verbatim in the JSON above. Do NOT invent, round aggressively, or extrapolate values.
    - If the user's question states a count or category that contradicts the data (e.g. "the 7 regions" but the result has 8 rows), use the data's actual count and gently note the discrepancy.
    - Before naming a "highest" / "lowest" / "top" item, scan ALL provided rows and pick the actual extremum by the relevant numeric column. Do NOT just pick the first row. Double-check your superlative claim is internally consistent with the numbers you cite.
    - Cite values exactly as they appear (same units, same magnitude). If a column is in CHF, say "CHF".
    - If the result is empty, say so plainly. Do not invent rows.

    Write a 2 to 4 sentence answer that:
    - Restates the question in plain English, using the actual count from the data.
    - States 2–3 concrete numbers from the result, with the correct ranking.
    - Adds one sentence of interpretation grounded in the cited numbers.

    Do NOT dump JSON. Do NOT say "the table shows".
    Respond in this exact format:
    ANSWER: <your answer>"""

    raw = _ollama_generate(settings.ANSWER_MODEL, prompt)
    if "ANSWER:" in raw:
        return raw.split("ANSWER:", 1)[1].strip()
    return raw


def generate_description(schema_dict: dict) -> dict:
    """Generate a one-sentence description for each column; updates schema_dict in place and returns it."""
    col_lines = "\n".join(
        f"- {col} ({info['dtype']}, e.g. {info['sample_values'][:3]})"
        for col, info in schema_dict.items()
    )

    prompt = f"""You are an expert database administrator. Given the table columns below, write a short one-sentence description for each column.
    Rules:
    - Use ONLY the exact column names listed. Do not invent or modify them.
    - Return ONLY a flat JSON object mapping each column name to its description string.
    - No markdown, no code fences, no explanation.

    Columns:
    {col_lines}

    JSON:"""

    raw = _ollama_generate(settings.ANSWER_MODEL, prompt)
    clean = re.sub(r"```(?:json)?|```", "", raw).strip()

    try:
        descriptions: dict[str, str] = json.loads(clean)
    except json.JSONDecodeError:
        return schema_dict

    for col, desc in descriptions.items():
        if col in schema_dict:
            schema_dict[col]["description"] = str(desc)

    return schema_dict


def generate_table_description(
    filename: str, sheet_name: str, schema_dict: dict
) -> str:
    """Generate a one-sentence description for the entire table."""
    col_lines = "\n".join(
        (
            f"- {col} ({info['dtype']}, e.g. {', '.join(str(v) for v in info['sample_values'][:3])})"
            f": {info.get('description', '')}".rstrip(": ")
        )
        for col, info in schema_dict.items()
    )

    prompt = f"""You are an expert database administrator. Given the file and table information below, write a single concise sentence describing what this table represents and what kind of data it contains.
    Rules:
    - Return ONLY the description sentence. No extra text, no bullet points.

    File: {filename}
    Sheet: {sheet_name}
    Columns:
    {col_lines}

    Description:"""

    return _ollama_generate(settings.ANSWER_MODEL, prompt)
