from pydantic import BaseModel
from typing import Any
import uuid



class UploadResponse(BaseModel):
    dataset_id: uuid.UUID
    filename: str
    sheet_name: str | None
    rows: int
    columns: list[str]
    preview: list[dict[str, Any]]
    df_schema: dict[str, Any]


class QueryRequest(BaseModel):
    question: str
    user_id: str | None = None
    chat_id: str | None = None
    dataset_ids: list[str] | None = None  # if set, restrict query to these datasets


class ChartConfig(BaseModel):
    type: str  # bar, line, pie, scatter, table
    title: str
    x_axis: str | None = None
    y_axis: str | None = None
    data: list[dict[str, Any]]


class QueryResponse(BaseModel):
    question: str
    answer: str
    sql: str | None = None
    rows: list[dict[str, Any]] = []
    chart: ChartConfig | None = None


class DatasetMeta(BaseModel):
    dataset_id: uuid.UUID
    filename: str
    sheet_name: str | None = None
    rows: int
    columns: list[str]
    df_schema: dict[str, Any] = {}
    table_description: str | None = None
