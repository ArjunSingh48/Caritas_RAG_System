import math
import uuid
import json
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.db.schema import Chat, Dataset
from app.routes.schema import DatasetMeta, UploadResponse
from app.services.embedding_service import generate_embedding
from app.services.llm_service import generate_description, generate_table_description

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
TEST_USER = uuid.UUID("1d560601-97aa-4ada-8cea-c6c53405c73d")


def _ensure_chat(db: Session, chat_id: uuid.UUID | None) -> uuid.UUID:
    """
    Ensure the parent chat row exists and is durably committed BEFORE any
    dataset insert. Uses an autonomous AUTOCOMMIT connection (separate from
    the request session) so the row is visible across the engine's pool by
    the time we return — eliminating the FK race against datasets_chat_id_fkey.
    """
    target_chat_id = chat_id or uuid.uuid4()
    engine = db.get_bind()
    # Make sure the request session has no pending transaction holding locks
    # against the chats row we're about to insert.
    db.rollback()
    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        conn.execute(
            text(
                """
                INSERT INTO chats (chat_id, user_id, name)
                VALUES (:chat_id, :user_id, :name)
                ON CONFLICT (chat_id) DO NOTHING
                """
            ),
            {"chat_id": target_chat_id, "user_id": TEST_USER, "name": "Chat"},
        )
        row = conn.execute(
            text("SELECT chat_id FROM chats WHERE chat_id = :chat_id"),
            {"chat_id": target_chat_id},
        ).first()
    if not row:
        raise RuntimeError(f"Failed to create chat {target_chat_id}")
    # Expire the session so subsequent queries see the freshly-committed row.
    db.expire_all()
    return target_chat_id


def _persist_dataset(db: Session, dataset: Dataset, chat_id: uuid.UUID) -> None:
    existing = db.query(Chat).filter(Chat.chat_id == chat_id).first()
    if not existing:
        raise IntegrityError(
            statement="dataset insert precheck",
            params={"chat_id": str(chat_id)},
            orig=Exception(f"Missing chat before dataset insert: {chat_id}"),
        )

    try:
        db.add(dataset)
        db.flush()
        db.commit()
        db.refresh(dataset)
    except IntegrityError:
        db.rollback()
        raise


def _sheet_table_name(dataset_id: str, sheet_name: str) -> str:
    safe_sheet = "".join(c if c.isalnum() else "_" for c in sheet_name.lower())
    return f"ds_{dataset_id.replace('-', '')}_{safe_sheet}"


def _load_excel_sheets(file_path: Path) -> dict[str, pd.DataFrame]:
    xls = pd.ExcelFile(file_path)
    sheets = {}
    for sheet_name in xls.sheet_names:
        sheets[sheet_name] = xls.parse(sheet_name)
    return sheets


def _load_dataframes(file_path: Path, suffix: str) -> list[pd.DataFrame]:
    if suffix == ".csv":
        stem = file_path.stem
        return {stem: pd.read_csv(file_path)}
    if suffix in {".xlsx", ".xls"}:
        return _load_excel_sheets(file_path)
    else:
        raise ValueError(f"Unsupported file type '{suffix}'")


@router.post("", response_model=list[UploadResponse])
async def upload_file(
    file: UploadFile = File(...),
    chat_id: uuid.UUID | None = Form(None),
    db: Session = Depends(get_db),
):
    chat_id = _ensure_chat(db, chat_id)
    confirmed_chat = db.query(Chat).filter(Chat.chat_id == chat_id).first()
    if not confirmed_chat:
        raise HTTPException(status_code=500, detail=f"Chat could not be created for upload: {chat_id}")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    contents = await file.read()
    if len(contents) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="File exceeds maximum allowed size."
        )

    file_id = str(uuid.uuid4())
    dest = settings.upload_path / f"{file_id}{suffix}"
    dest.write_bytes(contents)

    dfs = _load_dataframes(dest, suffix)

    stem = Path(file.filename).stem
    upload_responses = []
    for sheet_name, df in dfs.items():
        dataset_id = str(uuid.uuid4())
        table_name = _sheet_table_name(dataset_id, sheet_name)
        df_schema = _infer_schema(df)
        has_sheet = sheet_name != stem
        display_name = file.filename if not has_sheet else f"{stem}{suffix}"
        stored_sheet = sheet_name if has_sheet else None

        schema_text, embedding = await generate_embedding(dataset_id, df_schema)

        try:
            # TODO: Add a await or display for frontend to signal this
            table_desc = None
            if settings.GENERATE_COLUMN_DESCRIPTION == True:
                df_schema = generate_description(df_schema)
                table_desc = generate_table_description(
                    file.filename, sheet_name, df_schema
                )
            df.to_sql(table_name, con=db.get_bind(), if_exists="replace", index=False)
            dataset = Dataset(
                dataset_id=dataset_id,
                chat_id=chat_id,
                filename=display_name,
                sheet_name=stored_sheet,
                table_name=table_name,
                rows=len(df),
                columns_json=json.dumps(df.columns.tolist()),
                schema_json=json.dumps(df_schema, default=str, allow_nan=False),
                table_description=table_desc,
                chunk_schema=schema_text,
                embedding=embedding,
            )
            _persist_dataset(db, dataset, chat_id)

            # Generate and store embedding asynchronously without blocking the main thread

        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=500, detail=f"Failed to ingest dataset: {exc}"
            )

        preview = json.loads(df.head(5).to_json(orient="records"))
        upload_responses.append(
            UploadResponse(
                dataset_id=dataset_id,
                filename=display_name,
                sheet_name=stored_sheet,
                rows=len(df),
                columns=df.columns.tolist(),
                preview=preview,
                df_schema=df_schema,
            )
        )

    return upload_responses


@router.delete("/all")
def delete_all_datasets(db: Session = Depends(get_db)):
    datasets = db.query(Dataset).all()
    for dataset in datasets:
        db.execute(text(f'DROP TABLE IF EXISTS "{dataset.table_name}"'))
        db.delete(dataset)
    # read all tables that exist despite deletion to avoid orphaned tables which are not referenced in the datasets table
    existing_tables = db.execute(text("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'ds_%'
    """)).fetchall()
    for (table_name,) in existing_tables:
        db.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
    db.commit()

    return {"deleted": len(datasets), "deleted_dataset_ids": [ds.dataset_id for ds in datasets], "dropped_orphan_tables": [t[0] for t in existing_tables]}


@router.delete("/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: uuid.UUID, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    db.execute(text(f'DROP TABLE IF EXISTS "{dataset.table_name}"'))
    db.delete(dataset)
    db.commit()


@router.get("/{dataset_id}/preview")
def get_dataset_preview(dataset_id: uuid.UUID, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    rows = (
        db.execute(text(f'SELECT * FROM "{dataset.table_name}" LIMIT 5'))
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.get("/{dataset_id}", response_model=DatasetMeta)
def get_dataset_meta(dataset_id: uuid.UUID, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    return DatasetMeta(
        dataset_id=dataset.dataset_id,
        filename=dataset.filename,
        sheet_name=dataset.sheet_name,
        rows=dataset.rows,
        columns=json.loads(dataset.columns_json),
        df_schema=json.loads(dataset.schema_json),
        table_description=dataset.table_description,
    )


@router.get("", response_model=list[DatasetMeta])
def list_datasets(db: Session = Depends(get_db)):
    datasets = db.query(Dataset).all()
    result = []
    for dataset in datasets:
        try:
            result.append(
                DatasetMeta(
                    dataset_id=dataset.dataset_id,
                    filename=dataset.filename,
                    sheet_name=dataset.sheet_name,
                    rows=dataset.rows,
                    columns=json.loads(dataset.columns_json),
                    df_schema=json.loads(dataset.schema_json),
                    table_description=dataset.table_description,
                )
            )
        except (json.JSONDecodeError, Exception):
            # Skip rows with corrupt JSON — delete and re-upload the file
            pass
    return result


def _infer_schema(df: pd.DataFrame) -> dict:
    """
    Infer a simple schema from the DataFrame, including data types, sample values, and nullability.
    """
    schema = {}
    for col in df.columns:
        dtype = str(df[col].dtype)
        if dtype.startswith("int"):
            col_dtype = "integer"
        elif dtype.startswith("float"):
            col_dtype = "float"
        elif dtype == "bool":
            col_dtype = "boolean"
        else:
            col_dtype = "string"

        col_sample_values = [
            v.isoformat() if hasattr(v, "isoformat") else v
            for v in df[col].dropna().unique()[:5].tolist()
            if not (isinstance(v, float) and not math.isfinite(v))
        ]
        col_nullability = bool(df[col].isnull().any())
        col_primary_key = bool(df[col].is_unique and not col_nullability)

        # TODO: Implement description creation using LLM here

        schema[col] = {
            "dtype": col_dtype,
            "sample_values": col_sample_values,
            "nullability": col_nullability,
            "primary_key": col_primary_key,
            "description": "",  # TODO: Add description field for user input later
        }
    return schema
