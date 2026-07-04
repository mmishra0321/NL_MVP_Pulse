# 02-mvp · Pulse

[![SPA](https://img.shields.io/badge/react%20SPA-live-1DB954?logo=vercel&logoColor=white&labelColor=191414)](https://nl-mvp-pulse.vercel.app/)
[![API](https://img.shields.io/badge/API-live-1DB954?logo=fastapi&logoColor=white&labelColor=191414)](https://nlmvppulse-production.up.railway.app/health)
[![Weekly cron](https://github.com/mmishra0321/NL_MVP_Pulse/actions/workflows/weekly-detection.yml/badge.svg)](https://github.com/mmishra0321/NL_MVP_Pulse/actions/workflows/weekly-detection.yml)

> **Pulse** is a mobile-first, sandboxed music-reset feature designed
> to live inside the Spotify mobile UI. When our detection engine
> sees a Premium listener's diversity collapse along one axis
> (genre, language, era, or mood) for three consecutive weeks, we
> surface a nudge card in the Spotify home feed. Accepting the
> nudge creates a 20-track sandbox playlist labelled
> `SANDBOX · Not saved to library yet`, played inside a regular
> Spotify player carrying a persistent green Pulse Sandbox ribbon
> with a `X days left · Keep or Revert` CTA. On day 10 the user
> sees a measured outcome (tracks played, repeat plays, before vs.
> after diversity) and decides **Keep** (save + follow) or
> **Revert** (delete sandbox, zero profile impact).

---

## Table of contents

1. [Live surfaces](#1-live-surfaces)
2. [The problem Pulse solves](#2-the-problem-pulse-solves)
3. [What Pulse does (60-second walk-through)](#3-what-pulse-does-60-second-walk-through)
4. [End-to-end data flow](#4-end-to-end-data-flow)
5. [Tech stack](#5-tech-stack)
6. [The detection engine (the math)](#6-the-detection-engine-the-math)
7. [LLM usage (Groq)](#7-llm-usage-groq)
8. [Database schema](#8-database-schema)
9. [API surface](#9-api-surface)
10. [The three personas and the eligibility gate](#10-the-three-personas-and-the-eligibility-gate)
11. [Frontend state model](#11-frontend-state-model)
12. [Session-local design (why refresh resets everything)](#12-session-local-design-why-refresh-resets-everything)
13. [Status: what's shipped](#13-status-whats-shipped)
14. [Folder structure](#14-folder-structure)
15. [How to run (local dev)](#15-how-to-run-local-dev)
16. [Deploy: how the live surfaces are wired](#16-deploy-how-the-live-surfaces-are-wired)
17. [Weekly GitHub Action](#17-weekly-github-action)
18. [Real-mode setup (Spotify OAuth)](#18-real-mode-setup-spotify-oauth)
19. [Testing](#19-testing)
20. [The honest gap: what Pulse doesn't do](#20-the-honest-gap-what-pulse-doesnt-do)
21. [Where the other docs live](#21-where-the-other-docs-live)

---

## 1. Live surfaces

All three surfaces auto-redeploy on every push to `main`.

| Surface | URL | Host | Purpose |
|---|---|---|---|
| **React SPA** (primary) | [`nl-mvp-pulse.vercel.app`](https://nl-mvp-pulse.vercel.app/) | Vercel | Full Pulse mobile flow: persona picker, nudge, sandbox, now-playing, keep-or-revert |
| **FastAPI backend** | [`/health`](https://nlmvppulse-production.up.railway.app/health), [`/users`](https://nlmvppulse-production.up.railway.app/users) | Railway | Serves personas, runs stuck-detection, hosts the reset lifecycle API |
| **Weekly cron** | [GitHub Actions](https://github.com/mmishra0321/NL_MVP_Pulse/actions/workflows/weekly-detection.yml) | GitHub Actions | Mondays 09:00 UTC (14:30 IST). Appends one weekly snapshot per persona and re-runs detection |

**Open the SPA on a phone-sized viewport** (or DevTools Device Toolbar, iPhone 13 Pro is a good default) for the intended mobile experience. The demo runs entirely against synthetic data (`MOCK_MODE=true`) so no Spotify login is required. Every page refresh resets the demo cleanly by design (see [§12](#12-session-local-design-why-refresh-resets-everything)).

---

## 2. The problem Pulse solves

Spotify's own recommendation infrastructure is world-class, yet a repeatable pattern shows up in the app-store reviews we mined in [`01-ai-review-engine`](../01-ai-review-engine/) and in five 45-minute user interviews we ran ourselves:

> **"Every like feels like a vote that makes my world smaller."**

Concretely, three failure modes recur (see [`doc/problemStatement.md`](doc/problemStatement.md) §2 for the evidence trail):

1. **Genre collapse.** A listener who liked English indie is now served ~85% dream-pop. Neighbouring genres they used to enjoy (indie folk, alt-rock, shoegaze) fade from Discover Weekly.
2. **Language collapse.** A multilingual listener whose Telugu playlists get the most plays is now served ~91% Telugu, even though their Hindi and English listens were healthy just months ago.
3. **Era / mood collapse.** A late-night listener is served ~90% low-BPM ambient regardless of context, because "chill" became the strongest signal.

The listener notices the shrinkage but has no clean way to reset without either creating a fresh Spotify account or accepting a permanent hit to their existing recommendations. **Pulse fills that gap** by making the reset scoped (one axis at a time), reversible (10-day trial with a hard Keep-or-Revert choice), and system-initiated (Pulse detects the collapse and offers the reset. The user doesn't have to know it's a problem to solve).

---

## 3. What Pulse does (60-second walk-through)

The demo is a single-user, three-persona mobile flow. Walk it end-to-end at [nl-mvp-pulse.vercel.app](https://nl-mvp-pulse.vercel.app/):

### Screen 0: Persona picker
A full-screen modal with the Spotify wordmark and three cards:
* **Aanya** (Premium, genre-stuck): a nudge fires.
* **Karthik** (Premium, language-stuck): a nudge fires.
* **Riya** (Free, 2 months tenure): no nudge, ever. Riya is the control case that proves the eligibility gate works.

### Screen 1: Home (nudge feed)
Spotify-style home with the brand bar at the top and the bottom nav at the bottom. If the selected persona is eligible and stuck, a green `PULSE · WEEKLY CHECK-IN` card appears above "Made For You" with a two-line "why now" line ("Your genre mix has shrunk to 22% variety across 3 weeks") and a **Try a reset** button.

### Screen 2: Sandbox playlist
Tapping **Try a reset** opens a Spotify-style playlist page pre-populated with a 20-track sandbox. Details:
* Header shows the persona-specific title ("A wider English-indie week", "A Hindi week back in") and a persistent green ribbon: `SANDBOX · Not saved to library yet · X days left`.
* The tracklist renders 5 tracks by default with a "Show all" toggle (keeps the bottom nav in view).
* Each row has a kebab menu with **Remove from this reset** and **Why this?** (the LLM's per-track explanation).
* A subtle **Save to library** chip and a right-sized play button live in the header. Tapping the first row's kebab pulses briefly to hint at discoverability.

### Screen 3: Now playing
Tapping a track opens a standard Spotify player. The green Pulse Sandbox ribbon is still visible at the top. The kebab menu carries **Save to library** and **Remove from this reset** (moved from a top button to keep the visual noise low). A left-chevron back button takes you back to Screen 2.

### Screen 4: Keep or Revert (outcome)
On day 10 (or when the user opens the ribbon's Keep-or-Revert CTA), we show a measured outcome:
* **Diversity bars**: before vs. after on the collapsed axis (e.g. genre 22% -> 54%).
* **Three numbers**: tracks played, repeat plays, unique artists surfaced.
* Two buttons: **Keep** (save the playlist, follow the sandbox artists) or **Revert** (delete the sandbox, zero profile impact).

### The follow-up flow (P5.5)
After **Save to library** (from Screen 2 or 3), we route to a confirmation screen ("Added to your library", "Back to home"). Home now suppresses the "Try a reset" nudge and shows a **Check your library** follow-up, plus a `SavedSandboxCard` on the Library tab. Choosing **Keep** promotes it to a persistent `KeptInLibraryNudge` ("Playlist added to your library. Pulse will surface a fresh nudge on your next Monday check-in.").

---

## 4. End-to-end data flow

```
                        Persona picker (React modal)
                                    │
                                    ▼
             GET /users  ──►  FastAPI  ──►  SQLite (User table)
                                    │
                    ┌───────────────┴────────────────┐
                    │                                │
                    ▼                                ▼
           GET /nudges/latest              GET /scores/history (for /engine)
                    │
                    ▼
            HomePage (Screen 1)  ─── if eligible, render PulseNudgeCard
                    │
                    ▼   [user taps "Try a reset"]
        POST /reset/sessions  ──►  reset_engine.py
                                       │
                                       ├── spotify_client.search_candidates()
                                       │       (mock: reads mock_candidates.json
                                       │        real: hits Spotify Web API)
                                       │
                                       ├── llm_client.rank_and_explain()
                                       │       (Groq Llama 3.3 70B; falls back
                                       │        to _mock_rank_and_explain on
                                       │        MOCK_MODE=true daily-limit hit)
                                       │
                                       └── persists ResetSession + ResetTracks
                    │
                    ▼
      SandboxPlaylistPage (Screen 2)  ─── DELETE /reset/sessions/:id/tracks/:tid
                    │                       (soft-delete via removed_at column)
                    ▼
        NowPlayingPage (Screen 3)  ─── POST /reset/sessions/:id/play
                                        (append SandboxPlayEvent row)
                    │
                    ▼
      GET /reset/sessions/:id/outcome  ─── reset_engine.compute_outcome()
                                            projected + measured after-scores
                    │
                    ▼
       OutcomePage (Screen 4)  ─── POST /reset/sessions/:id/decide
                                     { decision: "keep" | "revert" }
                    │
                    ▼
         Frontend session state (React Context)
         SavedSandboxContext keeps { savedSandbox, keptPlaylist }
         entirely in memory. Every page refresh wipes it clean
         so the deck reviewer always starts from a fresh state.
```

Cron path (independent of any user session):

```
Mondays 09:00 UTC
       │
       ▼
GitHub Actions: workflows/weekly-detection.yml
       │
       ▼
POST $PULSE_API_URL/jobs/run-detection?dry_run=false
       │
       ▼
routes/jobs.run_detection()
       │
       ├── for each user:
       │     load last N=8 weekly snapshots
       │     detection.compute_stuck_score()
       │     if 3-week streak above threshold AND eligible:
       │         create Nudge row (status=pending)
       │
       └── persist JobRun row (for /engine/runs trace)
```

---

## 5. Tech stack

### 5.1 Backend (FastAPI, Python 3.11)

| Layer | Library | Version | Why |
|---|---|---|---|
| Web framework | `fastapi` | 0.115+ | Typed request/response, OpenAPI out of the box |
| ASGI server | `uvicorn[standard]` | 0.32+ | Production ASGI on Railway |
| Validation | `pydantic` + `pydantic-settings` | 2.7+ / 2.5+ | Wire shapes + `.env` reader |
| ORM | `sqlalchemy` | 2.0+ | Typed queries, `Session` scoping |
| Database | SQLite | (stdlib) | Zero-ops, ephemeral on Railway by design |
| LLM client | `groq` | 0.11+ | Groq Cloud Python SDK |
| Retry | `tenacity` | 8.2+ | Exponential backoff, custom retry predicate |
| Spotify SDK | `spotipy` | 2.24+ | Wrapped by `spotify_client.py` for both mock + real |
| HTTP | `httpx`, `requests` | 0.27+ / 2.32+ | Health-check probes, OAuth callback |
| Session cookies | `itsdangerous` | 2.2+ | Signed cookie for `rr_session` (R4 OAuth) |
| Stats | `scipy` | 1.13+ | Shannon entropy in the detection engine |
| Tests | `pytest`, `pytest-asyncio` | 8.2+ / 0.23+ | 11 test files, one per surface |

### 5.2 Frontend (React 18 + Vite 5)

| Layer | Library | Version | Why |
|---|---|---|---|
| UI framework | `react`, `react-dom` | 18.3.1 | Hooks-based, session-local context |
| Router | `react-router-dom` | 6.26+ | Client-side routing across four screens + Library |
| Bundler | `vite` | 5.4+ | Fast HMR, small prod bundle, `VITE_API_BASE` env var |
| Charts | `recharts` | 2.12+ | Diversity bars on Screen 4 |
| React plugin | `@vitejs/plugin-react` | 4.3+ | JSX transform + Fast Refresh |

**No CSS framework.** All styling is inline React `style={...}` objects using Spotify design tokens defined in [`src/theme.js`](frontend/src/theme.js). The 375x812 mobile shell is enforced by the [`PhoneFrame.jsx`](frontend/src/components/PhoneFrame.jsx) component. This keeps the bundle tiny (well under 200 KB gzipped) and makes the design lift-and-shift friendly for the deck.

### 5.3 Infrastructure

| Concern | Choice | Notes |
|---|---|---|
| Backend host | [Railway](https://railway.app) | Nixpacks builder, `Procfile` + `railway.json` at `backend/`. Free tier is enough (backend has no ML deps). |
| Frontend host | [Vercel](https://vercel.com) | Vite framework preset. `vercel.json` handles the SPA rewrite so React Router paths survive a hard refresh. |
| Weekly cron | [GitHub Actions](https://github.com/mmishra0321/NL_MVP_Pulse/actions) | Nixpacks-independent. Sends `POST /jobs/run-detection` on a Mondays 09:00 UTC schedule. |
| LLM provider | [Groq Cloud](https://console.groq.com) | Llama 3.3 70B Versatile (reasoner) + Llama 3.1 8B Instant (fast path). Fully async under the hood. |
| CI | GitHub Actions | The weekly cron doubles as a live smoke-test of the deployed API. |

---

## 6. The detection engine (the math)

Stuck-detection lives in [`backend/app/detection.py`](backend/app/detection.py). We compute a stuck-score per axis (genre, language, era, mood) for every user, every week.

### 6.1 Two ingredients per axis

For a given axis (e.g. "genre") and a given user in ISO week `W`:

**Ingredient A: Jaccard concentration across the top-K axis values.** Higher means the user's listening is concentrated on a small set of values.

```
jaccard_concentration(W) = |top_K(W)| / |unique_values(W)|
```

where `top_K` is the set of axis-values that make up >= 80% of the play-count. A user who listens to one genre 80% of the time has `jaccard_concentration = 1/N`, which is small (concentrated). A user with a flat distribution has it approach 1 (diverse).

**Ingredient B: Shannon entropy of the axis distribution.** Higher entropy means more diverse listening.

```
shannon_entropy(dist) = -Σ p_i * ln(p_i)     for p_i in normalised dist
```

Both are computed in `detection.py`:
* `def shannon_entropy(distribution)` (line 102)
* `def compute_stuck_score(user_id, iso_week, history)` (line 228)

### 6.2 The stuck-score formula

We combine the two ingredients into a single 0-to-1 score per axis. Higher = more stuck:

```
stuck_score_axis(W) = 1 - min(1, entropy_axis(W) / entropy_max)
```

where `entropy_max` is `ln(len(distribution))`, the maximum possible entropy for that number of values. This normalises the score across axes with different vocabularies (there are many more genres than there are language codes).

### 6.3 The trigger rule

A nudge fires when three conditions are all true:

| Condition | Threshold | Env var |
|---|---|---|
| Stuck-score for at least one axis above threshold | `stuck_score >= 0.6` | `STUCK_THRESHOLD` |
| For the same axis, streak of consecutive weeks above threshold | `>= 3 weeks` | `STUCK_STREAK_WEEKS` |
| Not within cool-down of a previous Pulse nudge for the same user | `>= 4 weeks since last` | `COOLDOWN_WEEKS` |

The eligibility gate is applied *before* the trigger rule (see [§10](#10-the-three-personas-and-the-eligibility-gate)).

### 6.4 Where the numbers come from in mock mode

`backend/mock_data/synthetic_weeks.json` seeds 8 weeks of listening history per persona:
* **Aanya**: genre-stuck. weeks 1-2 look diverse, weeks 3-8 collapse to ~85% dream-pop. `compute_stuck_score` returns `genre = 0.78` in the latest week.
* **Karthik**: language-stuck. Weeks 1-2 have healthy Telugu-Hindi-English mix, weeks 3-8 collapse to 91% Telugu.
* **Riya**: stable across all axes. All scores stay well below 0.6.

The frontend `Dashboard.jsx` (mounted at `/engine`) plots these 8 weeks so we can visually verify the collapse point.

---

## 7. LLM usage (Groq)

Pulse uses Groq for **two** things. Both live in [`backend/app/llm_client.py`](backend/app/llm_client.py).

### 7.1 Ranking + explanation (reset_engine)

When `POST /reset/sessions` is called, the backend needs to:
1. Take a candidate pool (60 to 80 tracks, from `spotify_client.search_candidates()` in mock mode or the Spotify Web API in real mode).
2. Return the best 20 in an order that widens the user along the collapsed axis.
3. Attach a one-line "why this?" explanation to each track that references the user's current listening.

This runs on **Llama 3.3 70B Versatile** (`GROQ_MODEL_REASONER`), which handles a ~4000-token structured JSON prompt reliably.

### 7.2 Fast classification (jobs.run_detection)

When the weekly cron runs `POST /jobs/run-detection`, we need to tag each recently-played track with a canonical genre/language/era/mood set so we can compute the axis distributions. This runs in **Llama 3.1 8B Instant** (`GROQ_MODEL_FAST`) for a ~10x latency win, which matters for the batch job.

### 7.3 Resilience: mock-mode fallback

Groq's free tier has a daily token cap. When `MOCK_MODE=true`, we now catch any `GroqError` (including the 429 daily-limit case) and gracefully fall back to `_mock_rank_and_explain()`. This means the demo works even when the token quota is exhausted, at the cost of returning canned per-track explanations. The fallback is documented at the top of `llm_client.py`.

We also custom-tuned the `tenacity` retry policy so 429 errors fail fast (via `GroqRateLimitError`, a custom `GroqError` subclass) instead of blocking the UI for 14 seconds of exponential backoff.

---

## 8. Database schema

SQLite, 8 tables, all defined in [`backend/app/models.py`](backend/app/models.py). Schema is written to match the flow described in [§4](#4-end-to-end-data-flow).

| Table | Purpose |
|---|---|
| `users` | Persona metadata: name, plan, tenure, primary language, `eligible_for_pulse` flag, signature quote. |
| `weekly_snapshots` | One row per (user, ISO week). Stores the raw distribution across each axis for that week. |
| `stuck_scores` | Output of `compute_stuck_score()`. One row per (user, ISO week, axis). |
| `nudges` | One row per triggered nudge. Statuses: `pending`, `dismissed`, `accepted`, `expired`. |
| `reset_sessions` | Created by `POST /reset/sessions`. Holds the 20 selected tracks, the scope, LLM output, decision (`keep`, `revert`, or null), and the cached outcome payload. |
| `reset_tracks` | Per-track rows for each reset session, with a `removed_at` timestamp for soft delete. |
| `sandbox_play_events` | Play events polled from `recently-played` during an active sandbox. Feeds the "measured" side of the after-score. |
| `job_runs` | One row per `POST /jobs/run-detection` invocation. Powers the `/engine/runs` diagnostic view (4-step trace: LOAD, FORMULAS, TRIGGER, NUDGE?). |

Schema changes use non-destructive `ALTER TABLE ADD COLUMN` migrations (see `db.py`). The DB file (`backend/reset_radar.db`) is gitignored and ephemeral on Railway. That's intentional: it matches the "reset on refresh" demo narrative.

---

## 9. API surface

Full OpenAPI at `<railway>/docs` (auto-generated by FastAPI). The routes are grouped by concern in [`backend/app/routes/`](backend/app/routes/).

### 9.1 Meta

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe. Returns `mock_mode`, model IDs, `status`. |

### 9.2 Dashboard

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users` | List the seeded personas with all UI-facing metadata. |
| `GET` | `/scores/history?user_id=...` | 8-week stuck-score history for the `/engine` view. |

### 9.3 Nudges

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/nudges/latest?user_id=...` | Latest pending nudge (if any) for HomePage. |
| `POST` | `/nudges/{id}/respond` | Body: `{ action: "accept"|"dismiss" }`. |

### 9.4 Reset sessions (the sandbox lifecycle)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/reset/sessions` | Create a session. Body: `{ user_id, scope_dimensions, free_text_intent? }`. Runs Groq. Returns 20 ranked tracks + per-track "why". |
| `GET` | `/reset/sessions/{id}` | Fetch a session with its non-removed tracks. |
| `DELETE` | `/reset/sessions/{id}/tracks/{track_id}` | Soft delete a track (`removed_at` column). |
| `POST` | `/reset/sessions/{id}/decide` | Body: `{ decision: "keep"|"revert" }`. |
| `GET` | `/reset/sessions/{id}/outcome` | Cached outcome payload for Screen 4: before/after diversity + 3 stat cards. |

### 9.5 Jobs (batch)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/jobs/run-detection` | Rebuild snapshots + scores + fire nudges. Called by the Monday cron. Optional `?dry_run=true`. |
| `GET` | `/jobs/runs/last` | Most recent JobRun (with 4-step trace). |
| `GET` | `/jobs/runs?limit=20` | Paginated list. |
| `GET` | `/jobs/runs/{run_id}` | Single JobRun detail. |

### 9.6 Auth (real mode only)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/auth/login` | Starts Spotify OAuth Authorization Code + PKCE. |
| `GET` | `/auth/callback` | OAuth callback, sets signed `rr_session` cookie. |
| `GET` | `/auth/me` | Current session, if any. |

**CORS**: [`main.py`](backend/app/main.py) reads `FRONTEND_ORIGIN` and `CORS_ALLOW_ORIGINS` at runtime, plus matches `*.vercel.app`, `*.netlify.app`, and `*.pages.dev` via a regex so preview URLs work without a redeploy.

---

## 10. The three personas and the eligibility gate

The demo ships with three personas seeded in [`backend/mock_data/mock_users.json`](backend/mock_data/mock_users.json). The eligibility gate is applied inside `routes/jobs.run_detection` *before* the trigger rule, so an ineligible user's `job_runs` row records `skipped: not_eligible` and no snapshot is written.

| Persona | Plan | Tenure | Collapsed axis | Pulse behaviour |
|---|---|---|---|---|
| **Aanya** (Bollywood/Hindi-Pop-heavy English-indie listener) | Premium Individual | 36 mo | genre | Nudge fires. `suggested_scope=genre`, Screen 4 shows genre 22% -> 54%. |
| **Karthik** (Telugu + Hindi + English mix) | Premium Individual | 60 mo | language | Nudge fires. `suggested_scope=language`, Screen 4 shows language 19% -> 50% (matches the mockup). |
| **Riya** (the control case) | **Free** | **2 mo** | none (healthy diverse listening) | **No nudge, ever.** Backend gates on `eligible_for_pulse=false`. Riya's `/engine` trace records `skipped: not_eligible`. Frontend home shows Spotify mobile without a Pulse card. |

Riya proves the negative: Pulse does not offer itself to users outside the target segment. The gate has three conjunctive rules:

1. `plan == "premium"` (Pulse is a Premium-only feature)
2. `tenure_months >= 3` (at least one 3-week streak's worth of listening history)
3. At least one axis distribution has more than N=3 values (a user who only listens to 1 genre can't be "stuck", they're new)

See [`doc/architecture.md`](doc/architecture.md) §10.1 for the full gate contract.

---

## 11. Frontend state model

The React tree lives under a `<SavedSandboxProvider>` mounted in [`App.jsx`](frontend/src/App.jsx). The provider gives every page these hooks:

* `usePersona()`: current persona from the URL param `?viewingAs=aanya|karthik|riya` (see [`frontend/src/hooks/usePersona.js`](frontend/src/hooks/usePersona.js)). Falls back to the persona picker modal when unset.
* `useSavedSandbox()`: `{ savedSandbox, saveSandbox, clearSandbox }`. The saved sandbox is the one the user tapped **Save to library** on. Session-local, in-memory.
* `useSandboxDecision()`: `{ keptPlaylist, keep, discard }`. The kept playlist is the one the user hit **Keep** on from Screen 4 or the Library nudge. Also session-local.

### The nudge suppression rule

`HomePage.jsx` has three mutually exclusive states:

```
if (keptPlaylist)              → show KeptInLibraryNudge
else if (savedSandbox)         → show CheckYourLibraryNudge
else if (nudge && !dismissed)  → show PulseNudgeCard ("Try a reset")
else                           → show nothing (Spotify home as usual)
```

This is what makes the "walk the flow forward, never go backwards visually" behaviour work. Once you save the sandbox, you don't see the try-a-reset nudge again until you refresh. Once you keep the playlist, the follow-up nudge is persistent for the trial window.

---

## 12. Session-local design (why refresh resets everything)

Both `savedSandbox` and `keptPlaylist` are stored in a plain React `useState` inside [`SavedSandboxContext.jsx`](frontend/src/context/SavedSandboxContext.jsx). No `localStorage`, no `sessionStorage`, no backend persistence. This is a deliberate design choice, not a limitation:

1. **The deck reviewer never gets a stale state.** Every time they refresh, they start on the persona picker, walk the flow, see a nudge, save it, keep it, and finish clean.
2. **We don't need a login system.** Persona picking is enough context; we never have to worry about "which state belongs to which user".
3. **The narrative of the demo matches the code.** Pulse is a 10-day trial. The demo lives in a single browser tab, and closing the tab is the trial ending. That's an accurate mental model for the reviewer.

The `reset_radar.db` on Railway is similarly ephemeral (SQLite file that resets on every Railway redeploy). Combined with the frontend's session-local state, this gives us a fully self-cleaning demo with zero data-management overhead.

---

## 13. Status: what's shipped

All phases are green. Pulse is a working, deployable, three-persona demo end-to-end.

| Phase | Status |
|---|---|
| **P0** Rebrand + docs + prune | Done. Reset Radar renamed to Pulse across every file. Folder pruned to `backend/`, `frontend/`, `doc/`. |
| **P0.5** Mock data + eligibility gate | Done. Aanya, Karthik, Riya. Riya's Free-tier + 2-month gate proves the negative. |
| **P1** Mobile shell + Home nudge (Screen 1) | Done. 375x812 `PhoneFrame`, `SpotifyBrandBar`, `PulseNudgeCard`, `DiversityScoreCard`. |
| **P2** Sandbox Playlist (Screen 2) | Done. Shimmer skeleton, 5-track default, sticky nav, kebab attention pulse. |
| **P3** Now Playing (Screen 3) | Done. Left-chevron back, `TrackActionSheet` kebab, right-sized play control. |
| **P4** Keep-or-Revert outcome (Screen 4) | Done. Before/after diversity, projected vs. measured after-score. |
| **P5** Sandbox lifecycle endpoints (backend) | Done. Per-track soft-delete, cached outcome, sandbox-play polling. |
| **P5.5** Save/Keep/Discard + Library | Done. Session-local `SavedSandboxContext`, `LibraryPage`, `SavedConfirmationPage`, follow-up nudges. |
| **P6** Public deployment + deck link-in | Done. Railway backend + Vercel SPA + GitHub Actions weekly cron. |

Full per-task tables in [`doc/implementationPlan.md`](doc/implementationPlan.md).

---

## 14. Folder structure

```
02-mvp/
├── backend/                              # FastAPI + SQLAlchemy + SQLite
│   ├── app/
│   │   ├── main.py                       # FastAPI entry, CORS, init_db, /health
│   │   ├── config.py                     # pydantic-settings (.env reader)
│   │   ├── db.py                         # engine + Base + Session factory
│   │   ├── models.py                     # 8 ORM tables + Pydantic wire shapes
│   │   ├── llm_client.py                 # Groq wrapper: rank_and_explain, classify_track
│   │   ├── spotify_client.py             # Mock-first Spotify wrapper (spotipy in real mode)
│   │   ├── detection.py                  # shannon_entropy, compute_stuck_score
│   │   ├── reset_engine.py               # Candidate generation, Groq rank, outcome compute
│   │   └── routes/
│   │       ├── auth.py                   # OAuth Authorization Code + PKCE
│   │       ├── dashboard.py              # /users, /scores/history
│   │       ├── jobs.py                   # /jobs/run-detection, /jobs/runs/*
│   │       ├── nudges.py                 # /nudges/latest, /nudges/{id}/respond
│   │       └── reset.py                  # /reset/sessions/*
│   ├── mock_data/
│   │   ├── mock_users.json               # 3 personas with UI metadata
│   │   ├── synthetic_weeks.json          # 8-week listening history per persona
│   │   ├── mock_candidates.json          # Candidate pool per (scope, persona)
│   │   └── mock_outcomes.json            # Screen 4 numbers per persona
│   ├── scripts/                          # One-off data generators + smoke helpers
│   ├── tests/                            # 11 pytest files (one per surface)
│   ├── Procfile                          # Railway: uvicorn app.main:app on $PORT
│   ├── railway.json                      # Nixpacks builder + /health probe
│   ├── runtime.txt                       # python-3.11
│   ├── requirements.txt
│   └── .env.example
├── frontend/                             # React 18 + Vite 5 (mobile-first)
│   ├── src/
│   │   ├── main.jsx                      # ReactDOM + BrowserRouter
│   │   ├── App.jsx                       # Routes wrapped in <SavedSandboxProvider>
│   │   ├── theme.js                      # Spotify + Pulse design tokens
│   │   ├── styles.css                    # Global reset + phone-frame tokens + keyframes
│   │   ├── api/client.js                 # fetch wrapper (VITE_API_BASE + credentials)
│   │   ├── hooks/
│   │   │   ├── usePersona.js             # ?viewingAs=aanya|karthik|riya
│   │   │   └── useDemoUser.js
│   │   ├── context/
│   │   │   └── SavedSandboxContext.jsx   # Session-local savedSandbox + keptPlaylist
│   │   ├── components/                   # See §11
│   │   └── pages/
│   │       ├── HomePage.jsx              # /                                        Screen 1
│   │       ├── SandboxPlaylistPage.jsx   # /sandbox/:sessionId                      Screen 2
│   │       ├── NowPlayingPage.jsx        # /sandbox/:sessionId/now-playing/:trackId Screen 3
│   │       ├── OutcomePage.jsx           # /sandbox/:sessionId/outcome              Screen 4
│   │       ├── SavedConfirmationPage.jsx # /sandbox/:sessionId/saved                confirmation
│   │       ├── LibraryPage.jsx           # /library                                 Library tab
│   │       ├── Dashboard.jsx             # /engine                                  diagnostics
│   │       └── RunsPage.jsx              # /engine/runs                             per-run trace
│   ├── vite.config.js
│   ├── vercel.json                       # SPA rewrite so React Router paths survive refresh
│   ├── index.html                        # <title>Pulse</title>
│   ├── package.json
│   └── package-lock.json
├── .github/
│   └── workflows/
│       └── weekly-detection.yml          # Mondays 09:00 UTC cron
├── doc/
│   ├── problemStatement.md               # Why Pulse exists
│   ├── implementationPlan.md             # Phase plan P0 through P6 with per-task tables
│   ├── architecture.md                   # Full v2 mobile-first architecture
│   ├── DEMO_SCRIPT.md                    # 90-second live-demo walkthrough
│   └── mockups/                          # Four HTML mockups (design source of truth)
├── .gitignore
└── README.md                             # this file
```

---

## 15. How to run (local dev)

### 15.1 Backend

```powershell
# From C:\Users\tiwari.mahima\Mayank\02-mvp
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
cp backend\.env.example backend\.env
# Edit backend\.env and set GROQ_API_KEY (leave MOCK_MODE=true for the demo)

cd backend
uvicorn app.main:app --reload --port 8000
# Visit http://127.0.0.1:8000/health -> {"status":"ok","mock_mode":true,...}
# Visit http://127.0.0.1:8000/docs   -> Full OpenAPI UI
```

### 15.2 Frontend

```powershell
# From C:\Users\tiwari.mahima\Mayank\02-mvp\frontend
npm install
npm run dev
# Visit http://localhost:5173 on a phone-sized viewport
# (DevTools Device Toolbar -> iPhone 13 Pro is a good default)
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000` (see [`vite.config.js`](frontend/vite.config.js)) so both processes need to be running for end-to-end calls.

### 15.3 Quick smoke test

Once both are running:

```powershell
curl http://127.0.0.1:8000/users
# Aanya, Karthik, Riya array

curl http://127.0.0.1:8000/nudges/latest?user_id=demo-aanya-002
# Aanya's pending nudge (or 404 if she's already dismissed it)
```

---

## 16. Deploy: how the live surfaces are wired

Same two-service pattern as [`01-ai-review-engine`](../01-ai-review-engine/): FastAPI on Railway, Vite/React on Vercel, both auto-redeploying on every push to `main`. Reproducing the deploy takes ~15 min end-to-end.

### 16.1 Railway (FastAPI backend)

1. https://railway.app, then **New Project** -> **Deploy from GitHub repo** -> pick this repo.
2. Service **Settings**:
   - **Root Directory:** `backend` (critical, the Procfile / railway.json / runtime.txt all live inside `backend/`).
   - **Health Check Path:** `/health`
   - Memory Limit: default 512 MB is enough (backend has no ML deps).
3. Service **Variables**:
   - `GROQ_API_KEY = gsk_...`
   - `MOCK_MODE = true` (default, keeps the demo Spotify-free)
   - `SESSION_SECRET_KEY = <python -c "import secrets;print(secrets.token_urlsafe(48))">`
   - `FRONTEND_ORIGIN = https://nl-mvp-pulse.vercel.app` (match your Vercel URL)
4. **Settings** -> **Networking** -> **Generate Domain** -> smoke-test [`/health`](https://nlmvppulse-production.up.railway.app/health).

### 16.2 Vercel (React SPA)

1. https://vercel.com, then **Add New** -> **Project** -> **Import** -> pick this repo.
2. Configure Project:
   - **Root Directory:** `frontend` (critical, Vercel defaults to repo root).
   - **Framework Preset:** Vite (auto-detected).
   - **Environment Variable:** `VITE_API_BASE = <your Railway URL>`
3. Deploy, then smoke-test on a phone-sized viewport.

`frontend/vercel.json` handles the SPA rewrite so React Router paths (`/library`, `/sandbox/:id`, `/sandbox/:id/now-playing/:trackId`, etc.) survive a hard refresh.

### 16.3 GitHub Actions (weekly cron)

Set `PULSE_API_URL` under Settings -> Secrets and variables -> Actions -> Secrets. See [§17](#17-weekly-github-action) for the full contract.

---

## 17. Weekly GitHub Action

[`.github/workflows/weekly-detection.yml`](.github/workflows/weekly-detection.yml) fires **Mondays 09:00 UTC (14:30 IST)** against `POST $PULSE_API_URL/jobs/run-detection`, which:

1. Fetches every persona's latest weekly snapshot.
2. Recomputes stuck-scores across the 4 axes (genre, language, era, mood).
3. Fires a new nudge if the 3-week streak rule + eligibility gate both pass.
4. Uploads the response JSON as a build artefact (30-day retention).

Two repo secrets need to be set once (Settings -> Secrets and variables -> Actions):

| Secret | Value | Required? |
|---|---|---|
| `PULSE_API_URL` | `https://nlmvppulse-production.up.railway.app` | Yes |
| `PULSE_API_TOKEN` | Shared secret matching backend's `JOBS_API_TOKEN` env var. | No, leave empty for the single-tenant demo. |

You can trigger the workflow on-demand from the Actions tab (`workflow_dispatch`) with an optional `dry_run=true` input for verification without persisting snapshots.

See [`doc/architecture.md`](doc/architecture.md) §9 for what runs each Monday.

---

## 18. Real-mode setup (Spotify OAuth)

Follow these steps to run against a real Spotify Premium account instead of the mock personas.

### 18.1 Create a Spotify Developer app

1. Visit https://developer.spotify.com/dashboard and sign in.
2. **Create app**, name it `Pulse (local)`.
3. Settings -> Edit:
   - **Redirect URIs**: add `http://127.0.0.1:8000/auth/callback`
   - **Which API/SDKs**: tick **Web API**
   - Save.
4. Copy the **Client ID**. Pulse uses PKCE, so no secret is needed.

### 18.2 Allow-list yourself

Development Mode caps at 25 users. Under the Spotify app's **User Management** tab, add the email associated with the Premium account you'll use.

### 18.3 Fill in `backend/.env`

```dotenv
GROQ_API_KEY=...
MOCK_MODE=false
SPOTIFY_CLIENT_ID=<from step 18.1.4>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
SESSION_SECRET_KEY=<python -c "import secrets;print(secrets.token_urlsafe(48))">
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

### 18.4 Walk the flow

```powershell
cd backend
uvicorn app.main:app --reload --port 8000
# In another shell:
start http://127.0.0.1:8000/auth/login
# Spotify consent, then callback, then redirect to localhost:5173
curl http://127.0.0.1:8000/auth/me
# Should show authenticated: true + your display name
curl -X POST http://127.0.0.1:8000/jobs/run-detection
# Fetches your top tracks + recently-played + saved library,
# classifies each with Groq, appends one WeeklySnapshot row,
# runs detection.
```

> First-time real-mode run creates exactly one weekly snapshot, so the 3-week streak rule will deliberately stay quiet. That's expected. Build up history by re-running weekly, or stick with mock mode for the demo.

---

## 19. Testing

11 pytest files under [`backend/tests/`](backend/tests/), one per surface:

| File | Covers |
|---|---|
| `test_detection.py` | `shannon_entropy`, `compute_stuck_score`, trigger rule edge cases |
| `test_llm_classify.py` | Groq classification with mocked HTTP + real-mode retry logic |
| `test_reset_engine.py` | Candidate ranking, "why this" attachment, mock fallback |
| `test_reset_lifecycle.py` | Full session lifecycle: create -> remove track -> decide -> outcome |
| `test_reset_routes_real.py` | Real-mode-only tests (skipped when `MOCK_MODE=true`) |
| `test_sandbox_polling.py` | `SandboxPlayEvent` polling of Spotify recently-played |
| `test_jobs_runs.py`, `test_jobs_auth.py` | Batch job + optional bearer-token auth |
| `test_auth.py` | OAuth Authorization Code + PKCE flow |
| `test_spotify_client_real.py`, `test_spotify_writes_real.py` | Real Spotify Web API surface (skipped without credentials) |

Run:

```powershell
cd backend
pytest -q
# All fast tests pass; real-Spotify tests are skipped without credentials.
```

---

## 20. The honest gap: what Pulse doesn't do

Pulse's sandbox promise is **UX-level, not backend-enforced**. Spotify's public Web API does not let a third party exclude listening from the user's recommendation model. That means every track a user plays inside the Pulse sandbox is still, technically, listening history that Spotify's recommender may fold back into their profile.

We compensate with **reversibility**:
* **Revert** deletes the sandbox playlist and follows / saves nothing. Zero permanent artefacts in the user's library.
* The 10-day trial window is short enough that even if a small amount of drift happens, it's within the range of a "curious listening week".
* We're upfront about this on Screen 4 (a small honest-gap footnote under the Keep-or-Revert CTA).

For the full technical statement, see [`doc/architecture.md`](doc/architecture.md) §12. The gap is also called out on deck slide 9 (frames) and slide 11 (future scope).

**Other explicit non-goals for this MVP:**
* No multi-user account system. Persona picking replaces login.
* No cross-device state. The demo is single-tab.
* No push notifications. The weekly cron is server-side only. In a production Pulse we'd surface it via Spotify's own notification surface.
* No A/B experimentation harness. Every persona sees the same reset UX.

---

## 21. Where the other docs live

- **Project-wide problem statement:** [`../masterProblemStatement.md`](../masterProblemStatement.md)
- **Project-wide architecture:** [`../masterArchitecture.md`](../masterArchitecture.md)
- **User research + deck:** [`../03-research-and-deck/`](../03-research-and-deck/)
- **AI Review Engine (P1):** [`../01-ai-review-engine/`](../01-ai-review-engine/)

---

**Live surfaces (all auto-redeploy on every push to `main`):**

- React SPA on Vercel: [`nl-mvp-pulse.vercel.app`](https://nl-mvp-pulse.vercel.app/)
- FastAPI backend on Railway: [`.../health`](https://nlmvppulse-production.up.railway.app/health)
- Weekly cron: [GitHub Actions](https://github.com/mmishra0321/NL_MVP_Pulse/actions/workflows/weekly-detection.yml)
