"""Read-only dashboard endpoints consumed by the frontend.

  GET /users                          - persona roster + eligibility (drives frontend persona toggle)
  GET /scores/history?user_id=...     - per-dimension weekly score timeline

These are derived views over data already produced by `routes/jobs.py`
plus the persona metadata in `mock_data/mock_users.json`. Never mutate.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import asc

from app.config import settings
from app.db import db_session
from app.models import StuckScore, User


router = APIRouter()

MOCK_USERS_PATH: Path = settings.mock_data_dir / "mock_users.json"


def _load_persona_metadata() -> dict[str, dict[str, Any]]:
    """Return `{user_id: row}` from mock_users.json, empty if missing."""
    if not MOCK_USERS_PATH.exists():
        return {}
    data = json.loads(MOCK_USERS_PATH.read_text(encoding="utf-8"))
    return {u["id"]: u for u in data.get("users", [])}


# ============================================================
# Response shapes
# ============================================================

class UserOut(BaseModel):
    id: str
    display_name: Optional[str] = None

    # Persona metadata (populated when mock_users.json has a row).
    # Frontend uses these to render the persona toggle and the
    # eligibility copy on Riya's home page.
    avatar_initial: Optional[str] = None
    age: Optional[int] = None
    location: Optional[str] = None
    role: Optional[str] = None
    plan: Optional[str] = None                    # "premium" | "free"
    plan_tier: Optional[str] = None               # "individual" | "free" | "duo" | "family"
    tenure_months: Optional[int] = None
    primary_language: Optional[str] = None
    collapsed_axis: Optional[str] = None          # "genre" | "language" | "era" | "mood" | null
    eligible_for_pulse: Optional[bool] = None
    why_eligible: Optional[str] = None
    why_ineligible: Optional[str] = None
    signature_quote: Optional[str] = None


class ScoreHistoryRow(BaseModel):
    iso_week: str
    genre: float
    language: float
    era: float
    mood: float
    overall: float
    suggested_scope: str


class ScoreHistoryOut(BaseModel):
    user_id: str
    weeks: list[ScoreHistoryRow]


# ============================================================
# Endpoints
# ============================================================

@router.get("/users", response_model=list[UserOut], tags=["dashboard"])
def list_users() -> list[UserOut]:
    """Persona roster + eligibility.

    Returns the union of:
      * users persisted in the DB (real-mode OAuth users + already-seeded
        demo users from a prior `/jobs/run-detection`), and
      * mock personas defined in `mock_data/mock_users.json`.

    Enriched with plan / tenure / eligibility so the frontend can render
    the persona toggle and, for ineligible users like Riya, the
    "Pulse is Premium-only" copy \u2014 without re-fetching a separate
    endpoint. Sorted by eligible-first, then display_name.
    """
    metadata = _load_persona_metadata()

    with db_session() as db:
        db_rows = {u.id: u for u in db.query(User).all()}

    all_ids = set(metadata.keys()) | set(db_rows.keys())

    users: list[UserOut] = []
    for uid in all_ids:
        meta = metadata.get(uid, {})
        db_user = db_rows.get(uid)
        display_name = (
            meta.get("display_name")
            or (db_user.display_name if db_user else None)
            or uid
        )
        users.append(UserOut(
            id=uid,
            display_name=display_name,
            avatar_initial=meta.get("avatar_initial"),
            age=meta.get("age"),
            location=meta.get("location"),
            role=meta.get("role"),
            plan=meta.get("plan"),
            plan_tier=meta.get("plan_tier"),
            tenure_months=meta.get("tenure_months"),
            primary_language=meta.get("primary_language"),
            collapsed_axis=meta.get("collapsed_axis"),
            eligible_for_pulse=meta.get("eligible_for_pulse"),
            why_eligible=meta.get("why_eligible"),
            why_ineligible=meta.get("why_ineligible"),
            signature_quote=meta.get("signature_quote"),
        ))

    users.sort(key=lambda u: (
        0 if u.eligible_for_pulse else 1,
        (u.display_name or ""),
        u.id,
    ))
    return users


@router.get("/scores/history", response_model=ScoreHistoryOut, tags=["dashboard"])
def get_score_history(user_id: str) -> ScoreHistoryOut:
    """Return the per-dimension weekly stuck-score timeline for a user.

    Ordered ascending by ISO week so the frontend chart can plot
    left-to-right without re-sorting. Returns an empty `weeks` list if
    the user has no scores yet (the frontend shows the empty-state).
    """
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_id query parameter is required",
        )
    with db_session() as db:
        if db.get(User, user_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"user {user_id!r} not found",
            )
        rows = (
            db.query(StuckScore)
            .filter(StuckScore.user_id == user_id)
            .order_by(asc(StuckScore.iso_week))
            .all()
        )
        return ScoreHistoryOut(
            user_id=user_id,
            weeks=[
                ScoreHistoryRow(
                    iso_week=r.iso_week,
                    genre=r.genre,
                    language=r.language,
                    era=r.era,
                    mood=r.mood,
                    overall=r.overall,
                    suggested_scope=r.suggested_scope,
                )
                for r in rows
            ],
        )


__all__ = ["router"]
