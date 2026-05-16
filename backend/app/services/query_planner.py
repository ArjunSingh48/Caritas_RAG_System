from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Callable


NON_ANALYTIC_SHEETS = {"readme", "metadata"}


@dataclass
class StructuredQueryPlan:
    sql: str
    display_sql: str
    answer_builder: Callable[[list[dict]], str] | None = None


def is_analytic_sheet(sheet_name: str | None) -> bool:
    if not sheet_name:
        return True
    return sheet_name.strip().lower() not in NON_ANALYTIC_SHEETS


def maybe_plan_structured_query(
    tables: list[dict], question: str
) -> StructuredQueryPlan | None:
    roles = _table_roles(tables)
    projects = roles.get("projects")
    budget = roles.get("budget_actuals")
    grants = roles.get("grant_applications")
    q = _normalize(question)
    years = [int(y) for y in re.findall(r"\b(20\d{2})\b", q)]

    if projects and budget and grants and "contingency" in q and "unsuccessful" in q:
        return _projects_with_contingency_and_unsuccessful_grants(projects, budget, grants)

    if projects and budget and ("cost sub" in q or "sub-category" in q or "sub category" in q) and ("growing fastest" in q or "fastest" in q) and "share" in q:
        return _fastest_growing_cost_subcategory(projects, budget)

    if projects and ("active project" in q or ("active" in q and "past end date" in q)):
        return _active_projects_past_end_date(projects)

    if projects and budget and ("co-financing" in q or "co financing" in q) and ("direct donor" in q or "direct" in q) and ("share" in q or "vs" in q):
        return _cofinancing_vs_direct_income_share(projects, budget)

    if projects and budget and ("average project size" in q or ("average" in q and "project" in q and "region" in q)):
        return _average_project_size_by_region(projects, budget)

    if projects and grants and "donor type" in q and "country" in q and "successful grant" in q:
        return _top_successful_grant_contributors(projects, grants)

    if projects and grants and "grant success rate" in q and "region" in q and "donor type" in q:
        return _grant_success_rate_by_region_and_donor_type(projects, grants)

    if projects and budget and "income sub" in q and "sahel" in q and years:
        return _income_subcategories_for_sahel(projects, budget, years[0])

    if projects and budget and "staff costs" in q and "partner costs" in q and "across regions" in q:
        return _staff_vs_partner_costs_by_region(projects, budget)

    if projects and budget and "lead partner" in q and "funding gap ratio" in q:
        return _lead_partner_highest_gap_ratio(projects, budget)

    if projects and budget and "service contract" in q and "institutional grant" in q and "funding gap" in q:
        return _funding_gap_by_funding_type(projects, budget)

    if projects and budget and "climate" in q and "funding gap" in q:
        return _climate_project_gaps(projects, budget)

    if projects and budget and (("top 10" in q and "project" in q) or "largest funding gap" in q and "project" in q):
        return _top_projects_by_gap(projects, budget)

    if projects and budget and ("funding gap changed" in q or "cumulative funding gap" in q or "show trends" in q):
        start_year = years[0] if years else 2020
        end_year = years[1] if len(years) > 1 else 2024
        return _funding_gap_by_year(projects, budget, start_year, end_year, cumulative="cumulative" in q)

    if projects and budget and ("which year" in q and "funding gap" in q and "largest" in q):
        return _largest_funding_gap_year(projects, budget)

    if projects and budget and "largest funding gap" in q and "region" in q:
        year = years[0] if years else None
        return _largest_funding_gap_region(projects, budget, year)

    if projects and budget and "funding gap per region" in q:
        year = years[0] if years else None
        return _funding_gap_per_region(projects, budget, year)

    return None


def _table_roles(tables: list[dict]) -> dict[str, dict]:
    roles: dict[str, dict] = {}
    for table in tables:
        sheet = (table.get("sheet_name") or "").strip().lower()
        if sheet in {"projects", "budget_actuals", "grant_applications", "metadata", "readme"}:
            roles[sheet] = table
    return roles


def _normalize(question: str) -> str:
    normalized = question.strip().lower()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"^(analyse|analyze)( this)?( and)?\s+", "", normalized)
    return normalized


def _fmt_amount(value: object) -> str:
    if value is None:
        return "0 CHF"
    try:
        return f"{float(value):,.0f} CHF"
    except Exception:
        return str(value)


def _fmt_pct(value: object) -> str:
    try:
        return f"{float(value):.1f}%"
    except Exception:
        return str(value)


def _funding_gap_expr(b: str) -> str:
    return (
        f"SUM(CASE WHEN {b}.budget_line = 'Total project costs' THEN COALESCE({b}.amount_chf, 0) ELSE 0 END)"
        f" - SUM(CASE WHEN {b}.budget_line = 'Total income' THEN COALESCE({b}.amount_chf, 0) ELSE 0 END)"
    )


def _funding_gap_per_region(projects: dict, budget: dict, year: int | None) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    filters = [f"{b}.budget_line IN ('Total project costs', 'Total income')"]
    if year is not None:
        filters.append(f"{b}.fiscal_year = {year}")
    where_sql = " AND ".join(filters)
    sql = f"""
SELECT p.region,
       SUM(CASE WHEN b.budget_line = 'Total project costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS total_project_costs,
       SUM(CASE WHEN b.budget_line = 'Total income' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS total_income,
       {_funding_gap_expr('b')} AS funding_gap
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE {where_sql}
GROUP BY p.region
ORDER BY funding_gap DESC, p.region ASC
""".strip()
    label = f" in {year}" if year is not None else ""
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _top_list_answer(
            rows,
            intro=f"Funding gap per region{label}:",
            label_key="region",
            value_key="funding_gap",
        ),
    )


def _largest_funding_gap_region(projects: dict, budget: dict, year: int | None) -> StructuredQueryPlan:
    base = _funding_gap_per_region(projects, budget, year)
    sql = f"SELECT * FROM ({base.sql}) q LIMIT 1"
    label = f" in {year}" if year is not None else ""
    return StructuredQueryPlan(
        sql=sql,
        display_sql=f"SELECT * FROM ({base.display_sql}) q LIMIT 1",
        answer_builder=lambda rows: _single_rank_answer(rows, f"Largest funding gap region{label}", "region", "funding_gap"),
    )


def _funding_gap_by_year(
    projects: dict, budget: dict, start_year: int, end_year: int, cumulative: bool
) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    gap_expr = _funding_gap_expr("b")
    yearly_sql = f"""
SELECT b.fiscal_year,
       {gap_expr} AS funding_gap
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE b.budget_line IN ('Total project costs', 'Total income')
  AND b.fiscal_year BETWEEN {start_year} AND {end_year}
GROUP BY b.fiscal_year
ORDER BY b.fiscal_year ASC
""".strip()
    if cumulative:
        sql = f"""
WITH yearly AS (
  {yearly_sql}
)
SELECT fiscal_year,
       funding_gap,
       SUM(funding_gap) OVER (ORDER BY fiscal_year) AS cumulative_funding_gap
FROM yearly
ORDER BY fiscal_year ASC
""".strip()
        display = sql.replace(p, "projects").replace(b, "budget_actuals")
        return StructuredQueryPlan(
            sql=sql,
            display_sql=display,
            answer_builder=lambda rows: _trend_answer(rows, "fiscal_year", "cumulative_funding_gap", "Cumulative funding gap"),
        )
    return StructuredQueryPlan(
        sql=yearly_sql,
        display_sql=yearly_sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _trend_answer(rows, "fiscal_year", "funding_gap", "Funding gap"),
    )


def _largest_funding_gap_year(projects: dict, budget: dict) -> StructuredQueryPlan:
    base = _funding_gap_by_year(projects, budget, 2020, 2024, cumulative=False)
    sql = f"SELECT * FROM ({base.sql}) q ORDER BY funding_gap DESC LIMIT 1"
    return StructuredQueryPlan(
        sql=sql,
        display_sql=f"SELECT * FROM ({base.display_sql}) q ORDER BY funding_gap DESC LIMIT 1",
        answer_builder=lambda rows: _single_rank_answer(rows, "Year with the largest funding gap", "fiscal_year", "funding_gap"),
    )


def _top_projects_by_gap(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
SELECT p.project_id,
       p.project_name,
       p.region,
       {_funding_gap_expr('b')} AS funding_gap
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE b.budget_line IN ('Total project costs', 'Total income')
GROUP BY p.project_id, p.project_name, p.region
ORDER BY funding_gap DESC, p.project_id ASC
LIMIT 10
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _top_list_answer(rows, "Top projects by funding gap:", "project_name", "funding_gap"),
    )


def _climate_project_gaps(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
SELECT p.project_id,
       p.project_name,
       p.country,
       {_funding_gap_expr('b')} AS funding_gap
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE p.theme = 'Climate'
  AND b.budget_line IN ('Total project costs', 'Total income')
GROUP BY p.project_id, p.project_name, p.country
ORDER BY funding_gap DESC, p.project_id ASC
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _top_list_answer(rows, "Climate projects by funding gap:", "project_name", "funding_gap"),
    )


def _funding_gap_by_funding_type(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
SELECT p.funding_type,
       {_funding_gap_expr('b')} AS funding_gap
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE p.funding_type IN ('Service Contract', 'Institutional Grant')
  AND b.budget_line IN ('Total project costs', 'Total income')
GROUP BY p.funding_type
ORDER BY funding_gap ASC, p.funding_type ASC
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _comparison_answer(rows, "funding_type", "funding_gap", "Funding gap by funding type"),
    )


def _lead_partner_highest_gap_ratio(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
SELECT p.lead_partner,
       SUM(CASE WHEN b.budget_line = 'Total project costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS total_project_costs,
       SUM(CASE WHEN b.budget_line = 'Total income' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS total_income,
       {_funding_gap_expr('b')} AS funding_gap,
       CASE
         WHEN SUM(CASE WHEN b.budget_line = 'Total project costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) = 0 THEN NULL
         ELSE {_funding_gap_expr('b')} * 100.0
           / SUM(CASE WHEN b.budget_line = 'Total project costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END)
       END AS funding_gap_ratio_pct
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE b.budget_line IN ('Total project costs', 'Total income')
GROUP BY p.lead_partner
ORDER BY funding_gap_ratio_pct DESC NULLS LAST, p.lead_partner ASC
LIMIT 1
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _single_rank_answer(rows, "Lead partner with the highest funding gap ratio", "lead_partner", "funding_gap_ratio_pct", is_percent=True),
    )


def _staff_vs_partner_costs_by_region(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
SELECT p.region,
       SUM(CASE WHEN b.sub_category = 'Staff Costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS staff_costs,
       SUM(CASE WHEN b.sub_category = 'Partner Costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS partner_costs
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE b.budget_line = 'Total project costs'
  AND b.sub_category IN ('Staff Costs', 'Partner Costs')
GROUP BY p.region
ORDER BY p.region ASC
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _dual_metric_answer(rows, "region", ("staff_costs", "Staff"), ("partner_costs", "Partner")),
    )


def _income_subcategories_for_sahel(projects: dict, budget: dict, year: int) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
SELECT b.sub_category,
       SUM(COALESCE(b.amount_chf, 0)) AS total_income
FROM {p} p
JOIN {b} b ON b.project_id = p.project_id
WHERE p.project_name ILIKE '%Sahel%'
  AND b.budget_line = 'Total income'
  AND b.fiscal_year = {year}
GROUP BY b.sub_category
ORDER BY total_income DESC, b.sub_category ASC
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(b, "budget_actuals"),
        answer_builder=lambda rows: _top_list_answer(rows, f"Income sub-categories for Sahel projects in {year}:", "sub_category", "total_income"),
    )


def _top_successful_grant_contributors(projects: dict, grants: dict) -> StructuredQueryPlan:
    p, g = projects["table_name"], grants["table_name"]
    sql = f"""
SELECT g.donor_type,
       g.donor_country,
       SUM(COALESCE(g.amount_approved_chf, 0)) AS total_approved_chf,
       COUNT(*) AS successful_grants
FROM {g} g
JOIN {p} p ON p.project_id = g.project_id
WHERE g.grant_status = 'successful'
GROUP BY g.donor_type, g.donor_country
ORDER BY total_approved_chf DESC, successful_grants DESC, g.donor_type ASC, g.donor_country ASC
LIMIT 1
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(g, "grant_applications"),
        answer_builder=lambda rows: _successful_grants_answer(rows),
    )


def _grant_success_rate_by_region_and_donor_type(projects: dict, grants: dict) -> StructuredQueryPlan:
    p, g = projects["table_name"], grants["table_name"]
    sql = f"""
SELECT p.region,
       g.donor_type,
       COUNT(*) AS total_applications,
       SUM(CASE WHEN g.grant_status = 'successful' THEN 1 ELSE 0 END) AS successful_applications,
       ROUND(
         SUM(CASE WHEN g.grant_status = 'successful' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0),
         1
       ) AS success_rate_pct
FROM {g} g
JOIN {p} p ON p.project_id = g.project_id
GROUP BY p.region, g.donor_type
ORDER BY success_rate_pct DESC NULLS LAST, total_applications DESC, p.region ASC, g.donor_type ASC
""".strip()
    return StructuredQueryPlan(
        sql=sql,
        display_sql=sql.replace(p, "projects").replace(g, "grant_applications"),
        answer_builder=lambda rows: _top_list_answer(rows, "Grant success rate by region and donor type:", "region", "success_rate_pct", secondary_key="donor_type", is_percent=True),
    )


def _top_list_answer(
    rows: list[dict],
    intro: str,
    label_key: str,
    value_key: str,
    secondary_key: str | None = None,
    is_percent: bool = False,
) -> str:
    if not rows:
        return "No matching records found."
    formatter = _fmt_pct if is_percent else _fmt_amount
    parts = []
    for row in rows[:5]:
        label = str(row.get(label_key, "—"))
        if secondary_key:
            label = f"{label} / {row.get(secondary_key, '—')}"
        parts.append(f"{label}: {formatter(row.get(value_key))}")
    return f"{intro} " + "; ".join(parts)


def _single_rank_answer(
    rows: list[dict], title: str, label_key: str, value_key: str, is_percent: bool = False
) -> str:
    if not rows:
        return "No matching records found."
    row = rows[0]
    formatter = _fmt_pct if is_percent else _fmt_amount
    return f"{title}: {row.get(label_key)} ({formatter(row.get(value_key))})."


def _comparison_answer(rows: list[dict], label_key: str, value_key: str, title: str) -> str:
    if not rows:
        return "No matching records found."
    parts = [f"{row.get(label_key)}: {_fmt_amount(row.get(value_key))}" for row in rows[:5]]
    return f"{title}: " + "; ".join(parts)


def _dual_metric_answer(
    rows: list[dict], label_key: str, first_metric: tuple[str, str], second_metric: tuple[str, str]
) -> str:
    if not rows:
        return "No matching records found."
    first_key, first_label = first_metric
    second_key, second_label = second_metric
    parts = []
    for row in rows[:5]:
        parts.append(
            f"{row.get(label_key)}: {first_label} {_fmt_amount(row.get(first_key))}, {second_label} {_fmt_amount(row.get(second_key))}"
        )
    return "; ".join(parts)


def _trend_answer(rows: list[dict], label_key: str, value_key: str, title: str) -> str:
    if not rows:
        return "No matching records found."
    return f"{title}: " + "; ".join(
        f"{row.get(label_key)} = {_fmt_amount(row.get(value_key))}" for row in rows[:5]
    )


def _successful_grants_answer(rows: list[dict]) -> str:
    if not rows:
        return "No matching records found."
    row = rows[0]
    return (
        f"The top successful-grant contributor is {row.get('donor_type')} from {row.get('donor_country')}, "
        f"with {_fmt_amount(row.get('total_approved_chf'))} approved across {row.get('successful_grants')} successful grants."
    )

def _projects_with_contingency_and_unsuccessful_grants(
    projects: dict, budget: dict, grants: dict
) -> StructuredQueryPlan:
    p, b, g = projects["table_name"], budget["table_name"], grants["table_name"]
    sql = f"""
SELECT DISTINCT p.project_id, p.project_name, p.region, p.country
FROM {p} p
WHERE p.project_id IN (
  SELECT DISTINCT b.project_id FROM {b} b
  WHERE b.budget_line ILIKE '%contingency%' OR b.sub_category ILIKE '%contingency%'
)
AND p.project_id IN (
  SELECT DISTINCT g.project_id FROM {g} g
  WHERE g.grant_status = 'unsuccessful'
)
ORDER BY p.project_name ASC
""".strip()
    display = sql.replace(p, "projects").replace(b, "budget_actuals").replace(g, "grant_applications")
    def _answer(rows: list[dict]) -> str:
        if not rows:
            return "No projects have both Contingency budget lines and unsuccessful grant applications."
        names = [str(r.get("project_name", "—")) for r in rows]
        head = ", ".join(names[:10])
        more = f" (and {len(names) - 10} more)" if len(names) > 10 else ""
        return f"{len(names)} project(s) match: {head}{more}."
    return StructuredQueryPlan(sql=sql, display_sql=display, answer_builder=_answer)


def _fastest_growing_cost_subcategory(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
WITH yearly AS (
  SELECT b.fiscal_year,
         b.sub_category,
         SUM(COALESCE(b.amount_chf, 0)) AS sub_amount,
         SUM(SUM(COALESCE(b.amount_chf, 0))) OVER (PARTITION BY b.fiscal_year) AS year_total
  FROM {b} b
  WHERE b.budget_line = 'Total project costs'
  GROUP BY b.fiscal_year, b.sub_category
),
shares AS (
  SELECT fiscal_year, sub_category,
         CASE WHEN year_total = 0 THEN 0 ELSE sub_amount * 100.0 / year_total END AS share_pct
  FROM yearly
),
first_last AS (
  SELECT sub_category,
         MIN(fiscal_year) AS first_year,
         MAX(fiscal_year) AS last_year
  FROM shares
  GROUP BY sub_category
)
SELECT s_first.sub_category,
       s_first.fiscal_year AS first_year,
       ROUND(s_first.share_pct::numeric, 2) AS first_share_pct,
       s_last.fiscal_year AS last_year,
       ROUND(s_last.share_pct::numeric, 2) AS last_share_pct,
       ROUND((s_last.share_pct - s_first.share_pct)::numeric, 2) AS share_change_pct_points
FROM first_last fl
JOIN shares s_first ON s_first.sub_category = fl.sub_category AND s_first.fiscal_year = fl.first_year
JOIN shares s_last  ON s_last.sub_category  = fl.sub_category AND s_last.fiscal_year  = fl.last_year
ORDER BY share_change_pct_points DESC NULLS LAST, s_first.sub_category ASC
LIMIT 5
""".strip()
    display = sql.replace(b, "budget_actuals")
    def _answer(rows: list[dict]) -> str:
        if not rows:
            return "No cost sub-category data found."
        top = rows[0]
        return (
            f"The fastest-growing cost sub-category is '{top.get('sub_category')}', "
            f"rising from {top.get('first_share_pct')}% in {top.get('first_year')} "
            f"to {top.get('last_share_pct')}% in {top.get('last_year')} "
            f"(+{top.get('share_change_pct_points')} percentage points)."
        )
    return StructuredQueryPlan(sql=sql, display_sql=display, answer_builder=_answer)


def _active_projects_past_end_date(projects: dict) -> StructuredQueryPlan:
    p = projects["table_name"]
    sql = f"""
SELECT project_id, project_name, region, country, end_date, project_status, is_active
FROM {p}
WHERE (is_active = true OR project_status = 'Active')
  AND end_date IS NOT NULL
  AND CAST(end_date AS DATE) < CURRENT_DATE
ORDER BY CAST(end_date AS DATE) ASC, project_id ASC
""".strip()
    display = sql.replace(p, "projects")
    def _answer(rows: list[dict]) -> str:
        if not rows:
            return "Data quality check passed: no active projects have a past end date."
        names = [f"{r.get('project_name')} (ended {str(r.get('end_date'))[:10]})" for r in rows[:5]]
        more = f" and {len(rows) - 5} more" if len(rows) > 5 else ""
        return f"Data quality issue: {len(rows)} active project(s) have a past end date — {'; '.join(names)}{more}."
    return StructuredQueryPlan(sql=sql, display_sql=display, answer_builder=_answer)


def _cofinancing_vs_direct_income_share(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
WITH totals AS (
  SELECT
    SUM(CASE WHEN b.budget_line = 'Co-financing' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS co_financing,
    SUM(CASE WHEN b.budget_line = 'Total income' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS total_income
  FROM {b} b
)
SELECT co_financing,
       (total_income - co_financing) AS direct_donor_income,
       total_income,
       CASE WHEN total_income = 0 THEN 0
            ELSE ROUND(co_financing * 100.0 / total_income, 2) END AS co_financing_share_pct,
       CASE WHEN total_income = 0 THEN 0
            ELSE ROUND((total_income - co_financing) * 100.0 / total_income, 2) END AS direct_donor_share_pct
FROM totals
""".strip()
    display = sql.replace(b, "budget_actuals")
    def _answer(rows: list[dict]) -> str:
        if not rows:
            return "No income data found."
        r = rows[0]
        return (
            f"Of total income ({_fmt_amount(r.get('total_income'))}), "
            f"co-financing accounts for {r.get('co_financing_share_pct')}% "
            f"({_fmt_amount(r.get('co_financing'))}) and direct donor contributions for "
            f"{r.get('direct_donor_share_pct')}% ({_fmt_amount(r.get('direct_donor_income'))})."
        )
    return StructuredQueryPlan(sql=sql, display_sql=display, answer_builder=_answer)


def _average_project_size_by_region(projects: dict, budget: dict) -> StructuredQueryPlan:
    p, b = projects["table_name"], budget["table_name"]
    sql = f"""
WITH per_project AS (
  SELECT p.project_id, p.region,
         SUM(CASE WHEN b.budget_line = 'Total project costs' THEN COALESCE(b.amount_chf, 0) ELSE 0 END) AS project_total_costs
  FROM {p} p
  JOIN {b} b ON b.project_id = p.project_id
  GROUP BY p.project_id, p.region
)
SELECT region,
       COUNT(*) AS project_count,
       ROUND(AVG(project_total_costs)::numeric, 0) AS avg_project_size_chf,
       SUM(project_total_costs) AS total_costs_chf
FROM per_project
GROUP BY region
ORDER BY avg_project_size_chf DESC, region ASC
""".strip()
    display = sql.replace(p, "projects").replace(b, "budget_actuals")
    return StructuredQueryPlan(
        sql=sql,
        display_sql=display,
        answer_builder=lambda rows: _top_list_answer(
            rows, "Average project size by region:", "region", "avg_project_size_chf"
        ),
    )
