"""
Random-dataset regression.

Proves the system isn't hard-coded to the IC Funding Gap mock:

- The deterministic planner must return None for an unrelated schema.
- The guard must route relevant questions as `answerable`.
- The guard must reject obvious chit-chat and topics unrelated to the data.

We build a tiny synthetic e-commerce dataset (orders + customers) in memory
with DuckDB, then exercise the public planner/guard API.
"""

from __future__ import annotations

import duckdb
import pandas as pd
import pytest

from app.services.query_guard import classify_question
from app.services.query_planner import maybe_plan_structured_query


ORDERS = pd.DataFrame(
    [
        {"order_id": 1, "customer_id": "C1", "product": "Notebook", "amount_eur": 12.50, "country": "DE"},
        {"order_id": 2, "customer_id": "C2", "product": "Pen", "amount_eur": 2.00, "country": "FR"},
        {"order_id": 3, "customer_id": "C1", "product": "Keyboard", "amount_eur": 79.00, "country": "DE"},
        {"order_id": 4, "customer_id": "C3", "product": "Mouse", "amount_eur": 19.90, "country": "CH"},
        {"order_id": 5, "customer_id": "C2", "product": "Notebook", "amount_eur": 12.50, "country": "FR"},
    ]
)
CUSTOMERS = pd.DataFrame(
    [
        {"customer_id": "C1", "name": "Alice", "tier": "gold"},
        {"customer_id": "C2", "name": "Bob", "tier": "silver"},
        {"customer_id": "C3", "name": "Carol", "tier": "gold"},
    ]
)


def _table(name: str, df: pd.DataFrame) -> dict:
    return {
        "table_name": f"ds_{name}",
        "sheet_name": name,
        "filename": "shop.xlsx",
        "table_description": f"Synthetic {name} table for regression tests.",
        "schema": {
            col: {
                "dtype": str(df[col].dtype),
                "sample_values": df[col].head(3).tolist(),
            }
            for col in df.columns
        },
    }


@pytest.fixture(scope="module")
def tables() -> list[dict]:
    return [_table("orders", ORDERS), _table("customers", CUSTOMERS)]


@pytest.fixture(scope="module")
def con(tables) -> duckdb.DuckDBPyConnection:
    c = duckdb.connect()
    c.register("o_df", ORDERS)
    c.register("c_df", CUSTOMERS)
    c.execute("CREATE TABLE ds_orders AS SELECT * FROM o_df")
    c.execute("CREATE TABLE ds_customers AS SELECT * FROM c_df")
    return c


# ---------------------------------------------------------------------------
# Planner should refuse to handle a foreign schema
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        "What's the total revenue per country?",
        "How many orders per customer tier?",
        "Top-selling product by amount?",
    ],
)
def test_planner_returns_none_for_unknown_schema(tables, question):
    plan = maybe_plan_structured_query(tables, question)
    assert plan is None, (
        f"Planner produced a hard-coded plan for an unrelated dataset: {question!r}\n"
        f"SQL: {plan.sql if plan else ''}"
    )


# ---------------------------------------------------------------------------
# Guard must accept questions that map to the dataset's vocabulary
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        "What's the total amount_eur per country?",
        "How many orders per customer?",
        "Show me the top product by revenue",
        "Average order amount by tier",
        "Compare gold and silver customers",
    ],
)
def test_guard_accepts_relevant_questions(tables, question):
    decision = classify_question(tables, question)
    assert decision.is_answerable(), (
        f"Guard wrongly blocked relevant question {question!r}: {decision.status} — {decision.message}"
    )


# ---------------------------------------------------------------------------
# Guard must reject chit-chat and topics outside the dataset
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        "hi",
        "hello",
        "thanks",
        "who are you?",
        "what can you do?",
        "what's the weather in Zurich?",
        "tell me a joke",
        "translate this to German",
        "What's the price of bitcoin right now?",
    ],
)
def test_guard_rejects_out_of_scope(tables, question):
    decision = classify_question(tables, question)
    assert decision.status == "out_of_scope", (
        f"Guard accepted out-of-scope question {question!r}: {decision.status} — {decision.message}"
    )
    # Refusal must be helpful (mentions the data or the columns).
    assert decision.message, "Refusal message should not be empty"


# ---------------------------------------------------------------------------
# Guard must ask for clarification on vague aggregates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("question", ["average?", "show me", "compare"])
def test_guard_asks_for_clarification(tables, question):
    decision = classify_question(tables, question)
    assert decision.status == "needs_clarification", (
        f"Guard didn't request clarification for vague question {question!r}: {decision.status}"
    )


# ---------------------------------------------------------------------------
# Empty / missing inputs are handled, not crashed
# ---------------------------------------------------------------------------


def test_guard_empty_question(tables):
    assert classify_question(tables, "").status == "needs_clarification"


def test_guard_no_tables():
    assert classify_question([], "anything").status == "out_of_scope"
