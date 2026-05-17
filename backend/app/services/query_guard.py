"""
Question-acceptance guard.

Before we hand a user's question to the deterministic planner or the LLM
SQL generator, we decide whether the question is even answerable from the
datasets in scope. The guard returns one of three statuses:

- "answerable"           — proceed to plan / SQL.
- "needs_clarification"  — the question is too vague to map to a query.
- "out_of_scope"         — the question is unrelated to the data, or is
                           chit-chat / capability questions about the
                           assistant itself.

The implementation is deliberately schema-driven and dependency-free so it
works for ANY dataset, not just the IC Funding Gap mock. It looks at column
names, sample values, sheet names, filenames, and table descriptions to
build a vocabulary of "what this data is about", then matches that against
the user's question.

Heavier dataset-specific intelligence (semantic similarity, LLM-based
classification) can be layered on later — this module is the safety net
that prevents the planner / SQL prompt from being asked nonsense.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


# Generic verbs / phrasing the user uses when they want analytics.
ANALYTIC_KEYWORDS = {
    "show", "list", "give", "tell", "find", "get", "display", "plot", "chart",
    "graph", "visualise", "visualize", "compare", "analyse", "analyze",
    "what", "which", "who", "where", "when", "how", "why",
    "average", "avg", "mean", "median", "sum", "total", "totals", "count",
    "min", "max", "minimum", "maximum", "highest", "lowest", "largest",
    "smallest", "biggest", "top", "bottom", "rank", "ranking", "ratio",
    "share", "percent", "percentage", "pct", "growth", "trend", "trends",
    "evolution", "evolved", "change", "changed", "over time", "breakdown",
    "distribution", "per", "by", "across", "between", "vs", "versus",
    "compared", "correlation", "relationship",
}

# Pure chit-chat / capability probes. We don't try to answer these as data
# questions — we redirect the user to the data.
CHITCHAT_PATTERNS = [
    re.compile(r"^\s*(hi|hello|hey|yo|hola|salut|bonjour|guten tag)\b", re.I),
    re.compile(r"^\s*(thanks|thank you|thx|cheers|ok|okay|cool|nice)\b", re.I),
    re.compile(r"^\s*(who are you|what are you|what can you do|how do you work|help)\b", re.I),
    re.compile(r"^\s*(test|ping)\s*$", re.I),
]

# Topics we should explicitly refuse instead of guessing.
REFUSE_PATTERNS = [
    (re.compile(r"\b(weather|temperature outside|forecast)\b", re.I),
     "weather data isn't in the uploaded datasets"),
    (re.compile(r"\b(stock price|crypto|bitcoin|ethereum)\b", re.I),
     "market data isn't in the uploaded datasets"),
    (re.compile(r"\b(joke|poem|story|recipe|song)\b", re.I),
     "I only answer questions about the uploaded data, not creative writing"),
    (re.compile(r"\b(translate|translation)\b", re.I),
     "I'm a data assistant, not a translator"),
]


@dataclass
class GuardDecision:
    status: str  # "answerable" | "needs_clarification" | "out_of_scope"
    message: str = ""
    # Best-guess answer when out_of_scope / clarification — what the user
    # should see in the chat panel verbatim.

    def is_answerable(self) -> bool:
        return self.status == "answerable"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def classify_question(tables: list[dict], question: str) -> GuardDecision:
    """
    Decide whether a question can be answered from the supplied tables.

    `tables` matches the shape `_load_datasets` returns:
        {table_name, sheet_name, filename, schema, table_description}
    where `schema` is a dict of {col_name: {dtype, sample_values, description, ...}}.

    The function never raises — at worst it returns an "answerable" decision
    and lets the downstream planner / SQL generator handle the question.
    """
    q_raw = (question or "").strip()
    if not q_raw:
        return GuardDecision(
            "needs_clarification",
            "Please ask a question about your uploaded data — e.g. 'show totals by category' or 'compare X and Y'.",
        )

    if not tables:
        return GuardDecision(
            "out_of_scope",
            "No dataset is loaded yet. Please upload a CSV or Excel file first, then ask a question about it.",
        )

    # Chit-chat shortcut.
    if any(p.search(q_raw) for p in CHITCHAT_PATTERNS) and len(q_raw.split()) <= 6:
        return GuardDecision(
            "out_of_scope",
            _capabilities_message(tables),
        )

    # Hard-refuse obviously unrelated topics.
    for pattern, reason in REFUSE_PATTERNS:
        if pattern.search(q_raw):
            return GuardDecision(
                "out_of_scope",
                f"I can't answer that — {reason}. {_capabilities_message(tables, prefix='Try asking about:')}",
            )

    q_tokens = _tokens(q_raw)
    if not q_tokens:
        return GuardDecision(
            "needs_clarification",
            "Could you rephrase that as a question about the data (e.g. 'total X by Y')?",
        )

    vocab, samples = _dataset_vocabulary(tables)
    overlap = q_tokens & (vocab | samples)
    analytic = q_tokens & ANALYTIC_KEYWORDS

    # 1. Direct overlap with column / sample / sheet vocabulary → answerable.
    if overlap:
        return GuardDecision("answerable")

    # 2. Analytic phrasing but no data-noun mentioned. Could be answerable
    #    (the LLM may still match aggregates to the data) but more likely
    #    needs clarification.
    if analytic and len(q_tokens) <= 4:
        return GuardDecision(
            "needs_clarification",
            f"I see you're asking for an aggregate but I'm not sure which field. "
            f"{_capabilities_message(tables, prefix='Available data:')}",
        )

    # 3. No vocabulary overlap AND no analytic phrasing → unrelated.
    if not analytic:
        return GuardDecision(
            "out_of_scope",
            f"That doesn't look like a question I can answer from this dataset. "
            f"{_capabilities_message(tables, prefix='You can ask about:')}",
        )

    # 4. Has analytic phrasing, longer question, but no overlap — let the
    #    LLM try. Worst case the SQL validator will reject and the caller
    #    surfaces a clear error.
    return GuardDecision("answerable")


# ---------------------------------------------------------------------------
# Vocabulary construction
# ---------------------------------------------------------------------------


_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
    "is", "are", "was", "were", "be", "been", "being", "do", "does", "did",
    "have", "has", "had", "this", "that", "these", "those", "it", "its",
    "i", "we", "you", "they", "he", "she", "them", "us", "my", "your",
    "from", "at", "as", "by", "about", "into", "than", "then", "so",
    "but", "if", "not", "no", "yes", "all", "any", "some", "each", "per",
    "me", "us", "our", "their", "his", "her",
}


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS and len(t) > 1}


def _dataset_vocabulary(tables: list[dict]) -> tuple[set[str], set[str]]:
    """Return (column/sheet vocabulary, sample-value vocabulary)."""
    vocab: set[str] = set()
    samples: set[str] = set()
    for t in tables:
        for label in (t.get("sheet_name"), t.get("filename"), t.get("table_description")):
            if label:
                vocab |= _tokens(str(label))
        schema = t.get("schema") or {}
        for col, info in schema.items():
            vocab |= _tokens(str(col))
            if isinstance(info, dict):
                if info.get("description"):
                    vocab |= _tokens(str(info["description"]))
                for sv in (info.get("sample_values") or [])[:8]:
                    samples |= _tokens(str(sv))
    return vocab, samples


def _capabilities_message(tables: list[dict], prefix: str = "I can answer questions about:") -> str:
    """Summarise the available data for the user."""
    bits: list[str] = []
    for t in tables[:5]:
        label = t.get("sheet_name") or t.get("filename") or t.get("table_name")
        cols = list((t.get("schema") or {}).keys())[:6]
        if cols:
            bits.append(f"{label} ({', '.join(cols)})")
        else:
            bits.append(str(label))
    if not bits:
        return "Please upload data first."
    extra = "" if len(tables) <= 5 else f" and {len(tables) - 5} more"
    return f"{prefix} {'; '.join(bits)}{extra}."


# Convenience helper for callers that just want a yes/no on top of the
# decision object.
def is_question_answerable(tables: list[dict], question: str) -> bool:
    return classify_question(tables, question).is_answerable()
