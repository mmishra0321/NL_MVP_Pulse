"""FastAPI entry point for the Reset Radar backend.

Run locally:
    cd 02-mvp/backend
    uvicorn app.main:app --reload --port 8000

Real route bodies land progressively in R1-R5. R0 ships the app shell
with health endpoint and 501-stubbed routes wired through the router.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import db_session, init_db
from app.models import WeeklySnapshot
from app.routes import auth, dashboard, jobs, nudges, reset
from app.routes.jobs import run_weekly_detection


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
log = logging.getLogger("pulse.main")


app = FastAPI(
    title="Pulse",
    description=(
        "System-initiated stuck-detection + scoped, reversible reset for "
        "Spotify Premium users. See 02-mvp/doc/architecture.md."
    ),
    version="0.0.1",
)


# --- CORS ---
#
# Local dev is always trusted. Extra prod origins come from the
# CORS_ALLOW_ORIGINS env var (comma-separated) or default to the value
# of FRONTEND_ORIGIN. Vercel preview URLs are covered by an origin
# regex so we don't have to redeploy the backend for every branch.
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    settings.frontend_origin,
]
_extra_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https://.*\.(vercel\.app|netlify\.app|pages\.dev)$",
    allow_origins=list({*_default_origins, *_extra_origins}),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Routers ---
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(nudges.router, prefix="/nudges", tags=["nudges"])
app.include_router(reset.router, prefix="/reset", tags=["reset"])
app.include_router(dashboard.router, tags=["dashboard"])           # /users and /scores/history at the root


def _auto_seed_mock_demo() -> None:
    """Bootstrap the demo DB from the synthetic fixture on first boot.

    Motivation: Railway's filesystem is ephemeral, so every redeploy
    resets `reset_radar.db` to zero rows. Without this hook the SPA
    lands on a healthy backend that has no snapshots, no scores, and
    no nudges, and the persona picker just falls through to a blank
    home. This runs the same code path as `POST /jobs/run-detection`
    against `mock_data/synthetic_weeks.json`, but only when:

      * MOCK_MODE=true (the demo default), AND
      * WeeklySnapshot is currently empty (so we don't clobber a real
        run mid-flight if someone hits `/jobs/run-detection` first).

    Any failure is logged and swallowed. A silent seed miss is better
    than blocking uvicorn from binding to `$PORT` on Railway.
    """
    if not settings.mock_mode:
        return
    try:
        with db_session() as db:
            if db.query(WeeklySnapshot).first() is not None:
                log.info("auto-seed: DB already has snapshots, skipping.")
                return
    except Exception as exc:                                          # noqa: BLE001
        log.warning("auto-seed: could not inspect DB, skipping (%s).", exc)
        return

    try:
        summary = run_weekly_detection(dry_run=False,
                                       trigger_source="startup_seed")
        log.info(
            "auto-seed: seeded mock demo | users=%s snapshots=%s scores=%s nudges=%s",
            summary.get("users_processed"),
            summary.get("snapshots_created"),
            summary.get("scores_computed"),
            summary.get("nudges_fired"),
        )
    except Exception as exc:                                          # noqa: BLE001
        log.error("auto-seed: run_weekly_detection failed (%s).", exc)


@app.on_event("startup")
def _on_startup() -> None:
    log.info(
        "Pulse starting up | mock_mode=%s | db=%s",
        settings.mock_mode,
        settings.database_url,
    )
    init_db()
    _auto_seed_mock_demo()


@app.get("/health", tags=["meta"])
def health() -> dict[str, str | bool]:
    """Liveness probe. Returns OK + a few useful environment flags."""
    return {
        "status": "ok",
        "mock_mode": settings.mock_mode,
        "reasoner_model": settings.groq_model_reasoner,
        "fast_model": settings.groq_model_fast,
    }


__all__ = ["app"]
