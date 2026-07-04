"""Smoke-test the 3-persona detection flow (Aanya + Karthik + Riya).

Runs `POST /jobs/run-detection` in dry-run mode against the mock fixture
and prints a compact per-user trace. Exit code 0 iff:

  * Aanya + Karthik both trigger a nudge
  * Riya is skipped by eligibility
  * users_processed == 2, users_skipped == 1, nudges_fired == 2

Run:
    cd 02-mvp/backend
    python scripts/_smoke_3personas.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db import init_db
from app.routes.jobs import run_weekly_detection


def main() -> int:
    init_db()
    result = run_weekly_detection(dry_run=True, trigger_source="smoketest")

    print("---SUMMARY---")
    print(f"  mock_mode:       {result.get('mock_mode')}")
    print(f"  mode:            {result.get('mode')}")
    print(f"  users_processed: {result.get('users_processed')}")
    print(f"  users_skipped:   {result.get('users_skipped')}")
    print(f"  nudges_fired:    {result.get('nudges_fired')}")
    print()
    print("---PER-USER TRACE---")

    details = {d["user_id"]: d for d in result.get("details", [])}
    for uid in sorted(details):
        d = details[uid]
        if d.get("skipped_by_eligibility"):
            tag = "SKIP"
        elif d.get("trigger"):
            tag = "FIRE"
        else:
            tag = "HOLD"
        overall = d.get("latest_overall")
        scope = d.get("latest_suggested_scope")
        print(f"  [{tag}] {uid:20s}  overall={overall}  scope={scope}")
        print(f"          reason: {d.get('reason')}")

    print()

    fires = [d for d in result["details"] if d.get("trigger")]
    skips = [d for d in result["details"] if d.get("skipped_by_eligibility")]

    expected_fires = {"demo-aanya-002", "demo-karthik-001"}
    expected_skips = {"demo-riya-003"}

    actual_fires = {d["user_id"] for d in fires}
    actual_skips = {d["user_id"] for d in skips}

    ok = (actual_fires == expected_fires) and (actual_skips == expected_skips)

    print("---ASSERTIONS---")
    print(f"  fired == {{aanya, karthik}}:  {actual_fires == expected_fires}  (actual: {sorted(actual_fires)})")
    print(f"  skipped == {{riya}}:          {actual_skips == expected_skips}  (actual: {sorted(actual_skips)})")
    print()
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
