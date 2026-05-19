import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.schema import Chat, Dataset
from app.routes.schema import QueryRequest, QueryResponse
from app.services.llm_service import generate_answer, generate_sql
from app.services.query_guard import classify_question
from app.services.query_planner import is_analytic_sheet, maybe_plan_structured_query

router = APIRouter(prefix="/query", tags=["query"])


def _load_datasets(
    db: Session,
    user_id: str | None,
    chat_id: str | None,
    dataset_ids: list[str] | None,
) -> list[dict]:
    """
    Fetch schema metadata for datasets in scope.
    Filters to dataset_ids when provided, otherwise loads all.

    TODO: If len(datasets) > 10, switch to RAG-based schema retrieval instead of
    loading all schemas into the prompt.
    """
    query = db.query(Dataset)
    if dataset_ids is not None:
        query = query.filter(Dataset.dataset_id.in_(dataset_ids))
    elif chat_id is not None:
        query = query.filter(Dataset.chat_id == chat_id)
    elif user_id is not None:
        query = query.join(Chat, Dataset.chat_id == Chat.chat_id).filter(Chat.user_id == user_id)
    datasets = query.all()
    if not datasets:
        raise HTTPException(status_code=404, detail="No datasets available to query.")

    analytic_datasets = [d for d in datasets if is_analytic_sheet(d.sheet_name)]
    datasets = analytic_datasets or datasets

    return [
        {
            "table_name": d.table_name,
            "schema": json.loads(d.schema_json),
            "filename": d.filename,
            "sheet_name": d.sheet_name,
            "table_description": d.table_description,
        }
        for d in datasets
    ]


@router.post("", response_model=QueryResponse)
def query_dataset(body: QueryRequest, db: Session = Depends(get_db)):
    if not body.dataset_ids and not body.chat_id and not body.user_id:
        raise HTTPException(
            status_code=400,
            detail="No dataset scope provided. Upload a file first or include a chat or dataset id.",
        )

    tables = _load_datasets(db, user_id=body.user_id, chat_id=body.chat_id, dataset_ids=body.dataset_ids)

    # Cheap gate: refuse / clarify before doing expensive SQL or LLM work.
    guard = classify_question(tables, body.question)
    if not guard.is_answerable():
        return QueryResponse(
            question=body.question,
            answer=guard.message,
            sql=None,
            rows=[],
        )

    plan = maybe_plan_structured_query(tables, body.question)

    if plan is not None:
        sql, display_sql = plan.sql, plan.display_sql
    else:
        try:
            sql, display_sql = generate_sql(tables, body.question)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"SQL generation failed: {exc}")

    def _run(sql_to_run: str):
        result = db.execute(text(sql_to_run))
        columns = list(result.keys())
        return columns, [dict(zip(columns, row)) for row in result.fetchall()]

    try:
        _, rows = _run(sql)
    except Exception as exc:
        # If a planner produced the SQL we can't retry meaningfully — surface it.
        # Otherwise give the LLM one more shot with the DB error as feedback.
        if plan is not None:
            raise HTTPException(
                status_code=422,
                detail=f"Generated SQL could not be executed: {exc}\n\nSQL was: {sql}",
            )
        db.rollback()
        try:
            retry_question = (
                f"{body.question}\n\n"
                f"(Your previous SQL failed with this Postgres error — fix it and try again: {exc})"
            )
            sql, display_sql = generate_sql(tables, retry_question)
            _, rows = _run(sql)
        except Exception as exc2:
            db.rollback()
            raise HTTPException(
                status_code=422,
                detail=f"Generated SQL could not be executed after retry: {exc2}\n\nSQL was: {sql}",
            )

    try:
        if plan is not None and plan.answer_builder is not None:
            answer = plan.answer_builder(rows)
        else:
            answer = generate_answer(body.question, sql, rows)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Answer generation failed: {exc}")

    return QueryResponse(
        question=body.question,
        answer=answer,
        sql=display_sql,  # show readable alias names in the debug output, not UUIDs
        rows=rows,
    )
