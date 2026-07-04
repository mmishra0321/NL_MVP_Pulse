"""Idempotently extend synthetic_weeks.json with Riya (demo-riya-003).

- Enriches `_personas` block for the three demo users with plan/tenure/eligibility.
- Appends 4 weeks (W23..W26) of healthy, diverse listening for Riya.
- Does NOT touch Aanya's or Karthik's tracks (their trajectories are load-bearing
  for the stuck-detection acceptance gate).

Run me any time:

    python 02-mvp/backend/scripts/_extend_riya.py

Safe to re-run; existing Riya entries are replaced, not duplicated.
"""
from __future__ import annotations

import json
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "mock_data" / "synthetic_weeks.json"

RIYA_ID = "demo-riya-003"

RIYA_WEEKLY_TRACKS: dict[str, list[dict]] = {
    "2026-W23": [
        {"title": "Espresso",             "artist": "Sabrina Carpenter",       "genres": ["pop"],              "language": "en", "era": "2020s", "mood": "energetic",  "play_count": 2},
        {"title": "Not Strong Enough",    "artist": "boygenius",               "genres": ["indie-rock"],       "language": "en", "era": "2020s", "mood": "melancholy", "play_count": 3},
        {"title": "HUMBLE.",              "artist": "Kendrick Lamar",          "genres": ["hip-hop"],          "language": "en", "era": "2010s", "mood": "energetic",  "play_count": 1},
        {"title": "cold/mess",            "artist": "Prateek Kuhad",           "genres": ["indie-folk"],       "language": "hi", "era": "2010s", "mood": "melancholy", "play_count": 2},
        {"title": "I Wanna Be Yours",     "artist": "Arctic Monkeys",          "genres": ["indie-rock"],       "language": "en", "era": "2010s", "mood": "chill",      "play_count": 2},
        {"title": "Levitating",           "artist": "Dua Lipa",                "genres": ["pop"],              "language": "en", "era": "2020s", "mood": "energetic",  "play_count": 1},
    ],
    "2026-W24": [
        {"title": "Feather",              "artist": "Sabrina Carpenter",       "genres": ["pop"],              "language": "en", "era": "2020s", "mood": "energetic",  "play_count": 2},
        {"title": "Cornelia Street",      "artist": "Taylor Swift",            "genres": ["pop"],              "language": "en", "era": "2010s", "mood": "melancholy", "play_count": 3},
        {"title": "Redbone",              "artist": "Childish Gambino",        "genres": ["r-and-b"],          "language": "en", "era": "2010s", "mood": "chill",      "play_count": 2},
        {"title": "Chaandaniya",          "artist": "Prateek Kuhad",           "genres": ["indie-folk"],       "language": "hi", "era": "2010s", "mood": "chill",      "play_count": 1},
        {"title": "Water",                "artist": "Tyla",                    "genres": ["afrobeats"],        "language": "en", "era": "2020s", "mood": "energetic",  "play_count": 2},
        {"title": "Sunflower",            "artist": "Post Malone, Swae Lee",   "genres": ["pop", "hip-hop"],   "language": "en", "era": "2010s", "mood": "chill",      "play_count": 1},
        {"title": "No Role Modelz",       "artist": "J. Cole",                 "genres": ["hip-hop"],          "language": "en", "era": "2010s", "mood": "energetic",  "play_count": 1},
    ],
    "2026-W25": [
        {"title": "vampire",              "artist": "Olivia Rodrigo",          "genres": ["pop"],              "language": "en", "era": "2020s", "mood": "melancholy", "play_count": 2},
        {"title": "Kesariya",             "artist": "Arijit Singh",            "genres": ["hindi-film-pop"],   "language": "hi", "era": "2020s", "mood": "chill",      "play_count": 2},
        {"title": "Sober",                "artist": "Lorde",                   "genres": ["pop"],              "language": "en", "era": "2010s", "mood": "melancholy", "play_count": 1},
        {"title": "Softcore",             "artist": "The Neighbourhood",       "genres": ["indie-pop"],        "language": "en", "era": "2010s", "mood": "chill",      "play_count": 2},
        {"title": "Kids",                 "artist": "MGMT",                    "genres": ["indie-electronic"], "language": "en", "era": "2000s", "mood": "energetic",  "play_count": 1},
        {"title": "Motion Sickness",      "artist": "Phoebe Bridgers",         "genres": ["indie-folk"],       "language": "en", "era": "2010s", "mood": "melancholy", "play_count": 2},
    ],
    "2026-W26": [
        {"title": "Please Please Please", "artist": "Sabrina Carpenter",       "genres": ["pop"],              "language": "en", "era": "2020s", "mood": "energetic",  "play_count": 2},
        {"title": "Praying",              "artist": "Kesha",                   "genres": ["pop"],              "language": "en", "era": "2010s", "mood": "melancholy", "play_count": 1},
        {"title": "Lofi Chill",           "artist": "Mac Ayres",               "genres": ["lofi"],             "language": "en", "era": "2020s", "mood": "chill",      "play_count": 3},
        {"title": "Sadi Gali",            "artist": "Nooran Sisters",          "genres": ["bhangra"],          "language": "pa", "era": "2010s", "mood": "energetic",  "play_count": 1},
        {"title": "Numb",                 "artist": "Linkin Park",             "genres": ["nu-metal"],         "language": "en", "era": "2000s", "mood": "energetic",  "play_count": 1},
        {"title": "Alag Aasmaan",         "artist": "Anuv Jain",               "genres": ["indie-folk"],       "language": "hi", "era": "2020s", "mood": "melancholy", "play_count": 2},
        {"title": "What Was I Made For?", "artist": "Billie Eilish",           "genres": ["pop"],              "language": "en", "era": "2020s", "mood": "melancholy", "play_count": 2},
        {"title": "Do I Wanna Know?",     "artist": "Arctic Monkeys",          "genres": ["indie-rock"],       "language": "en", "era": "2010s", "mood": "chill",      "play_count": 1},
    ],
}


def main() -> None:
    d = json.loads(FIXTURE.read_text(encoding="utf-8"))

    personas = d.setdefault("_personas", {})

    personas["demo-karthik-001"] = {
        "display_name": "Karthik (demo · multilingual)",
        "stuck_axis": "language",
        "trajectory_summary": "balanced en/te/hi -> 91% Telugu by W26",
        "plan": "premium",
        "plan_tier": "individual",
        "tenure_months": 60,
        "eligible_for_pulse": True,
    }
    personas["demo-aanya-002"] = {
        "display_name": "Aanya (demo · English indie)",
        "stuck_axis": "genre",
        "trajectory_summary": "5-subgenre mix -> 85% dream-pop by W26",
        "plan": "premium",
        "plan_tier": "individual",
        "tenure_months": 36,
        "eligible_for_pulse": True,
    }
    personas[RIYA_ID] = {
        "display_name": "Riya (demo · free-tier control)",
        "stuck_axis": None,
        "trajectory_summary": "new user, 2 months tenure, diverse healthy listening across 4 weeks",
        "plan": "free",
        "plan_tier": "free",
        "tenure_months": 2,
        "eligible_for_pulse": False,
    }

    weeks = d["weeks"]

    for iso_week, tracks in RIYA_WEEKLY_TRACKS.items():
        week_list = weeks.setdefault(iso_week, [])

        week_list[:] = [e for e in week_list if e.get("user_id") != RIYA_ID]

        emitted_tracks = []
        for idx, t in enumerate(tracks):
            emitted_tracks.append({
                "spotify_track_id": f"mock-{RIYA_ID}-{iso_week.lower().replace('-', '')}-t{idx:03d}",
                "title":            t["title"],
                "artist":           t["artist"],
                "genres":           t["genres"],
                "language":         t["language"],
                "era":              t["era"],
                "mood":             t["mood"],
                "play_count":       t["play_count"],
            })

        week_list.append({
            "iso_week": iso_week,
            "user_id":  RIYA_ID,
            "tracks":   emitted_tracks,
        })

    FIXTURE.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"OK  wrote {FIXTURE}")
    print(f"    _personas:  {list(personas.keys())}")
    week_counts = {w: sum(1 for e in weeks[w] if e['user_id'] == RIYA_ID) for w in sorted(weeks)}
    riya_track_counts = {w: sum(len(e['tracks']) for e in weeks[w] if e['user_id'] == RIYA_ID) for w in sorted(weeks)}
    print(f"    riya per-week entries:  {week_counts}")
    print(f"    riya per-week tracks:   {riya_track_counts}")


if __name__ == "__main__":
    main()
