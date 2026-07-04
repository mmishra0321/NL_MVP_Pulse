"""Database models + Pydantic shapes for the Reset Radar backend.

This file defines BOTH:
1. SQLAlchemy ORM models (the persisted shape) - inherit from `Base`
2. Pydantic models (the wire shape used by FastAPI routes)

Per architecture.md section 7 (Database tables) - 6 tables total:
users, weekly_snapshots, stuck_scores, nudges, reset_sessions, reset_tracks.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


# ============================================================
# Type aliases for clarity
# ============================================================

NudgeStatus = Literal["pending", "accepted", "dismissed", "expired"]
ResetDecision = Literal["keep", "revert"]
ScopeDimension = Literal["genre", "language", "era", "mood"]


# ============================================================
# SQLAlchemy ORM models (persistence layer)
# ============================================================

def _utcnow() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    spotify_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)
    display_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    access_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class WeeklySnapshot(Base):
    __tablename__ = "weekly_snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    iso_week: Mapped[str] = mapped_column(String, nullable=False)       # "2026-W26"
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)    # per-dimension distributions
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class StuckScore(Base):
    __tablename__ = "stuck_scores"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    iso_week: Mapped[str] = mapped_column(String, nullable=False)
    genre: Mapped[float] = mapped_column(Float, nullable=False)
    language: Mapped[float] = mapped_column(Float, nullable=False)
    era: Mapped[float] = mapped_column(Float, nullable=False)
    mood: Mapped[float] = mapped_column(Float, nullable=False)
    overall: Mapped[float] = mapped_column(Float, nullable=False)
    suggested_scope: Mapped[str] = mapped_column(String, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class Nudge(Base):
    __tablename__ = "nudges"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    overall_stuck_score: Mapped[float] = mapped_column(Float, nullable=False)
    suggested_scope: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ResetSession(Base):
    __tablename__ = "reset_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    nudge_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("nudges.id"), nullable=True)
    scope_dimensions_json: Mapped[list] = mapped_column(JSON, nullable=False)
    free_text_intent: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    spotify_playlist_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    trial_end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    decision: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    before_stuck_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    after_stuck_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # T26 (P5) - sandbox lifecycle columns.
    # `started_at` distinguishes "session created" (created_at) from
    # "user pressed play for the first time" so `days_left` can move to
    # a play-time anchor in the future (open question §17.1). Defaults
    # to created_at for backfilled rows.
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # `outcome_json` caches the rich outcome payload (see §4.3 in
    # architecture.md) so refresh on the Day-10 screen never triggers
    # a recompute. Real mode (P6) additionally uses a 15-min TTL.
    outcome_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Snapshot pointers for the measured before -> after diversity
    # delta. Populated by /jobs/run-detection in real mode: the current
    # week snapshot at session creation becomes `before_snapshot_id`;
    # the first snapshot AFTER `trial_end_date` becomes
    # `after_snapshot_id`. In mock mode these stay NULL and the outcome
    # payload comes from `mock_outcomes.json`.
    before_snapshot_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("weekly_snapshots.id"), nullable=True,
    )
    after_snapshot_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("weekly_snapshots.id"), nullable=True,
    )

    tracks: Mapped[list["ResetTrack"]] = relationship(
        "ResetTrack", back_populates="reset_session", cascade="all, delete-orphan",
    )
    play_events: Mapped[list["SandboxPlayEvent"]] = relationship(
        "SandboxPlayEvent",
        back_populates="reset_session",
        cascade="all, delete-orphan",
    )


class JobRun(Base):
    """One row per `POST /jobs/run-detection` call (R8).

    Captures the full structured summary the detection job already
    returns, so the frontend can show a transparent timeline of
    "what the cron did on Monday".

    `details_json` mirrors the existing `summary["details"]` shape
    exactly - per-user reason / stuck_streak_weeks / latest_overall /
    latest_suggested_scope / nudge_id / (real-mode) any fetch errors.
    """
    __tablename__ = "job_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    mode: Mapped[str] = mapped_column(String, nullable=False)            # "mock" | "real" | "hybrid"
    dry_run: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trigger_source: Mapped[str] = mapped_column(String, default="manual", nullable=False)  # "manual" | "cron"
    users_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    snapshots_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scores_computed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nudges_fired: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    details_json: Mapped[list] = mapped_column(JSON, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class ResetTrack(Base):
    __tablename__ = "reset_tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    reset_session_id: Mapped[str] = mapped_column(
        String, ForeignKey("reset_sessions.id"), nullable=False,
    )
    spotify_track_id: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    artist: Mapped[str] = mapped_column(String, nullable=False)
    album: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    genre: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    era: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mood: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    llm_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    llm_explanation: Mapped[str] = mapped_column(String, default="", nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # T26 (P5) - soft-delete flag. NULL = track is still in the
    # sandbox; a datetime means the user removed it via the kebab
    # sheet. We keep the row so the outcome computation can still
    # reason about what was originally offered.
    removed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    reset_session: Mapped[ResetSession] = relationship("ResetSession", back_populates="tracks")


class SandboxPlayEvent(Base):
    """T26 (P5) - one row per play event inside an active sandbox.

    Populated in real mode by `/jobs/run-detection`, which polls
    Spotify's `/me/player/recently-played` for every user with an
    active sandbox session. Mock mode never writes rows here — the
    outcome payload comes from `mock_outcomes.json`.

    The `played_at` + `spotify_track_id` composite is treated as the
    dedup key (Spotify sometimes returns the same play twice across
    polls); we index those two columns so the dedup query stays cheap.
    """
    __tablename__ = "sandbox_play_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    reset_session_id: Mapped[str] = mapped_column(
        String, ForeignKey("reset_sessions.id"), nullable=False,
    )
    spotify_track_id: Mapped[str] = mapped_column(String, nullable=False)
    played_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    source: Mapped[str] = mapped_column(String, default="recently_played", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    reset_session: Mapped[ResetSession] = relationship(
        "ResetSession", back_populates="play_events",
    )


# ============================================================
# Pydantic models (wire shapes - API request/response bodies)
# ============================================================

class StuckScoresPerDimension(BaseModel):
    genre: float = Field(ge=0.0, le=1.0)
    language: float = Field(ge=0.0, le=1.0)
    era: float = Field(ge=0.0, le=1.0)
    mood: float = Field(ge=0.0, le=1.0)


class NudgeOut(BaseModel):
    id: str
    user_id: str
    overall_stuck_score: float = Field(ge=0.0, le=1.0)
    per_dimension: StuckScoresPerDimension
    suggested_scope: ScopeDimension
    status: NudgeStatus
    created_at: datetime


class NudgeResponseIn(BaseModel):
    action: Literal["dismiss", "accept"]


class ResetSessionIn(BaseModel):
    user_id: str
    scope_dimensions: list[ScopeDimension] = Field(min_length=1)
    free_text_intent: Optional[str] = Field(default=None, max_length=400)


class ResetTrackOut(BaseModel):
    spotify_track_id: str
    title: str
    artist: str
    album: Optional[str] = None
    why: str = Field(max_length=200)
    order_index: int


class ResetSessionOut(BaseModel):
    id: str
    user_id: str
    scope_dimensions: list[ScopeDimension]
    free_text_intent: Optional[str] = None
    playlist_url: Optional[str] = None
    trial_end_date: datetime
    decision: Optional[ResetDecision] = None
    tracks: list[ResetTrackOut]
    created_at: datetime


class ResetDecisionIn(BaseModel):
    decision: ResetDecision


class ResetOutcomeOut(BaseModel):
    session_id: str
    before_stuck_score: Optional[float] = None
    after_stuck_score: Optional[float] = None
    decision: Optional[ResetDecision] = None


# ============================================================
# Rich outcome shape used by GET /reset/sessions/{id}/outcome
# ============================================================
#
# Screen 4 (Keep or Revert, Day 10) needs measured evidence, not just a
# projected score. That means: how many tracks were actually played,
# which ones became repeat plays, whether any artist ended up in search
# history, and the before/after diversity delta on the *collapsed*
# dimension. Mock mode reads this straight from
# `mock_data/mock_outcomes.json`; real mode (P6) computes from
# `sandbox_play_events` + snapshot deltas.

class OutcomeTracksPlayed(BaseModel):
    played: int = Field(ge=0)
    total: int = Field(ge=0)


class OutcomeRepeatPlay(BaseModel):
    spotify_track_id: str
    title: str
    artist: str
    plays: int = Field(ge=0)


class OutcomeArtistHit(BaseModel):
    artist: str
    source: str


class ResetOutcomeDetailOut(BaseModel):
    """Rich outcome used by the frontend Day-10 screen.

    `collapsed_dimension` tells the client which pair of `before_*_pct` /
    `after_*_pct` fields to plot (language for Karthik, genre for
    Aanya). The dimension-specific fields stay `Optional` so future
    personas can collapse on `era` or `mood` without another schema
    change.
    """
    session_id: str
    user_id: str
    day_index: int = Field(ge=0)
    collapsed_dimension: ScopeDimension
    decision: Optional[ResetDecision] = None
    tracks_played_count: OutcomeTracksPlayed
    repeat_plays: list[OutcomeRepeatPlay]
    artist_search_hits: list[OutcomeArtistHit]
    before_language_pct: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    after_language_pct: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    before_genre_pct: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    after_genre_pct: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    diversity_delta_pts: int
    narrative_before: str
    narrative_after: str


__all__ = [
    "User",
    "WeeklySnapshot",
    "StuckScore",
    "Nudge",
    "JobRun",
    "ResetSession",
    "ResetTrack",
    "SandboxPlayEvent",
    "StuckScoresPerDimension",
    "NudgeOut",
    "NudgeResponseIn",
    "ResetSessionIn",
    "ResetTrackOut",
    "ResetSessionOut",
    "ResetDecisionIn",
    "ResetOutcomeOut",
    "ResetOutcomeDetailOut",
    "OutcomeTracksPlayed",
    "OutcomeRepeatPlay",
    "OutcomeArtistHit",
    "NudgeStatus",
    "ResetDecision",
    "ScopeDimension",
]
