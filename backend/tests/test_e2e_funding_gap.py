"""
Live end-to-end test against a running backend.

Uploads `evals/datasets/raw/IC_Funding_Gap_MockData.xlsx` to the backend
(default http://localhost:8000), then runs every "suggested" question from
the dataset README and verifies the *answer text* contains the expected
ground-truth numbers we computed directly from the workbook.

This is intentionally strict: it's not enough for the backend to return a
non-empty answer — the answer must actually quote the right values.

Run from the repo root:

    BACKEND_URL=http://localhost:8000 pytest backend/tests/test_e2e_funding_gap.py -s
or:
    BACKEND_URL=http://localhost:8000 python backend/tests/test_e2e_funding_gap.py
"""

from __future__ import annotations

import os
import re
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import pytest

httpx = pytest.importorskip("httpx", reason="httpx not installed; live E2E suite is optional")
pd = pytest.importorskip("pandas")

REPO_ROOT = Path(__file__).resolve().parents[2]
XLSX_PATH = REPO_ROOT / "evals" / "datasets" / "raw" / "IC_Funding_Gap_MockData.xlsx"
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
TIMEOUT = httpx.Timeout(180.0, connect=10.0)


# ---------------------------------------------------------------------------
# Ground-truth computations (mirror the dataset README's formulas).
# ---------------------------------------------------------------------------


COST_LINES = ("Total project costs", "Indirect Costs")
INCOME_LINES = ("Total income", "Co-financing")


def _load_frames() -> dict[str, pd.DataFrame]:
    return {
        "projects": pd.read_excel(XLSX_PATH, sheet_name="projects"),
        "budget_actuals": pd.read_excel(XLSX_PATH, sheet_name="budget_actuals"),
        "grant_applications": pd.read_excel(XLSX_PATH, sheet_name="grant_applications"),
    }


def _funding_gap_2024_by_region(f: dict[str, pd.DataFrame]) -> dict[str, float]:
    b = f["budget_actuals"].merge(f["projects"], on="project_id")
    b = b[b["fiscal_year"] == 2024]
    b = b[b["budget_line"].isin(COST_LINES + INCOME_LINES)]
    b["cost"] = b["amount_chf"].where(b["budget_line"].isin(COST_LINES), 0).fillna(0)
    b["inc"] = b["amount_chf"].where(b["budget_line"].isin(INCOME_LINES), 0).fillna(0)
    g = b.groupby("region")[["cost", "inc"]].sum()
    g["gap"] = g["cost"] - g["inc"]
    return g["gap"].to_dict()


def _cumulative_gap_2020_2024(f) -> dict[int, float]:
    b = f["budget_actuals"]
    b = b[b["budget_line"].isin(COST_LINES + INCOME_LINES)]
    b = b[(b["fiscal_year"] >= 2020) & (b["fiscal_year"] <= 2024)]
    b["cost"] = b["amount_chf"].where(b["budget_line"].isin(COST_LINES), 0).fillna(0)
    b["inc"] = b["amount_chf"].where(b["budget_line"].isin(INCOME_LINES), 0).fillna(0)
    y = b.groupby("fiscal_year")[["cost", "inc"]].sum().sort_index()
    y["gap"] = y["cost"] - y["inc"]
    y["cum"] = y["gap"].cumsum()
    return y["cum"].to_dict()


def _top_successful_donor(f) -> tuple[str, str, float]:
    g = f["grant_applications"]
    succ = g[g["grant_status"] == "successful"]
    agg = succ.groupby(["donor_type", "donor_country"])["amount_approved_chf"].sum().sort_values(ascending=False)
    (dtype, country), amt = agg.index[0], float(agg.iloc[0])
    return dtype, country, amt


def _sahel_2023_income(f) -> dict[str, float]:
    p = f["projects"]
    b = f["budget_actuals"]
    sahel_ids = set(p.loc[p["region"] == "Sahel", "project_id"])
    df = b[(b["project_id"].isin(sahel_ids)) & (b["budget_line"] == "Total income") & (b["fiscal_year"] == 2023)]
    return df.groupby("sub_category")["amount_chf"].sum().to_dict()


def _staff_vs_partner_by_region(f) -> dict[str, dict[str, float]]:
    df = f["budget_actuals"].merge(f["projects"], on="project_id")
    df = df[(df["budget_line"] == "Total project costs") & df["sub_category"].isin(["Staff Costs", "Partner Costs"])]
    out: dict[str, dict[str, float]] = {}
    for (region, sub), val in df.groupby(["region", "sub_category"])["amount_chf"].sum().items():
        out.setdefault(region, {})[sub] = float(val)
    return out


def _avg_project_size_by_region(f) -> dict[str, float]:
    b, p = f["budget_actuals"], f["projects"]
    per = b[b["budget_line"] == "Total project costs"].groupby("project_id")["amount_chf"].sum()
    j = p.merge(per.rename("ttc"), left_on="project_id", right_index=True, how="inner")
    return j.groupby("region")["ttc"].mean().round().to_dict()


def _cofin_share(f) -> tuple[float, float, float]:
    b = f["budget_actuals"]
    co = float(b.loc[b["budget_line"] == "Co-financing", "amount_chf"].fillna(0).sum())
    total = float(b.loc[b["budget_line"].isin(["Total income", "Co-financing"]), "amount_chf"].fillna(0).sum())
    return co, total - co, round(co / total * 100, 2)


def _contingency_unsuccessful(f) -> set[str]:
    b, g = f["budget_actuals"], f["grant_applications"]
    cont = set(b.loc[b["sub_category"].fillna("").str.contains("contingency", case=False), "project_id"])
    uns = set(g.loc[g["grant_status"] == "unsuccessful", "project_id"])
    return cont & uns


def _lead_partner_top(f) -> tuple[str, float]:
    df = f["budget_actuals"].merge(f["projects"], on="project_id")
    df = df[df["budget_line"].isin(COST_LINES + INCOME_LINES)]
    df["cost"] = df["amount_chf"].where(df["budget_line"].isin(COST_LINES), 0).fillna(0)
    df["inc"] = df["amount_chf"].where(df["budget_line"].isin(INCOME_LINES), 0).fillna(0)
    agg = df.groupby("lead_partner")[["cost", "inc"]].sum()
    agg["gap"] = agg["cost"] - agg["inc"]
    agg["ratio"] = agg["gap"] / agg["cost"] * 100
    top = agg["ratio"].sort_values(ascending=False).index[0]
    return top, float(agg.loc[top, "ratio"])


def _active_past_end(f) -> set[str]:
    p = f["projects"]
    today = pd.Timestamp.utcnow().normalize()
    end = pd.to_datetime(p["end_date"], errors="coerce")
    mask = ((p["is_active"] == True) | (p["project_status"] == "Active")) & end.notna() & (end < today)
    return set(p.loc[mask, "project_id"])


# ---------------------------------------------------------------------------
# Question / expectation matrix
# ---------------------------------------------------------------------------


@dataclass
class Expectation:
    must_contain: list[str]  # substrings (case-insensitive) the answer must include
    description: str = ""

    def check(self, answer: str) -> list[str]:
        missing = [s for s in self.must_contain if s.lower() not in answer.lower()]
        return missing


def _money(n: float) -> str:
    """Render a CHF amount the way the backend formats it (no decimals)."""
    return f"{int(round(n)):,}"


def _build_question_matrix() -> list[tuple[str, Expectation]]:
    f = _load_frames()

    # Q1 — pick the top region's gap as the must-cite figure
    gaps_2024 = _funding_gap_2024_by_region(f)
    top_region_2024 = max(gaps_2024, key=gaps_2024.get)

    cum = _cumulative_gap_2020_2024(f)
    dtype, dcountry, dchf = _top_successful_donor(f)
    sahel = _sahel_2023_income(f)
    sahel_top_sub = max(sahel, key=sahel.get) if sahel else ""
    staff_partner = _staff_vs_partner_by_region(f)
    avg_size = _avg_project_size_by_region(f)
    top_avg_region = max(avg_size, key=avg_size.get)
    co, direct, co_pct = _cofin_share(f)
    cont_uns = _contingency_unsuccessful(f)
    lp_top, lp_ratio = _lead_partner_top(f)
    active_past = _active_past_end(f)

    matrix: list[tuple[str, Expectation]] = [
        (
            "What is the total funding gap per region in 2024?",
            Expectation([top_region_2024, _money(gaps_2024[top_region_2024])], "Top region's 2024 gap"),
        ),
        (
            "How has the cumulative funding gap evolved from 2020 to 2024?",
            Expectation(
                ["2020", "2024", _money(cum[2020]), _money(cum[2024])],
                "First and last year cumulative values",
            ),
        ),
        (
            "Which donor type and country contribute the most to successful grants?",
            Expectation([dtype, dcountry, _money(dchf)], "Top successful donor"),
        ),
        (
            "Show the breakdown of income sub-categories for Sahel projects in 2023.",
            Expectation([sahel_top_sub, _money(sahel[sahel_top_sub])] if sahel else ["Sahel"], "Top Sahel income sub"),
        ),
        (
            "Which cost sub-category is growing fastest as a share of total project costs?",
            Expectation([], "Just non-empty — pp delta varies year to year"),
        ),
        (
            "What is the grant success rate by region and by donor type?",
            Expectation(["%"], "Should include at least one percentage"),
        ),
        (
            "Are there active projects with a past end date?",
            (
                Expectation([str(len(active_past))], "Count of flagged projects")
                if active_past
                else Expectation(["no", "passed"], "Plain 'none' answer")
            ),
        ),
        (
            "How does Staff Costs compare to Partner Costs across regions?",
            Expectation(["Staff", "Partner"], "Both metrics named in the answer"),
        ),
        (
            "Which projects have both Contingency budget lines and unsuccessful grant applications?",
            (
                Expectation([str(len(cont_uns))], "Count of matched projects")
                if cont_uns
                else Expectation(["No projects"], "Empty-set wording")
            ),
        ),
        (
            "What share of total income comes from co-financing vs direct donor contributions?",
            Expectation([f"{co_pct}", "%", _money(co)], "Co-financing share + amount"),
        ),
        (
            "Compare average project size (total costs) across the 7 regions.",
            Expectation([top_avg_region, _money(avg_size[top_avg_region])], "Top region by avg project size"),
        ),
        (
            "Which lead partner type is associated with the highest funding gap ratio?",
            Expectation([lp_top, "%"], "Top lead partner + percentage"),
        ),
    ]
    return matrix


# ---------------------------------------------------------------------------
# Wire protocol
# ---------------------------------------------------------------------------


def _backend_is_up() -> bool:
    try:
        return httpx.get(f"{BACKEND_URL}/api/health", timeout=5.0).status_code == 200
    except Exception:
        return False


def _upload(chat_id: str) -> list[str]:
    assert XLSX_PATH.exists(), f"Missing fixture: {XLSX_PATH}"
    with httpx.Client(timeout=TIMEOUT) as client, XLSX_PATH.open("rb") as f:
        files = {"file": (XLSX_PATH.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = client.post(f"{BACKEND_URL}/api/upload", files=files, data={"chat_id": chat_id})
    r.raise_for_status()
    ids = [item["dataset_id"] for item in r.json()]
    assert ids, "Upload returned no datasets"
    return ids


def _ask(chat_id: str, dataset_ids: list[str], question: str) -> str:
    body = {"question": question, "chat_id": chat_id, "dataset_ids": dataset_ids}
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(f"{BACKEND_URL}/api/query", json=body)
    r.raise_for_status()
    return (r.json().get("answer") or "").strip()


# ---------------------------------------------------------------------------
# Test entry
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _backend_is_up(), reason=f"Backend not reachable at {BACKEND_URL}")
def test_all_12_suggested_questions():
    matrix = _build_question_matrix()
    chat_id = str(uuid.uuid4())
    print(f"\n[e2e] uploading {XLSX_PATH.name} → chat {chat_id}")
    dataset_ids = _upload(chat_id)
    print(f"[e2e] uploaded {len(dataset_ids)} datasets")

    failures: list[str] = []
    for i, (question, expect) in enumerate(matrix, start=1):
        t0 = time.time()
        try:
            answer = _ask(chat_id, dataset_ids, question)
        except Exception as e:
            failures.append(f"Q{i:02d} HTTP error — {question!r}: {e}")
            print(f"[e2e] FAIL Q{i:02d} ({time.time()-t0:5.1f}s) HTTP: {e}")
            continue
        dt = time.time() - t0
        missing = expect.check(answer)
        if missing or not answer:
            failures.append(
                f"Q{i:02d} ({expect.description}) — missing {missing} — answer was: {answer[:200]}"
            )
            print(f"[e2e] FAIL Q{i:02d} ({dt:5.1f}s) missing {missing}")
        else:
            print(f"[e2e] PASS Q{i:02d} ({dt:5.1f}s) {question}")

    assert not failures, "\n".join(failures)


def test_guard_refuses_irrelevant_question():
    """End-to-end: backend should politely refuse off-topic questions."""
    if not _backend_is_up():
        pytest.skip(f"Backend not reachable at {BACKEND_URL}")
    chat_id = str(uuid.uuid4())
    dataset_ids = _upload(chat_id)
    answer = _ask(chat_id, dataset_ids, "What's the weather in Zurich tomorrow?")
    assert answer, "Expected a refusal message, got empty answer"
    assert re.search(r"(weather|isn't in|out of scope|can'?t answer|upload|data)", answer, re.I), (
        f"Refusal message looks wrong: {answer!r}"
    )


if __name__ == "__main__":
    if not _backend_is_up():
        print(f"Backend not reachable at {BACKEND_URL}. Start it with `docker compose up -d`.")
        sys.exit(2)
    try:
        test_all_12_suggested_questions()
        print("\n[e2e] all 12 questions passed")
    except AssertionError as e:
        print(str(e))
        sys.exit(1)
