from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.database.base import Base

settings = get_settings()
DATABASE_URL = settings.database_url

connect_args: dict[str, object] = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so SQLAlchemy registers table metadata before create_all.
    from app.modules import models as _models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_runtime_schema()


def _ensure_runtime_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    if "parking_sessions" in tables:
        existing = {col["name"] for col in inspector.get_columns("parking_sessions")}
        additions = [
            ("lot_id", "INTEGER"),
            ("exit_camera_id", "INTEGER"),
            ("entry_snapshot_path", "VARCHAR(512)"),
            ("exit_snapshot_path", "VARCHAR(512)"),
            ("fee", "INTEGER"),
            ("duration_minutes", "INTEGER"),
        ]
        with engine.begin() as conn:
            for name, sql_type in additions:
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE parking_sessions ADD COLUMN {name} {sql_type}"))

    if "parking_lots" in tables:
        lot_cols = {col["name"] for col in inspector.get_columns("parking_lots")}
        if "capacity" not in lot_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE parking_lots ADD COLUMN capacity INTEGER DEFAULT 50 NOT NULL"))
