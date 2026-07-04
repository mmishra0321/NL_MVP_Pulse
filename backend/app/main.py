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
from app.db import init_db
from app.routes import auth, dashboard, jobs, nudges, reset


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


@app.on_event("startup")
def _on_startup() -> None:
    log.info(
        "Reset Radar starting up | mock_mode=%s | db=%s",
        settings.mock_mode,
        settings.database_url,
    )
    init_db()


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
