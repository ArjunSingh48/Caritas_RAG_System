"""
End-to-end upload-and-query test.

Uploads `evals/datasets/raw/IC_Funding_Gap_MockData.xlsx` to the running
backend (default http://localhost:8000) and then runs every question from
`evals/questions.txt` against the resulting datasets, reporting which ones
returned a usable answer.

Run from the repo root:

    BACKEND_URL=http://localhost:8000 python backend/tests/test_e2e_funding_gap.py

or via pytest:

    pytest backend/tests/test_e2e_funding_gap.py -s
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
XLSX_PATH = REPO_ROOT / "evals" / "datasets" / "raw" / "IC_Funding_Gap_MockData.xlsx"
QUESTIONS_PATH = REPO_ROOT / "evals" / "questions.txt"
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
TIMEOUT = httpx.Timeout(180.0, connect=10.0)


def _backend_is_up() -> bool:
    try:
        r = httpx.get(f"{BACKEND_URL}/api/health", timeout=5.0)
        return r.status_code == 200
    except Exception:
        return False


def _load_questions() -> list[str]:
    out = []
    for line in QUESTIONS_PATH.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip leading "12. "
        if line[0].isdigit():
            line = line.split(".", 1)[1].strip()
        out.append(line)
    return out


def _upload(chat_id: str) -> list[str]:
    assert XLSX_PATH.exists(), f"Missing fixture: {XLSX_PATH}"
    with httpx.Client(timeout=TIMEOUT) as client:
        with XLSX_PATH.open("rb") as f:
            files = {"file": (XLSX_PATH.name, f,
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            data = {"chat_id": chat_id}
            r = client.post(f"{BACKEND_URL}/api/upload", files=files, data=data)
        r.raise_for_status()
        payload = r.json()
        ids = [item["dataset_id"] for item in payload]
        assert ids, "Upload returned no datasets"
        return ids


def _ask(chat_id: str, dataset_ids: list[str], question: str) -> tuple[bool, str]:
    body = {
        "question": question,
        "chat_id": chat_id,
        "dataset_ids": dataset_ids,
    }
    with httpx.Client(timeout=TIMEOUT) as client:
        r = client.post(f"{BACKEND_URL}/api/query", json=body)
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:200]}"
    data = r.json()
    answer = (data.get("answer") or "").strip()
    if not answer:
        return False, "empty answer"
    return True, answer[:160].replace("\n", " ")


@pytest.mark.skipif(not _backend_is_up(), reason="Backend not reachable at $BACKEND_URL")
def test_full_question_set():
    chat_id = str(uuid.uuid4())
    print(f"\n[e2e] uploading {XLSX_PATH.name} → chat {chat_id}")
    dataset_ids = _upload(chat_id)
    print(f"[e2e] uploaded {len(dataset_ids)} sheet datasets")

    questions = _load_questions()
    results: list[tuple[int, bool, str, str]] = []
    for i, q in enumerate(questions, start=1):
        t0 = time.time()
        ok, info = _ask(chat_id, dataset_ids, q)
        dt = time.time() - t0
        marker = "PASS" if ok else "FAIL"
        print(f"[e2e] {marker:4s} Q{i:02d} ({dt:5.1f}s) {q}\n        → {info}")
        results.append((i, ok, q, info))

    failures = [r for r in results if not r[1]]
    print(f"\n[e2e] {len(results) - len(failures)}/{len(results)} answered successfully")
    assert not failures, (
        f"{len(failures)} of {len(results)} questions failed:\n"
        + "\n".join(f"  Q{i}: {q} → {info}" for i, _, q, info in failures)
    )


if __name__ == "__main__":
    if not _backend_is_up():
        print(f"Backend not reachable at {BACKEND_URL}. Start it with `docker compose up -d`.")
        sys.exit(2)
    try:
        test_full_question_set()
    except AssertionError as e:
        print(str(e))
        sys.exit(1)
