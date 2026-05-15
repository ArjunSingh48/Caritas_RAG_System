from sqlalchemy import text

from sentence_transformers import SentenceTransformer
from app.db.schema import Dataset
from sqlalchemy.orm import Session

import asyncio

_model = SentenceTransformer("all-MiniLM-L6-v2")
# TODO: add a wrapper to load?
print(_model.encode("test").shape)  # Santy check, can remove later


async def generate_embedding(dataset_id: str, schema_dict: dict) -> None:
    schema_text = _schema_to_text(schema_dict)
    embedding = await asyncio.get_event_loop().run_in_executor(
        None, lambda: _model.encode(schema_text).tolist()
    )  # Convert to list for JSON storage

    return schema_text, embedding


async def retrieve_relavant_schemas(
    query: str, db: Session, top_k: int = 5
) -> list[dict]:
    query_embedding = await asyncio.get_event_loop().run_in_executor(
        None, lambda: _model.encode(query).tolist()
    )

    results = (
        db.execute(
            text("""
        SELECT d.dataset_id, d.chunk_schema, d.filename,
               d.embedding <=> CAST(:vec AS vector) AS distance
        FROM datasets d
        ORDER BY distance ASC
        LIMIT :top_k
        """),
            {"vec": str(query_embedding), "top_k": top_k},
        )
        .mappings()
        .all()
    )

    return [dict(r) for r in results]


def _schema_to_text(schema_dict: dict) -> str:
    parts = []
    for col_name, col_info in schema_dict.items():
        phrase = f"{col_name}: ({col_info['dtype']}, {col_info['description']}, e.g. {col_info['sample_values']})"
        parts.append(phrase)

    return " ".join(parts)
