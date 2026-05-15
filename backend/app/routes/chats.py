import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.schema import Chat, Dataset
import uuid
from sqlalchemy.dialects.postgresql import UUID


router = APIRouter()

TEST_USER = uuid.UUID("1d560601-97aa-4ada-8cea-c6c53405c73d")


class EnsureChatRequest(BaseModel):
    chat_id: uuid.UUID


@router.get("/chats")
def list_chats(db: Session = Depends(get_db)):
    chats = db.query(Chat).filter(Chat.user_id == TEST_USER).all()
    return [{"chat_id": c.chat_id, "name": c.name} for c in chats]


@router.post("/chats", status_code=201)
def create_chat(db: Session = Depends(get_db)):
    count = db.query(Chat).filter(Chat.user_id == TEST_USER).count()
    chat = Chat(chat_id=uuid.uuid4(), user_id=TEST_USER, name=f"Chat {count + 1}")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {"chat_id": chat.chat_id, "name": chat.name}


@router.post("/chats/ensure", status_code=200)
def ensure_chat(body: EnsureChatRequest, db: Session = Depends(get_db)):
    existing = db.query(Chat).filter(Chat.chat_id == body.chat_id).first()
    if existing:
        return {"chat_id": existing.chat_id, "name": existing.name, "created": False}

    count = db.query(Chat).filter(Chat.user_id == TEST_USER).count()
    chat = Chat(chat_id=body.chat_id, user_id=TEST_USER, name=f"Chat {count + 1}")
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {"chat_id": chat.chat_id, "name": chat.name, "created": True}


@router.delete("/chats/{chat_id}", status_code=200)
def delete_chat(chat_id: uuid.UUID, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.chat_id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    datasets = db.query(Dataset).filter(Dataset.chat_id == chat_id).all()
    if datasets:
        for ds in datasets:
            db.delete(ds)
    # Also drop any tables associated with this chat's datasets to avoid orphaned tables
    existing_tables = db.execute(text("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'ds_%'
    """)).fetchall()
    for (table_name,) in existing_tables:
        db.execute(text(f'DROP TABLE IF EXISTS "{table_name}"'))
    db.delete(chat)
    db.commit()
    return {"deleted_chat_id": chat.chat_id, "deleted_datasets": [ds.dataset_id for ds in datasets], "dropped_orphan_tables": [t[0] for t in existing_tables]}

@router.get("/chats/{chat_id}/datasets")
def get_chat_datasets(chat_id: uuid.UUID, db: Session = Depends(get_db)):
    datasets = db.query(Dataset).filter(Dataset.chat_id == chat_id).all()
    if not datasets:
        raise HTTPException(status_code=404, detail="Chat or datasets not found.")
    return {"chat_id": chat_id, "dataset_ids": [ds.dataset_id for ds in datasets]}
