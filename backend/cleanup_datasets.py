from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    rows = conn.execute(text("SELECT table_name FROM datasets")).fetchall()
    for (tname,) in rows:
        conn.execute(text(f'DROP TABLE IF EXISTS "{tname}"'))
    conn.execute(text("DELETE FROM dataset_embeddings"))
    conn.execute(text("DELETE FROM datasets"))
    conn.commit()

print("Done — re-upload your files now")
