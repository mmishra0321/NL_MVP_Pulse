"""Wet-run smoke test.

Runs a real (non-dry) detection pass, then queries the DB + /users
endpoint to prove:
  * Aanya + Karthik got 8 snapshots + 8 scores + 1 Nudge each
  * Riya has 0 snapshots, 0 scores, 0 Nudges (skipped by eligibility)
  * GET /users returns all 3 with eligibility metadata

Run:
    cd 02-mvp/backend
    python scripts/_smoke_wet.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db import db_session, init_db
from app.models import Nudge, StuckScore, WeeklySnapshot
from app.routes.dashboard import list_users
from app.routes.jobs import run_weekly_detection


def main() -> int:
    init_db()
    print(">>> Running POST /jobs/run-detection (wet, mock mode)...")
    result = run_weekly_detection(dry_run=False, trigger_source="smoke_wet")

    print(f"    users_processed: {result['users_processed']}")
    print(f"    users_skipped:   {result['users_skipped']}")
    print(f"    nudges_fired:    {result['nudges_fired']}")
    print()

    print(">>> DB row counts per user:")
    ok_db = True
    with db_session() as db:
        for uid, expect_snaps, expect_nudges in (
            ("demo-aanya-002",   8, 1),
            ("demo-karthik-001", 8, 1),
            ("demo-riya-003",    0, 0),
        ):
            snaps  = db.query(WeeklySnapshot).filter(WeeklySnapshot.user_id == uid).count()
            scores = db.query(StuckScore).filter(StuckScore.user_id == uid).count()
            nudges = db.query(Nudge).filter(Nudge.user_id == uid).count()
            row_ok = (snaps == expect_snaps and nudges == expect_nudges)
            ok_db = ok_db and row_ok
            tag = "OK" if row_ok else "FAIL"
            print(f"    [{tag}] {uid:20s}  snapshots={snaps} (expected {expect_snaps})  "
                  f"scores={scores}  nudges={nudges} (expected {expect_nudges})")

    print()
    print(">>> GET /users response:")
    users = list_users()
    ok_users = len(users) == 3 and \
               {u.id for u in users} == {"demo-aanya-002", "demo-karthik-001", "demo-riya-003"}
    for u in users:
        print(f"    - id={u.id!r}")
        print(f"      display_name={u.display_name!r}  plan={u.plan!r}  "
              f"tenure_months={u.tenure_months}  eligible={u.eligible_for_pulse}")
        if u.eligible_for_pulse:
            print(f"      collapsed_axis={u.collapsed_axis!r}  "
                  f"quote={(u.signature_quote or '')[:60]!r}")
        else:
            print(f"      why_ineligible={(u.why_ineligible or '')[:80]!r}...")

    print()
    ok = ok_db and ok_users
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
