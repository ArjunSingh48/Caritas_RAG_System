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


def test_average_project_size_compare_question_uses_structured_sql():
    plan = maybe_plan_structured_query(
        TABLES,
        "Compare average project size (total costs) across the 7 regions.",
    )
    assert plan is not None
    assert "WITH per_project AS" in plan.sql
    assert "GROUP BY p.project_id, p.region" in plan.sql
    assert "AVG(project_total_costs)" in plan.sql
    assert "COUNT(*) AS project_count" in plan.sql


def test_table_roles_can_be_inferred_from_schema_when_sheet_names_vary():
    tables = [
        {
            "table_name": "ds_projects_uuid",
            "sheet_name": "Projects Export",
            "schema": {
                "project_id": {},
                "project_name": {},
                "region": {},
            },
        },
        {
            "table_name": "ds_budget_uuid",
            "sheet_name": "Budget Actuals Export",
            "schema": {
                "project_id": {},
                "budget_line": {},
                "amount_chf": {},
            },
        },
    ]

    plan = maybe_plan_structured_query(
        tables,
        "Compare average project size (total costs) across the 7 regions.",
    )
    assert plan is not None
    assert "ds_projects_uuid" in plan.sql
    assert "ds_budget_uuid" in plan.sql