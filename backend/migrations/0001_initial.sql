CREATE TABLE
    chats (
        chat_id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL
    );

CREATE EXTENSION IF NOT EXISTS VECTOR;

CREATE TABLE
    datasets (
        dataset_id UUID PRIMARY KEY,
        chat_id UUID NOT NULL REFERENCES chats(chat_id),
        filename VARCHAR(255) NOT NULL,
        sheet_name VARCHAR(255),
        table_name VARCHAR(100) NOT NULL UNIQUE,
        rows INTEGER NOT NULL,
        columns_json TEXT NOT NULL,
        schema_json TEXT NOT NULL,
        table_description TEXT,
        chunk_schema TEXT NOT NULL,
        embedding VECTOR (384) NOT NULL
    );