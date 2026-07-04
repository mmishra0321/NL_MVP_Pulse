"""SQLite engine + session factory for the Reset Radar backend.

Uses SQLAlchemy 2.0-style declarative base. Schema is defined in
`app/models.py`; this module just owns the engine and the `init_db()`
function called once at startup.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


log = logging.getLogger("reset_radar.db")


class Base(DeclarativeBase):
    """Single declarative base shared by every ORM model in the app."""


engine = create_engine(
    settings.database_url,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


# ============================================================
# P5 T26 - lightweight ADD COLUMN migrations
# ============================================================
#
# When `ResetSession` / `ResetTrack` gained new columns in P5, any
# existing dev SQLite DB kept the old schema and started throwing
# `sqlite3.OperationalError: no such column: ...` on writes. Rather
# than force everyone to delete `reset_radar.db`, we run a tiny
# additive migration at startup:
#
#   - For every model column that is NOT NULLable, `create_all` still
#     creates the fresh table from scratch as before.
#   - For every model column that IS NULLable and is missing on the
#     existing SQLite table, we issue a raw `ALTER TABLE ADD COLUMN`.
#     SQLite has supported this since 3.25 and it's non-destructive.
#
# We only manage NEW nullable columns this way. Any breaking change
# (renaming, retyping, dropping) is still an "rm the dev DB" event.
_NULLABLE_ADDITIONS: dict[str, list[tuple[str, str]]] = {
    # table_name -> [(column_name, sqlite_column_definition), ...]
    # Definitions match app/models.py.
    "reset_sessions": [
        ("started_at", "DATETIME"),
        ("outcome_json", "JSON"),
        ("before_snapshot_id", "VARCHAR"),
        ("after_snapshot_id", "VARCHAR"),
    ],
    "reset_tracks": [
        ("removed_at", "DATETIME"),
    ],
}


def _run_lightweight_migrations() -> None:
    """Additive ADD COLUMN migrations for the P5 schema bump.

    Idempotent - reads the current table schema via SQLAlchemy's
    inspector and only issues an `ALTER TABLE ADD COLUMN` when the
    column is genuinely missing. Any error here is logged but
    non-fatal so backend startup still succeeds against a fresh DB
    (where `create_all` already produced the up-to-date schema).
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table_name, additions in _NULLABLE_ADDITIONS.items():
        if table_name not in existing_tables:
            # `create_all` (called just after this) will make it from
            # scratch with the up-to-date column set.
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
        for col_name, col_def in additions:
            if col_name in existing_cols:
                continue
            stmt = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"
            try:
                with engine.begin() as conn:
                    conn.execute(text(stmt))
                log.info("db migration: added %s.%s (%s)", table_name, col_name, col_def)
            except Exception as exc:                                    # noqa: BLE001
                log.warning(
                    "db migration: ADD COLUMN failed for %s.%s (%s) - continuing",
                    table_name, col_name, exc,
                )


def init_db() -> None:
    """Create all tables + additive migrations. Idempotent.

    Called once from `main.py` on FastAPI startup.
    """
    # Importing models for side-effect of registering them on Base.metadata.
    from app import models                                       # noqa: F401

    _run_lightweight_migrations()
    Base.metadata.create_all(bind=engine)


@contextmanager
def db_session() -> Iterator[Session]:
    """Per-request session context manager.

    Usage in a FastAPI route:
        with db_session() as db:
            db.add(row)
            db.commit()
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


__all__ = ["Base", "engine", "SessionLocal", "init_db", "db_session"]
