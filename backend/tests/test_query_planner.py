from app.services.query_planner import is_analytic_sheet, maybe_plan_structured_query


TABLES = [
    {"table_name": "ds_projects", "sheet_name": "projects"},
    {"table_name": "ds_budget_actuals", "sheet_name": "budget_actuals"},
    {"table_name": "ds_grant_applications", "sheet_name": "grant_applications"},
    {"table_name": "ds_readme", "sheet_name": "README"},
    {"table_name": "ds_metadata", "sheet_name": "metadata"},
]


def test_non_analytic_sheets_are_filtered():
    assert is_analytic_sheet("projects") is True
    assert is_analytic_sheet("budget_actuals") is True
    assert is_analytic_sheet("grant_applications") is True
    assert is_analytic_sheet("README") is False
    assert is_analytic_sheet("metadata") is False


def test_funding_gap_question_uses_structured_sql():
    plan = maybe_plan_structured_query(TABLES, "What is the total funding gap per region in 2024?")
    assert plan is not None
    assert "GROUP BY p.region" in plan.sql
    assert "b.fiscal_year = 2024" in plan.sql
    assert "'Total project costs', 'Indirect Costs'" in plan.sql
    assert "'Total income', 'Co-financing'" in plan.sql


def test_successful_grants_question_uses_structured_sql():
    plan = maybe_plan_structured_query(
        TABLES,
        "Which donor type and country contribute the most to successful grants?",
    )
    assert plan is not None
    assert "grant_status = 'successful'" in plan.sql
    assert "amount_approved_chf" in plan.sql
    assert "GROUP BY g.donor_type, g.donor_country" in plan.sql


def test_staff_vs_partner_question_uses_structured_sql():
    plan = maybe_plan_structured_query(
        TABLES,
        "How does Staff Costs compare to Partner Costs across regions?",
    )
    assert plan is not None
    assert "Staff Costs" in plan.sql
    assert "Partner Costs" in plan.sql
    assert "GROUP BY p.region" in plan.sql