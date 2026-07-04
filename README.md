# 02-mvp · Pulse

> **Pulse** is a mobile-first, sandboxed reset that lives inside
> the Spotify UI. When our detection engine sees a Premium
> listener's diversity collapse along one axis (genre / language
> / era / mood) for three consecutive weeks, we surface a nudge
> card in the Spotify home feed. Accepting the nudge creates a
> **20-track sandbox playlist** labelled `SANDBOX · Not saved to
> library yet`, plays inside a regular Spotify player carrying a
> persistent green **Pulse Sandbox** ribbon with a
> `X days left · Keep or Revert` CTA. On day 10 the user sees a
> measured outcome (tracks played, repeat plays, before → after
> diversity) and decides **Keep** (save + follow) or **Revert**
> (delete sandbox, zero profile impact).
>
> Read in this order:
>
> 1. [`doc/problemStatement.md`](doc/problemStatement.md) — **why** this MVP exists
> 2. [`doc/implementationPlan.md`](doc/implementationPlan.md) — **which phases** and **what to type** (merged strategic + tactical plan, with per-task tables)
> 3. [`doc/architecture.md`](doc/architecture.md) — **how it's built** (v2, mobile-first)
> 4. [`doc/mockups/`](doc/mockups/) — the four HTML mockups (design source of truth)

---

## Status (2026-07-04, post-rebrand)

We are at the **end of P0**: docs rewritten, mockups saved,
folder pruned. The React frontend still renders the old
Reset-Radar desktop UI — that gets rebuilt mobile-first across
P1 → P4. The FastAPI backend stays largely as-is; P5 adds the
sandbox-lifecycle endpoints (per-track remove, outcome).

| Phase | Status |
|---|---|
| **P0** Rebrand + docs + prune | ✅ this session |
| **P0.5** Mock data + eligibility gate (Aanya + Karthik + **Riya control**) | ✅ this session |
| **P1** Mobile shell + Home nudge (screen 1) | pending |
| **P2** Sandbox Playlist (screen 2) | pending |
| **P3** Now Playing (screen 3) | pending |
| **P4** Keep or Revert outcome (screen 4) | pending |
| **P5** Sandbox lifecycle endpoints (backend) | pending |
| **P6** Public deployment + deck link-in | pending |

Full details in [`doc/implementationPlan.md`](doc/implementationPlan.md).

---

## Folder structure

```
02-mvp/
├── backend/                              # FastAPI + SQLite + SQLAlchemy
│   ├── app/
│   │   ├── main.py                       # FastAPI entry point + CORS + init_db()
│   │   ├── config.py                     # pydantic-settings (.env reader)
│   │   ├── db.py                         # SQLAlchemy engine + Base + session factory
│   │   ├── models.py                     # 8 ORM tables + Pydantic wire shapes
│   │   ├── llm_client.py                 # Throttled Groq wrapper
│   │   ├── spotify_client.py             # Mock-first Spotify wrapper
│   │   ├── detection.py                  # Stuck-detection math (jaccard + entropy)
│   │   ├── reset_engine.py               # Candidate generation + Groq rank + "why"
│   │   └── routes/
│   │       ├── nudges.py                 # /nudges/latest, /nudges/{id}/respond
│   │       ├── reset.py                  # /reset-sessions/* (create, get, DELETE track, outcome, decide)
│   │       ├── jobs.py                   # /jobs/run-detection, /jobs/runs/*
│   │       ├── auth.py                   # OAuth Authorization Code + PKCE (real mode)
│   │       └── dashboard.py              # /scores/history (feeds /engine only)
│   ├── mock_data/
│   │   ├── synthetic_weeks.json          # 8-week fixture for 2 personas
│   │   ├── mock_candidates.json          # 60-80 candidates per (scope, persona)
│   │   └── mock_outcomes.json            # Screen-4 numbers per persona (P5)
│   ├── tests/                            # pytest, one file per route module
│   ├── requirements.txt
│   └── .env.example
├── frontend/                             # React + Vite (mobile-first)
│   ├── src/
│   │   ├── main.jsx                      # ReactDOM entry
│   │   ├── App.jsx                       # Router shell
│   │   ├── theme.js                      # Spotify palette + Pulse accent tokens
│   │   ├── styles.css                    # Global reset + phone-frame tokens
│   │   ├── api/client.js                 # fetch wrapper (VITE_API_BASE + credentials)
│   │   ├── hooks/
│   │   │   └── usePersona.js             # ?viewingAs=aanya|karthik
│   │   ├── components/
│   │   │   ├── PhoneFrame.jsx            # 375×812 shell used by every Pulse route
│   │   │   ├── SpotifyTopBar.jsx
│   │   │   ├── SpotifyBottomNav.jsx
│   │   │   ├── PulseNudgeCard.jsx        # The feed card on screen 1
│   │   │   ├── TrackRow.jsx              # Playlist row with kebab
│   │   │   ├── WhyThisChip.jsx           # Green "Why this?" chip on screen 2
│   │   │   ├── TrackActionSheet.jsx      # Bottom sheet with "Remove from this reset"
│   │   │   ├── PulseSandboxRibbon.jsx    # Persistent green ribbon (screens 3 + 4)
│   │   │   ├── DiversityScoreCard.jsx    # Before/after bars on screen 4
│   │   │   ├── OutcomeSummaryCard.jsx    # 3-stat card on screen 4
│   │   │   ├── CoachMark.jsx
│   │   │   ├── LastRunCard.jsx           # Engine-diagnostics only (/engine)
│   │   │   └── StuckScoreCard.jsx        # Engine-diagnostics only (/engine)
│   │   └── pages/
│   │       ├── HomePage.jsx              # /   — screen 1
│   │       ├── SandboxPlaylistPage.jsx   # /sandbox/:sessionId — screen 2
│   │       ├── NowPlayingPage.jsx        # /sandbox/:sessionId/now-playing/:trackId — screen 3
│   │       ├── OutcomePage.jsx           # /sandbox/:sessionId/outcome — screen 4
│   │       ├── Dashboard.jsx             # /engine — engine diagnostics (chart + last-run card)
│   │       └── RunsPage.jsx              # /engine/runs — per-run 4-step trace
│   ├── package.json
│   └── vite.config.js
├── .github/
│   └── workflows/
│       └── weekly-detection.yml          # Mondays 09:00 UTC cron
├── doc/
│   ├── problemStatement.md               # Why Pulse exists (refreshed P0)
│   ├── implementationPlan.md             # Phase plan P0 → P6 + per-task tables (merged strategic + tactical)
│   ├── architecture.md                   # Full architecture, v2 mobile-first
│   ├── DEMO_SCRIPT.md                    # ≤ 90-second live-demo walkthrough
│   └── mockups/                          # Design source of truth
│       ├── README.md
│       ├── screen2-sandbox-playlist.html
│       ├── screen3-now-playing.html
│       └── screen4-keep-or-revert.html
├── .gitignore
└── README.md                             # this file
```

The old `legacy-sonar/`, `screenshots/`, all `*.log` files,
`.pytest_cache/`, `frontend/dist/`, and the stale
`reset_radar.db` were removed at the end of P0. See
[`doc/implementationPlan.md`](doc/implementationPlan.md) §8 (the P0 section) for the full retirement table.

---

## How to run (local dev)

### Backend

```powershell
# From C:\Users\tiwari.mahima\Mayank\02-mvp
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cd backend
python -c "from app.config import settings; print('mock_mode =', settings.mock_mode)"
uvicorn app.main:app --reload --port 8000
# then visit http://127.0.0.1:8000/health
```

### Frontend

```powershell
# From C:\Users\tiwari.mahima\Mayank\02-mvp\frontend
npm install
npm run dev
# then visit http://localhost:5173 on a phone-sized viewport
# (DevTools Device Toolbar → iPhone 13 Pro is a good default)
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`,
so both processes need to be running for end-to-end calls.

---

## Mock mode (`MOCK_MODE=true`) — the default for the deck demo

Pulse's live demo runs entirely against synthetic data. There is
no Spotify call in the mock path. This is intentional:

- Spotify's Development Mode caps allow-listed users at 25.
- The deck reviewer should be able to open the public URL without
  needing to be allow-listed.
- Mock mode lets the detection math + LLM ranking + the React
  flow be reviewed independently of Spotify availability.

**Three** personas are pre-seeded (see
[`backend/mock_data/mock_users.json`](backend/mock_data/mock_users.json)):

| Persona | Plan | Tenure | Collapsed axis | Pulse behaviour |
|---|---|---|---|---|
| **Aanya** — Bollywood/Hindi-Pop-heavy English-indie listener | Premium Individual | 36 mo | genre | Nudge fires. `suggested_scope=genre`, screen 4 = genre 22% → 54%. |
| **Karthik** — Telugu + Hindi + English mix | Premium Individual | 60 mo | language | Nudge fires. `suggested_scope=language`, screen 4 = language 19% → 50% (matches mockup). |
| **Riya** — the **control** case | **Free** | **2 mo** | *(none — healthy diverse listening)* | **No nudge, ever.** Backend gates on `eligible_for_pulse=false`; her `/engine` trace records `skipped: not_eligible`. Frontend home shows Spotify mobile without a Pulse card. |

Riya proves the negative — Pulse does not offer itself to users
outside the target segment. See
[`doc/architecture.md`](doc/architecture.md) §10.1 for the
eligibility gate details.

To switch to real Spotify, set `MOCK_MODE=false` in `backend/.env`
and fill in Spotify credentials. See [`doc/architecture.md`](doc/architecture.md)
§10 for the full mock-mode contract.

---

## Real-mode setup (only if you want to leave mock mode)

Follow these steps to run against a real Spotify Premium account.

### 1. Create a Spotify Developer app

1. Visit <https://developer.spotify.com/dashboard> and sign in.
2. **Create app** → name it `Pulse (local)`.
3. Settings → Edit:
   - **Redirect URIs**: add `http://127.0.0.1:8000/auth/callback`
   - **Which API/SDKs**: tick **Web API**
   - Save.
4. Copy the **Client ID** (Pulse uses PKCE, so no secret needed).

### 2. Allow-list yourself

Development Mode caps at 25 users. Under the Spotify app's
**User Management** tab, add the email associated with the
Premium account you'll use.

### 3. Fill in `backend/.env`

```dotenv
GROQ_API_KEY=...
MOCK_MODE=false
SPOTIFY_CLIENT_ID=<from step 1.4>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
SESSION_SECRET_KEY=<python -c "import secrets;print(secrets.token_urlsafe(48))">
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

### 4. Walk the flow

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
# In another shell:
start http://127.0.0.1:8000/auth/login
# Spotify consent → callback → redirected to localhost:5173
curl http://127.0.0.1:8000/auth/me
# Should show authenticated: true + your display name.
curl -X POST http://127.0.0.1:8000/jobs/run-detection
# Fetches your top tracks + recently-played + saved library,
# classifies with Groq, appends one WeeklySnapshot row,
# runs detection.
```

> First-time real-mode run creates exactly one weekly snapshot,
> so the trigger rule (3-week streak above threshold) will
> deliberately stay quiet. That's the expected behaviour — build
> history by re-running weekly, or stick with mock mode for the
> demo.

---

## `/engine` — internal diagnostics

Everything under `/engine` is **not part of the Pulse UX** but
kept for demo Q&A:

- **`/engine`** — 8-week stuck-score chart, per-dimension grid,
  mode switcher, `LastRunCard`
- **`/engine/runs`** — per-run 4-step trace (LOAD → FORMULAS →
  TRIGGER → NUDGE?) for every detection call

Neither route is linked from the mobile home. See
[`doc/architecture.md`](doc/architecture.md) §11.

---

## Weekly GitHub Action

`.github/workflows/weekly-detection.yml` fires Mondays 09:00 UTC
against `POST $RESET_RADAR_API_URL/jobs/run-detection`. Set two
repo secrets when you deploy:

- `RESET_RADAR_API_URL` — e.g. `https://pulse-mvp.onrender.com`
- `RESET_RADAR_API_TOKEN` — optional; empty unless
  `JOBS_API_TOKEN` on the backend is set to the same value

See [`doc/architecture.md`](doc/architecture.md) §9 for what runs
each Monday.

---

## The honest gap

Pulse's sandbox promise is **UX-level**, not backend-enforced —
Spotify's public API does not let a third party exclude
listening from the user's model. Pulse compensates with
reversibility (Revert deletes the playlist and follows / saves
nothing). The full statement is in
[`doc/architecture.md`](doc/architecture.md) §12 and it's called
out on deck slide 9 (frames) and slide 11 (future scope).

---

## Where the other docs live

- **Project-wide problem statement:** [`../masterProblemStatement.md`](../masterProblemStatement.md)
- **Project-wide architecture:** [`../masterArchitecture.md`](../masterArchitecture.md)
- **User research:** [`../03-research-and-deck/`](../03-research-and-deck/)
- **AI Review Engine (P1):** [`../01-ai-review-engine/`](../01-ai-review-engine/)
