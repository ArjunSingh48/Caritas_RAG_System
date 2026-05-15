import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.schema import Chat, Dataset
from app.routes.upload import _persist_dataset


def _make_session():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return SessionLocal()


def test_persist_dataset_requires_existing_chat():
    db = _make_session()
    missing_chat_id = uuid.uuid4()

    dataset = Dataset(
        dataset_id=uuid.uuid4(),
        chat_id=missing_chat_id,
        filename="sample.xlsx",
        sheet_name="Sheet1",
        table_name="ds_sample_sheet1",
        rows=1,
        columns_json='["a"]',
        schema_json='{"a":{"dtype":"string","sample_values":[],"nullability":true,"primary_key":false,"description":""}}',
        table_description=None,
        chunk_schema="a: (string, , e.g. [])",
        embedding=[0.0] * 384,
    )

    try:
        _persist_dataset(db, dataset, missing_chat_id)
    except Exception as exc:
        assert "Missing chat before dataset insert" in str(exc)
    else:
        raise AssertionError("Expected dataset persistence to fail without a chat")


def test_persist_dataset_succeeds_for_existing_chat():
    db = _make_session()
    chat_id = uuid.uuid4()
    db.add(Chat(chat_id=chat_id, user_id=uuid.uuid4(), name="Chat"))
    db.commit()

    dataset = Dataset(
        dataset_id=uuid.uuid4(),
        chat_id=chat_id,
        filename="sample.xlsx",
        sheet_name="Sheet1",
        table_name="ds_sample_sheet1",
        rows=1,
        columns_json='["a"]',
        schema_json='{"a":{"dtype":"string","sample_values":[],"nullability":true,"primary_key":false,"description":""}}',
        table_description=None,
        chunk_schema="a: (string, , e.g. [])",
        embedding=[0.0] * 384,
    )

    _persist_dataset(db, dataset, chat_id)

    stored = db.query(Dataset).filter(Dataset.dataset_id == dataset.dataset_id).first()
    assert stored is not None
    assert stored.chat_id == chat_id