"""Unit tests for the P5 T51 sandbox-play polling helper.

Covers the three things that actually matter for T51's contract:
  1. Mock mode is a genuine no-op (no Spotify fetch, no DB writes).
  2. Real-mode inserts a SandboxPlayEvent per unique (track, played_at)
     pair returned by Spotify - dedup on repeat polls.
  3. A Spotify failure for one session does NOT abort the others; the
     surrounding detection run stays green.

These map to the T51 verify column: 'new unit test with a mocked
Spotify client; verifies inserts.'
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from app.config import settings
from app.db import Base, db_session, engine
from app.models import ResetSession, ResetTrack, SandboxPlayEvent, User
from app.routes.jobs import _poll_sandbox_plays
from app.spotify_client import SpotifyAuthError


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture
def user_with_session():
    """Insert a User with an access_token + one active ResetSession + 3 tracks."""
    uid = "u-poll-1"
    sid = "s-poll-1"
    now = datetime.utcnow()
    with db_session() as db:
        db.add(User(
            id=uid,
            spotify_user_id="spot-1",
            display_name="Poll Test",
            access_token="live-token",
            refresh_token="refresh-token",
            token_expires_at=now + timedelta(hours=1),
            created_at=now,
        ))
        db.add(ResetSession(
            id=sid,
            user_id=uid,
            nudge_id=None,
            scope_dimensions_json=["language"],
            free_text_intent=None,
            spotify_playlist_id="pl-1",
            trial_end_date=now + timedelta(days=10),
            before_stuck_score=0.82,
            created_at=now,
            started_at=now,
        ))
        for i in range(3):
            db.add(ResetTrack(
                id=str(uuid.uuid4()),
                reset_session_id=sid,
                spotify_track_id=f"tr-{i}",
                title=f"T{i}", artist=f"A{i}", album="Alb",
                genre="indie", language="en", era="2010s", mood="chill",
                llm_score=0.9, llm_explanation="because.",
                order_index=i,
            ))
        db.commit()
    return uid, sid


# ============================================================
# Tests
# ============================================================

class TestPollSandboxPlays:
    def test_mock_mode_skips_entirely(self, monkeypatch, user_with_session):
        monkeypatch.setattr(settings, "mock_mode", True)
        # The Spotify fetch must NOT be called in mock mode.
        with patch(
            "app.routes.jobs.fetch_recent_plays_for_polling",
        ) as fetch_mock, db_session() as db:
            sessions = db.query(ResetSession).all()
            trace = _poll_sandbox_plays(db, sessions)
        fetch_mock.assert_not_called()
        assert trace["skipped"] == "mock_mode"

        # No SandboxPlayEvent rows were written.
        with db_session() as db:
            assert db.query(SandboxPlayEvent).count() == 0

    def test_real_mode_inserts_matching_plays_only(
        self, monkeypatch, user_with_session,
    ):
        _uid, sid = user_with_session
        monkeypatch.setattr(settings, "mock_mode", False)

        # Spotify returns 4 plays: 2 match the session's tracks (tr-0, tr-2),
        # 2 belong to other tracks and must be ignored.
        pa0 = datetime(2026, 7, 4, 10, 0, 0)
        pa1 = datetime(2026, 7, 4, 10, 5, 0)
        pa2 = datetime(2026, 7, 4, 10, 10, 0)
        pa3 = datetime(2026, 7, 4, 10, 15, 0)
        with patch(
            "app.routes.jobs.fetch_recent_plays_for_polling",
            return_value=[
                ("tr-0", pa0),
                ("outside-1", pa1),
                ("tr-2", pa2),
                ("outside-2", pa3),
            ],
        ), db_session() as db:
            sessions = db.query(ResetSession).all()
            trace = _poll_sandbox_plays(db, sessions)
            db.commit()

        assert trace["sessions"] == 1
        assert trace["events_inserted"] == 2

        with db_session() as db:
            rows = db.query(SandboxPlayEvent).all()
        assert len(rows) == 2
        recorded = sorted((r.spotify_track_id, r.played_at) for r in rows)
        assert recorded == [("tr-0", pa0), ("tr-2", pa2)]

    def test_dedup_on_repeat_poll(self, monkeypatch, user_with_session):
        monkeypatch.setattr(settings, "mock_mode", False)
        pa0 = datetime(2026, 7, 4, 10, 0, 0)

        # Two polls returning the SAME event: the second must be a no-op.
        with patch(
            "app.routes.jobs.fetch_recent_plays_for_polling",
            return_value=[("tr-0", pa0)],
        ), db_session() as db:
            sessions = db.query(ResetSession).all()
            _poll_sandbox_plays(db, sessions)
            db.commit()
            trace_2 = _poll_sandbox_plays(db, sessions)
            db.commit()

        assert trace_2["events_inserted"] == 0
        with db_session() as db:
            assert db.query(SandboxPlayEvent).count() == 1

    def test_spotify_auth_error_is_non_fatal(
        self, monkeypatch, user_with_session,
    ):
        monkeypatch.setattr(settings, "mock_mode", False)
        with patch(
            "app.routes.jobs.fetch_recent_plays_for_polling",
            side_effect=SpotifyAuthError("token expired"),
        ), db_session() as db:
            sessions = db.query(ResetSession).all()
            trace = _poll_sandbox_plays(db, sessions)
            db.commit()

        # No events inserted, but the call returned - didn't raise.
        assert trace["events_inserted"] == 0
        assert "error" in trace["per_session"][0]
        with db_session() as db:
            assert db.query(SandboxPlayEvent).count() == 0

    def test_no_active_sessions_short_circuits(self, monkeypatch):
        monkeypatch.setattr(settings, "mock_mode", False)
        with patch(
            "app.routes.jobs.fetch_recent_plays_for_polling",
        ) as fetch_mock, db_session() as db:
            trace = _poll_sandbox_plays(db, [])
        fetch_mock.assert_not_called()
        assert trace["skipped"] == "no_active_sessions"
