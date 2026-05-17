"""
Regression tests for the deterministic SQL planner.

For every suggested natural-language question in the IC Funding Gap mock
dataset README, we:

  1. Ask the planner for its StructuredQueryPlan.
  2. Execute the generated SQL against an in-memory DuckDB loaded with the
     mock workbook.
  3. Compare key aggregates against a ground-truth pandas computation that
     mirrors the dataset README's formulas and exercises the documented
     anomalies (NULL approved amounts, P042 active-but-past-end-date,
     Sahel income coverage, sparse sub-categories, etc.).

If any of these drift, the test fails loudly with the offending row(s).
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import duckdb
import pandas as pd
import pytest

from app.services.query_planner import maybe_plan_structured_query

XLSX_PATH = (
    Path(__file__).resolve().parents[2]
    / "evals"
    / "datasets"
    / "raw"
    / "IC_Funding_Gap_MockData.xlsx"
)

TABLES = [
    {"table_name": "ds_projects", "sheet_name": "projects"},
    {"table_name": "ds_budget_actuals", "sheet_name": "budget_actuals"},
    {"table_name": "ds_grant_applications", "sheet_name": "grant_applications"},
]

COST_LINES = ("Total project costs", "Indirect Costs")
INCOME_LINES = ("Total income", "Co-financing")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def frames() -> dict[str, pd.DataFrame]:
    assert XLSX_PATH.exists(), f"Missing mock dataset: {XLSX_PATH}"
    return {
        "projects": pd.read_excel(XLSX_PATH, sheet_name="projects"),
        "budget_actuals": pd.read_excel(XLSX_PATH, sheet_name="budget_actuals"),
        "grant_applications": pd.read_excel(
            XLSX_PATH, sheet_name="grant_applications"
        ),
    }


@pytest.fixture(scope="module")
def con(frames) -> duckdb.DuckDBPyConnection:
    c = duckdb.connect()
    c.register("p_df", frames["projects"])
    c.register("b_df", frames["budget_actuals"])
    c.register("g_df", frames["grant_applications"])
    c.execute("CREATE TABLE ds_projects AS SELECT * FROM p_df")
    c.execute("CREATE TABLE ds_budget_actuals AS SELECT * FROM b_df")
    c.execute("CREATE TABLE ds_grant_applications AS SELECT * FROM g_df")
    return c


def _run(con, question: str) -> tuple[list[dict], str]:
    plan = maybe_plan_structured_query(TABLES, question)
    assert plan is not None, f"Planner returned no plan for: {question!r}"
    rows = con.execute(plan.sql).fetchdf().to_dict(orient="records")
    return rows, plan.sql


def _funding_gap_by(frames, group_cols=None, year=None) -> pd.DataFrame:
    b = frames["budget_actuals"]
    p = frames["projects"]
    df = b.merge(p, on="project_id", how="inner")
    if year is not None:
        df = df[df["fiscal_year"] == year]
    df = df[df["budget_line"].isin(COST_LINES + INCOME_LINES)]
    df["cost_amt"] = df["amount_chf"].where(df["budget_line"].isin(COST_LINES), 0).fillna(0)
    df["inc_amt"] = df["amount_chf"].where(df["budget_line"].isin(INCOME_LINES), 0).fillna(0)
    if group_cols:
        g = df.groupby(group_cols, dropna=False)[["cost_amt", "inc_amt"]].sum().reset_index()
    else:
        g = df[["cost_amt", "inc_amt"]].sum().to_frame().T
    g["funding_gap"] = g["cost_amt"] - g["inc_amt"]
    return g


# ---------------------------------------------------------------------------
# Q1. Total funding gap per region in 2024
# ---------------------------------------------------------------------------


def test_q1_funding_gap_per_region_2024(con, frames):
    rows, _ = _run(con, "What is the total funding gap per region in 2024?")
    expected = _funding_gap_by(frames, ["region"], year=2024).set_index("region")
    got = {r["region"]: r["funding_gap"] for r in rows}
    assert set(got) == set(expected.index), f"Region set mismatch: {set(got) ^ set(expected.index)}"
    for region, exp_gap in expected["funding_gap"].items():
        assert got[region] == pytest.approx(float(exp_gap), abs=1.0), (
            f"{region}: planner {got[region]} vs expected {exp_gap}"
        )


# ---------------------------------------------------------------------------
# Q2. Cumulative funding gap 2020 → 2024
# ---------------------------------------------------------------------------


def test_q2_cumulative_funding_gap(con, frames):
    rows, _ = _run(con, "How has the cumulative funding gap evolved from 2020 to 2024?")
    # Question explicitly bounds 2020..2024 — planner restricts the range.
    yearly = _funding_gap_by(frames, ["fiscal_year"])
    yearly = yearly[(yearly["fiscal_year"] >= 2020) & (yearly["fiscal_year"] <= 2024)]
    yearly = yearly.sort_values("fiscal_year").reset_index(drop=True)
    yearly["cum"] = yearly["funding_gap"].cumsum()
    assert len(rows) == len(yearly), f"row count {len(rows)} != {len(yearly)}"
    for got, exp in zip(rows, yearly.to_dict(orient="records")):
        assert int(got["fiscal_year"]) == int(exp["fiscal_year"])
        assert got["funding_gap"] == pytest.approx(float(exp["funding_gap"]), abs=1.0)
        assert got["cumulative_funding_gap"] == pytest.approx(float(exp["cum"]), abs=1.0)


# ---------------------------------------------------------------------------
# Q3. Top donor type + country among successful grants  (NULL approved
# amounts on non-successful rows must NOT inflate the total)
# ---------------------------------------------------------------------------


def test_q3_top_successful_grant_contributors(con, frames):
    rows, _ = _run(
        con, "Which donor type and country contribute the most to successful grants?"
    )
    g = frames["grant_applications"]
    succ = g[g["grant_status"] == "successful"].copy()
    # Sanity: README says amount_approved_chf is NULL for non-successful rows.
    non_succ_with_amount = g[g["grant_status"] != "successful"]["amount_approved_chf"].notna().sum()
    assert non_succ_with_amount == 0, (
        f"Anomaly broken: {non_succ_with_amount} non-successful rows have amount_approved_chf"
    )
    agg = (
        succ.groupby(["donor_type", "donor_country"])["amount_approved_chf"]
        .sum()
        .reset_index()
        .sort_values("amount_approved_chf", ascending=False)
    )
    top = agg.iloc[0]
    assert len(rows) == 1
    assert rows[0]["donor_type"] == top["donor_type"]
    assert rows[0]["donor_country"] == top["donor_country"]
    assert rows[0]["total_approved_chf"] == pytest.approx(
        float(top["amount_approved_chf"]), abs=1.0
    )


# ---------------------------------------------------------------------------
# Q4. Income sub-categories for Sahel projects in 2023
#     (regression for region-vs-project_name bug)
# ---------------------------------------------------------------------------


def test_q4_sahel_income_subcategories_2023(con, frames):
    rows, _ = _run(con, "Show the breakdown of income sub-categories for Sahel projects in 2023.")
    p, b = frames["projects"], frames["budget_actuals"]
    sahel_ids = set(p.loc[p["region"] == "Sahel", "project_id"])
    assert sahel_ids, "Sahel region missing from projects fixture"
    df = b[
        (b["project_id"].isin(sahel_ids))
        & (b["budget_line"] == "Total income")
        & (b["fiscal_year"] == 2023)
    ]
    exp = (
        df.groupby("sub_category")["amount_chf"].sum().sort_values(ascending=False)
    )
    got = {r["sub_category"]: r["total_income"] for r in rows}
    assert set(got) == set(exp.index)
    for sub, val in exp.items():
        assert got[sub] == pytest.approx(float(val), abs=1.0), (
            f"Sahel/{sub}: planner {got[sub]} vs expected {val}"
        )


# ---------------------------------------------------------------------------
# Q5. Fastest-growing cost sub-category (share of Total project costs)
# ---------------------------------------------------------------------------


def test_q5_fastest_growing_cost_subcategory(con, frames):
    rows, _ = _run(con, "Which cost sub-category is growing fastest as a share of total project costs?")
    b = frames["budget_actuals"]
    df = b[b["budget_line"] == "Total project costs"].copy()
    df["amount_chf"] = df["amount_chf"].fillna(0)
    yearly = df.groupby(["fiscal_year", "sub_category"])["amount_chf"].sum().reset_index()
    year_total = yearly.groupby("fiscal_year")["amount_chf"].transform("sum")
    yearly["share"] = yearly["amount_chf"] / year_total * 100
    fl = yearly.groupby("sub_category").agg(
        first_year=("fiscal_year", "min"), last_year=("fiscal_year", "max")
    )
    deltas = []
    for sub, fl_row in fl.iterrows():
        first = yearly[(yearly["sub_category"] == sub) & (yearly["fiscal_year"] == fl_row["first_year"])]["share"].iloc[0]
        last = yearly[(yearly["sub_category"] == sub) & (yearly["fiscal_year"] == fl_row["last_year"])]["share"].iloc[0]
        deltas.append((sub, last - first))
    expected_top = max(deltas, key=lambda x: x[1])
    assert rows, "planner returned no rows"
    assert rows[0]["sub_category"] == expected_top[0], (
        f"Top sub-category {rows[0]['sub_category']} != expected {expected_top[0]}"
    )
    assert float(rows[0]["share_change_pct_points"]) == pytest.approx(expected_top[1], abs=0.05)


# ---------------------------------------------------------------------------
# Q6. Grant success rate by region × donor type
# ---------------------------------------------------------------------------


def test_q6_grant_success_rate_by_region_and_donor_type(con, frames):
    rows, _ = _run(con, "What is the grant success rate by region and by donor type?")
    g = frames["grant_applications"].merge(frames["projects"], on="project_id")
    agg = g.groupby(["region", "donor_type"]).agg(
        total=("grant_id", "count"),
        succ=("grant_status", lambda s: (s == "successful").sum()),
    ).reset_index()
    agg["rate"] = (agg["succ"] / agg["total"] * 100).round(1)
    exp = {(r["region"], r["donor_type"]): r for _, r in agg.iterrows()}
    got = {(r["region"], r["donor_type"]): r for r in rows}
    assert set(got) == set(exp), f"Group set mismatch: {set(got) ^ set(exp)}"
    for key, exp_row in exp.items():
        g_row = got[key]
        assert g_row["total_applications"] == int(exp_row["total"])
        assert g_row["successful_applications"] == int(exp_row["succ"])
        assert float(g_row["success_rate_pct"]) == pytest.approx(float(exp_row["rate"]), abs=0.11)


# ---------------------------------------------------------------------------
# Q7. Active projects with a past end date (data quality - must catch P042)
# ---------------------------------------------------------------------------


def test_q7_active_projects_past_end_date(con, frames):
    rows, _ = _run(con, "Are there active projects with a past end date?")
    p = frames["projects"]
    today = date.today()
    end = pd.to_datetime(p["end_date"], errors="coerce").dt.date
    mask = ((p["is_active"] == True) | (p["project_status"] == "Active")) & end.notna() & (end < today)
    expected_ids = set(p.loc[mask, "project_id"])
    got_ids = {r["project_id"] for r in rows}
    assert got_ids == expected_ids, f"Expected {expected_ids}, got {got_ids}"
    # README documents at least one such anomaly (originally P042). Don't pin
    # to a specific project_id — only that the data-quality check fires.
    assert got_ids, "Data-quality check should surface at least one active-but-past-end project"


# ---------------------------------------------------------------------------
# Q8. Staff Costs vs Partner Costs across regions
# ---------------------------------------------------------------------------


def test_q8_staff_vs_partner_costs_by_region(con, frames):
    rows, _ = _run(con, "How does Staff Costs compare to Partner Costs across regions?")
    b = frames["budget_actuals"].merge(frames["projects"], on="project_id")
    sub = b[(b["budget_line"] == "Total project costs") & b["sub_category"].isin(["Staff Costs", "Partner Costs"])]
    pivot = sub.pivot_table(
        index="region", columns="sub_category", values="amount_chf", aggfunc="sum", fill_value=0
    )
    got = {r["region"]: r for r in rows}
    assert set(got) == set(pivot.index)
    for region, row in pivot.iterrows():
        assert got[region]["staff_costs"] == pytest.approx(float(row.get("Staff Costs", 0)), abs=1.0)
        assert got[region]["partner_costs"] == pytest.approx(float(row.get("Partner Costs", 0)), abs=1.0)


# ---------------------------------------------------------------------------
# Q9. Projects with both Contingency lines and unsuccessful grants
# ---------------------------------------------------------------------------


def test_q9_contingency_and_unsuccessful_projects(con, frames):
    rows, _ = _run(
        con, "Which projects have both Contingency budget lines and unsuccessful grant applications?"
    )
    b, g = frames["budget_actuals"], frames["grant_applications"]
    contingency = set(b.loc[b["sub_category"].fillna("").str.contains("contingency", case=False), "project_id"])
    unsuccessful = set(g.loc[g["grant_status"] == "unsuccessful", "project_id"])
    expected = contingency & unsuccessful
    got = {r["project_id"] for r in rows}
    assert got == expected, f"Mismatch: missing {expected - got}, extra {got - expected}"


# ---------------------------------------------------------------------------
# Q10. Co-financing vs direct donor income share
# ---------------------------------------------------------------------------


def test_q10_cofinancing_vs_direct_income_share(con, frames):
    rows, _ = _run(con, "What share of total income comes from co-financing vs direct donor contributions?")
    b = frames["budget_actuals"]
    co = b.loc[b["budget_line"] == "Co-financing", "amount_chf"].fillna(0).sum()
    total = b.loc[b["budget_line"].isin(["Total income", "Co-financing"]), "amount_chf"].fillna(0).sum()
    direct = total - co
    assert len(rows) == 1
    r = rows[0]
    assert r["co_financing"] == pytest.approx(float(co), abs=1.0)
    assert r["direct_donor_income"] == pytest.approx(float(direct), abs=1.0)
    assert float(r["co_financing_share_pct"]) == pytest.approx(co / total * 100, abs=0.05)
    assert float(r["direct_donor_share_pct"]) == pytest.approx(direct / total * 100, abs=0.05)


# ---------------------------------------------------------------------------
# Q11. Average project size (Total project costs) per region
#      Must aggregate per project first, NOT line-item average.
# ---------------------------------------------------------------------------


def test_q11_average_project_size_by_region(con, frames):
    rows, _ = _run(con, "Compare average project size (total costs) across the 7 regions.")
    b, p = frames["budget_actuals"], frames["projects"]
    # Planner inner-joins projects↔budget, so Status 1-3 projects (no
    # budget rows — README anomaly) are excluded from project_count.
    per_project = (
        b[b["budget_line"] == "Total project costs"]
        .groupby("project_id")["amount_chf"]
        .sum()
        .rename("project_total_costs")
        .reset_index()
    )
    joined = p.merge(per_project, on="project_id", how="inner")
    exp = joined.groupby("region").agg(
        project_count=("project_id", "nunique"),
        avg=("project_total_costs", "mean"),
        total=("project_total_costs", "sum"),
    ).reset_index()
    exp_map = {r["region"]: r for _, r in exp.iterrows()}
    # Question says "7 regions" but the dataset actually has 8 — planner must
    # report the truth from the data, not the user's stated count.
    assert len(rows) == len(exp_map) == 8, "Dataset README documents 8 regions"
    for r in rows:
        e = exp_map[r["region"]]
        assert int(r["project_count"]) == int(e["project_count"]), (
            f"{r['region']}: planner {r['project_count']} vs expected {e['project_count']}"
        )
        assert float(r["avg_project_size_chf"]) == pytest.approx(float(round(e["avg"])), abs=1.0)
        assert float(r["total_costs_chf"]) == pytest.approx(float(e["total"]), abs=1.0)


# ---------------------------------------------------------------------------
# Q12. Lead partner type with the highest funding gap ratio
# ---------------------------------------------------------------------------


def test_q12_lead_partner_highest_funding_gap_ratio(con, frames):
    rows, _ = _run(con, "Which lead partner type is associated with the highest funding gap ratio?")
    by_partner = _funding_gap_by(frames, ["lead_partner"])
    by_partner["ratio"] = by_partner["funding_gap"] / by_partner["cost_amt"] * 100
    top = by_partner.sort_values("ratio", ascending=False).iloc[0]
    assert len(rows) == 1
    assert rows[0]["lead_partner"] == top["lead_partner"], (
        f"Top partner {rows[0]['lead_partner']} != expected {top['lead_partner']}"
    )
    assert float(rows[0]["funding_gap_ratio_pct"]) == pytest.approx(float(top["ratio"]), abs=0.05)
