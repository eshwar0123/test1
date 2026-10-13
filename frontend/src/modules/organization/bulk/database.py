import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ── Connection URL ─────────────────────────────────────────────────────────────
# Local SQLite (default / fallback):
#   DATABASE_URL=sqlite:///./bulk_upload.db
#
# Supabase (paste your connection string from Project Settings → Database):
#   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
#
# Set as env var:  export DATABASE_URL="postgresql://..."
# ──────────────────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bulk_upload.db")

def _make_engine():
    if DATABASE_URL.startswith("sqlite"):
        return create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
        )
    # PostgreSQL / Supabase — enable SSL and connection pooling
    connect_args = {}
    if "supabase" in DATABASE_URL:
        connect_args["sslmode"] = "require"
    return create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,       # drop stale connections automatically
        pool_recycle=300,         # recycle connections every 5 min
    )

engine = _make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)