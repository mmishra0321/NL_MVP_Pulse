# 02-mvp — Pulse: implementation plan (strategic + tactical)

> **Rebrand note (2026-07-04).** The MVP formerly known as
> *Reset Radar* is now **Pulse**. The problem it solves has not
> changed — see [`problemStatement.md`](./problemStatement.md) —
> but the surface has: Pulse is a **mobile-first Spotify-embedded**
> flow, not a desktop companion web app. The design source of
> truth is the four HTML mockups in [`mockups/`](./mockups/).
>
> **This is the single plan for the MVP** (formerly split across
> `plan.md` + `implementation.md`; merged and renamed to
> `implementationPlan.md` on 2026-07-04). It's organised so each
> phase's *why*, *acceptance gate*, and *task list* live next to
> each other:
>
> - Sections 1-3 are pure narrative — what Pulse is, the four
>   screens, and how it differs from the old Reset Radar codebase.
> - Sections 4-5 cover personas and the eligibility gate.
> - Sections 6-12 are the **phase plan (P0 → P6)**. Each phase
>   has a goal, an acceptance gate, and a task table with Files /
>   Do / Verify / Est. / Deps per task.
> - Sections 13-18 are cross-cutting concerns (testing, git,
>   deploy, risks, open questions, non-goals).
>
> **This document supersedes the old R0-R10 phase log in
> `README.md`.** Anything from the old plan that this file does
> not restate is intentionally out of scope.

---

## Table of contents

1. [What Pulse is](#1-what-pulse-is)
2. [The four screens that define the product](#2-the-four-screens-that-define-the-product)
3. [Deltas from the old Reset Radar codebase](#3-deltas-from-the-old-reset-radar-codebase)
4. [Personas (mock-mode roster)](#4-personas-mock-mode-roster)
5. [Eligibility gate](#5-eligibility-gate)
6. [Phase overview](#6-phase-overview)
7. [Global setup (one-time)](#7-global-setup-one-time)
8. [P0 — Rebrand + docs + prune ✅ · P0.5 — Mock data + eligibility gate ✅](#8-p0--p05--already-shipped)
9. [P1 — Mobile shell + Home nudge (screen 1)](#9-p1--mobile-shell--home-nudge-screen-1)
10. [P2 — Sandbox Playlist (screen 2)](#10-p2--sandbox-playlist-screen-2)
11. [P3 — Now Playing inside sandbox (screen 3)](#11-p3--now-playing-inside-sandbox-screen-3)
12. [P4 — Keep or Revert outcome (screen 4)](#12-p4--keep-or-revert-outcome-screen-4)
13. [P5 — Sandbox lifecycle backend](#13-p5--sandbox-lifecycle-backend)
13.5. [P5.5 — Save-to-library flow + Screen 2 polish](#135-p55--save-to-library-flow--screen-2-polish--done-2026-07-04)
14. [P6 — Public deployment + deck link-in](#14-p6--public-deployment--deck-link-in)
15. [Cross-cutting: testing, git, deploy](#15-cross-cutting-testing-git-deploy)
16. [Risk register](#16-risk-register)
17. [Open questions](#17-open-questions)
18. [Non-goals + where the other docs sit](#18-non-goals--where-the-other-docs-sit)

---

## 1. What Pulse is

Pulse is a **sandboxed reset** that lives inside the Spotify UI.
When our detection engine sees a Premium listener's diversity
collapse along one axis (genre / language / era / mood) for three
consecutive weeks, we surface a **nudge card in the Spotify home
feed**. Accepting the nudge creates a **20-track sandbox playlist**
labelled `SANDBOX · Not saved to library yet`, plays inside a
regular Spotify player that carries a persistent green **Pulse
Sandbox ribbon** with a "X days left · Keep or Revert" CTA. On
Day 10 the user sees an **outcome page** with what they actually
did with the sandbox (tracks played, repeat plays, artists they
searched) and a measured before → after diversity score, and
decides **Keep** (save the tracks to library, follow the promoted
artists) or **Revert** (delete the sandbox, zero profile impact).

---

## 2. The four screens that define the product

| Screen | File in `doc/mockups/` | What it proves |
|---|---|---|
| **1. Home feed nudge** | *(implicit — embedded in the Spotify-home mobile shell we already build)* | The system is proactive: user does nothing, Pulse comes to them at the right moment. |
| **2. Sandbox Playlist** | `screen2-sandbox-playlist.html` | Every track carries a per-track **Why this?** explanation and the whole list is **explicitly sandboxed** (`SANDBOX · Not saved to library yet` pill). Trust: nothing has been written to their real library. |
| **3. Now Playing (inside sandbox)** | `screen3-now-playing.html` | The reset is a **first-class listening context**, not a modal. The persistent green **Pulse Sandbox ribbon** ("X days left · Keep or Revert") is on-screen even during playback — the reversibility promise is always visible. |
| **4. Keep or Revert (Day 10)** | `screen4-keep-or-revert.html` | The decision is **evidenced**, not vibes-based: real listening stats + a **measured** before → after language-diversity delta. Revert is one tap; Keep is one tap. |

The architecture in [`architecture.md`](./architecture.md) is
built exclusively to serve these four screens plus the passive
weekly detection job behind them.

---

## 3. Deltas from the old Reset Radar codebase

| Area | Old (Reset Radar) | New (Pulse) |
|---|---|---|
| Brand + name | Reset Radar | **Pulse** |
| Form factor | Desktop React web app (1440-wide "Spotify web" mock) | **Mobile-first 375×812 iPhone frame** rendered inside a `PhoneFrame` component; the visible surface always looks like a real Spotify mobile screen |
| Home page (`/`) | Desktop mock with a nudge card, plus embedded diagnostic dashboard | Mobile Spotify home feed with a **single nudge card** in the feed; no charts on the home page |
| Sandbox model | `ResetSession` created + `POST /me/playlists` fires immediately; user sees a "Reset playlist" view | Same backend row, but the UI **frames it as a sandbox** — `SANDBOX` pill, 10-day countdown ribbon, per-track "Remove from this reset" action |
| Per-track edit | Not supported | **`DELETE /reset-sessions/{id}/tracks/{track_id}`** — 3-dot menu on any track opens a bottom sheet with "Remove from this reset" (destructive) |
| Trial-window UI | Skip-to-outcome button | Ribbon shows real `days_left` derived from `trial_end_date`; skip-to-outcome stays as a demo affordance |
| Outcome page | "before 0.86 → after (projected) 0.51" — projection only | **Measured** outcome: played-count, repeat-plays, artist-search hits, before/after language-diversity **from real snapshots** (mock-mode uses fixture-derived numbers matching the personas) |
| Diagnostic UI | `/` = Dashboard, `/engine`, `/runs` | All diagnostics move under **`/engine/*`** (internal-only), unlinked from Pulse. The chart-heavy dashboard, `LastRunCard`, and `RunsPage` are preserved but no longer part of the demo path |
| Deployment | Not deployed (R7 was local-only) | Public URL required for the deck |

**What stays as-is:** `detection.py` (jaccard + Shannon entropy),
`reset_engine.py` (Groq ranking + per-track why), `llm_client.py`
(throttled Groq wrapper), `spotify_client.py`, the four scope
dimensions (genre / language / era / mood), the weekly GitHub
Action cron, the SQLite persistence layer, the Groq API surface
choice.

---

## 4. Personas (mock-mode roster)

Three personas are pre-seeded in `backend/mock_data/mock_users.json`
and anchored to
[`../../03-research-and-deck/problem-definition/personas.md`](../../03-research-and-deck/problem-definition/personas.md):

| Persona | Plan | Tenure | Collapsed axis | Pulse behaviour |
|---|---|---|---|---|
| **Aanya** (`demo-aanya-002`) | Premium Individual | 36 mo | genre (5-subgenre mix → 85% dream-pop over 8 weeks) | Nudge fires on W25-W26. `suggested_scope=genre`, `overall≈0.92`. |
| **Karthik** (`demo-karthik-001`) | Premium Individual | 60 mo | language (en/te/hi → 91% Telugu over 8 weeks) | Nudge fires on W25-W26. `suggested_scope=language`, `overall≈0.86`. |
| **Riya** (`demo-riya-003`) — **the control case** | Free | 2 mo | *n/a — healthy diverse listening across 4 weeks* | **No nudge. Ever.** Backend gates on `eligible_for_pulse=false` (see §5). `/nudges/latest` returns `null`; her `/engine` trace shows `skipped: not_eligible`. |

Riya exists so the demo can visibly prove that Pulse **structurally
does not offer itself to users outside the target segment** — she's a
Free-tier user with 2 months tenure, so both criterion 1 (Premium)
and criterion 2 (≥ 3 years tenure) from the target segment definition
fail. The frontend home page for Riya renders the Spotify-home shell
**without** a Pulse nudge card, and the persona-picker modal marks her
card "Free tier — Pulse stays silent" so reviewers see the gate rather
than a broken feature.

---

## 5. Eligibility gate

`POST /jobs/run-detection` (both weekly cron + manual) reads
`mock_data/mock_users.json` at the top of the mock loop. For any user
where `eligible_for_pulse == false`:

- No `WeeklySnapshot`, `StuckScore`, or `Nudge` rows are written.
- The `JobRun.details_json` trace still gets a row for the user, with
  `skipped_by_eligibility: true`, `reason: "not_eligible: <why>"`,
  `plan`, and `tenure_months`. This makes the skip visible in
  `/engine/runs`, so the deck reviewer can see the gate firing rather
  than assuming Pulse "just forgot" about Riya.
- `summary["users_skipped"]` counts these separately from
  `users_processed`.

In **real mode** (P6 onwards), the eligibility check will move to a
different signal source — Spotify's `/me` endpoint exposes
`product: "premium" | "free"` and account creation date is derivable
from the OAuth flow. Same shape, real numbers.

---

## 6. Phase overview

Each phase has a **single acceptance gate** — one thing that must
be true before the phase counts as done. Full task lists are in
the per-phase sections below.

| Phase | Focus | Acceptance gate (one line) | Status |
|---|---|---|---|
| **P0** | Rebrand + docs + prune | Doc folder, README, folder tree describe *Pulse*, not Reset Radar; mockups live next to the architecture doc; every stale file is gone. | ✅ Done |
| **P0.5** | Mock data + eligibility gate | 3-persona fixture + `POST /jobs/run-detection` skips Riya with a trace-visible reason. | ✅ Done |
| **P1** | Mobile shell + Home nudge (screen 1) | `/` shows a phone-shaped mobile Spotify home; first-load `PersonaPickerModal` gates entry; nudge card renders for Aanya + Karthik and is absent for Riya; `/engine` still renders the old dashboard. | ✅ Done (2026-07-04) |
| **P2** | Sandbox Playlist (screen 2) | Accepting the nudge routes to `/sandbox/:sessionId`; 20 tracks render with `Why this?` chips; kebab → sheet → "Remove from this reset" hits `DELETE /reset-sessions/{id}/tracks/{trackId}` with optimistic UI. | ✅ Done (2026-07-04) |
| **P3** | Now Playing inside sandbox (screen 3) | Tapping a track routes to Now Playing; the green ribbon shows real `days_left`; Keep-or-Revert CTA routes to the outcome page. | ✅ Done (2026-07-04) |
| **P4** | Keep or Revert outcome (screen 4) | Outcome page renders **measured** numbers from `GET /reset-sessions/{id}/outcome` for both eligible personas; Keep + Revert both return home with a toast. | ✅ Done (2026-07-04) |
| **P5** | Sandbox lifecycle backend | All four Pulse screens render end-to-end against real endpoints; `pytest` stays green with new tests for the two new endpoints. | ✅ Done (2026-07-04) |
| **P5.5** | Save-to-library flow + Screen 2 polish | Screen 2's *Save to library* pill and Screen 3's kebab *Save this playlist* action both push the sandbox into a session-local `SavedSandboxContext`, which surfaces a countdown + Keep/Discard card on Home. Tapping Keep promotes the sandbox to a persistent *"Your Pulse Reset"* tile on Home (above Made For You) and a matching entry in a new `/library` route reachable via the bottom-nav Library icon; both surfaces show a blinking green dot. Refresh wipes both flags. Screen 2 shows shimmer skeletons on load, limits the tracklist to 5 rows by default, and points a pulsing kebab + coach-mark at the first row. | ✅ Done (2026-07-04) |
| **P6** | Public deployment | Public URL loads Pulse on a real phone; three fresh screenshots sit next to the deck; slide 9 references them. | Pending |

---

## 7. Global setup (one-time)

Confirm your environment is ready before starting any phase.

| # | Do | Verify |
|---|---|---|
| G1 | `python --version` (3.13+ preferred, 3.11 minimum) | `Python 3.13.x` |
| G2 | `node --version` (18+), `npm --version` | Node ≥ 18 |
| G3 | Activate venv: `.\.venv\Scripts\Activate.ps1` from `02-mvp/` | Prompt shows `(.venv)` |
| G4 | `pip install -r backend/requirements.txt` (if venv is fresh) | No install errors |
| G5 | Copy `backend/.env.example` → `backend/.env`; fill `GROQ_API_KEY`; leave `MOCK_MODE=true` | `python -c "from app.config import settings; print(settings.mock_mode)"` prints `True` |
| G6 | `cd frontend && npm install` | `node_modules/` populated, no errors |
| G7 | Smoke: `python backend/scripts/_smoke_wet.py` | Prints `PASS` (Aanya + Karthik fire, Riya skipped) |

> **Deleted-state note.** `02-mvp/backend/reset_radar.db` and dev logs
> were pruned in P0; they get regenerated automatically. Do not
> re-commit them.

**Every task table below uses these fields:**

| Field | Meaning |
|---|---|
| **Files** | Exact paths that get created or modified. |
| **Do** | The concrete action, small enough to hold in your head. |
| **Verify** | The command / URL / assertion that proves the task is done. |
| **Est.** | Rough clock-time for a focused pass. Not commitments. |
| **Deps** | Which earlier task IDs must finish first. |

---

## 8. P0 + P0.5 — already shipped

### P0 — Rebrand + docs + prune ✅

Delivered in the 2026-07-04 session:

- Rewrote `doc/implementationPlan.md` (this doc, originally
  landed as `plan.md` + `implementation.md` and later merged),
  `doc/architecture.md`, `README.md`
- Copied the four Pulse mockups into `doc/mockups/`
- Renamed the brand from *Reset Radar* to **Pulse** everywhere in
  docs (frontend code still says Reset Radar; that rename happens
  incrementally in P1-P4 as each file gets rewritten anyway)
- Deleted 15 stale files/dirs:

| Path | Reason |
|---|---|
| `02-mvp/backend/uvicorn.log`, `uvicorn.err.log` | Regenerated on every run; noise in git |
| `02-mvp/backend/reset_radar.db` | Ephemeral SQLite from an old run; will be regenerated on first boot |
| `02-mvp/backend/.pytest_cache/` | Cache directory, `.gitignore`-worthy |
| `02-mvp/frontend/dist/` | Vite build output, regenerated |
| `02-mvp/frontend/vite.log`, `vite.err.log` | Same as uvicorn logs |
| `02-mvp/.uvicorn.log`, `.uvicorn.err.log` | Empty stubs left behind |
| `02-mvp/screenshots/` | Superseded by new Pulse mobile screenshots (will be regenerated in P6 into `03-research-and-deck/assets/mvp-screenshots/`) |
| `02-mvp/legacy-sonar/` | Archived old Sonar code; the disposition table in the R0 README is preserved in P0's rewrite of `README.md` |
| Workspace-root `terminals_uvicorn.*`, `terminals_vite.*` | Stale ad-hoc terminal captures from an earlier chat |

Nothing under `backend/app/` or `backend/tests/` was deleted. The
old `HomePage.jsx` / `Dashboard.jsx` / `RunsPage.jsx` survive P0
and only get moved in P1.

### P0.5 — Mock data + eligibility gate ✅

Delivered in the 2026-07-04 session (immediately after P0):

- `backend/mock_data/mock_users.json` — 3-persona roster (Aanya,
  Karthik, Riya) with plan/tenure/eligibility metadata
- `backend/mock_data/synthetic_weeks.json` — extended with Riya's
  4-week healthy fixture; `_personas` enriched with plan/tenure
- `backend/mock_data/mock_outcomes.json` — screen-4 numbers per
  eligible persona
- `routes/jobs.py` — eligibility gate wired into
  `POST /jobs/run-detection`. Ineligible users skipped with a
  trace-visible reason
- `routes/dashboard.py` — `GET /users` enriched with 13 optional
  persona-metadata fields; sorted eligible-first
- Two smoke scripts (`scripts/_smoke_3personas.py`,
  `scripts/_smoke_wet.py`) both **PASS**

---

## 9. P1 — Mobile shell + Home nudge (screen 1)

**Goal.** Introduce the phone-shaped mobile shell, replace the
desktop Dashboard as the app's home page, and gate entry through
a first-load persona picker so reviewers explicitly choose whose
Spotify they're viewing.

**Acceptance gate.** `/` shows a phone-shaped mobile Spotify home
with the Pulse nudge card visible in the feed for Aanya + Karthik;
Riya's `/` shows the same shell **without** a nudge card;
`PersonaPickerModal` opens on first visit and can be reopened from
the top-right `PersonaBadge`; `/engine` still renders the old
dashboard for internal QA.

### 9.1 Tasks

| ID | Files | Do | Verify | Est. | Deps |
|---|---|---|---|---|---|
| **T1** | `frontend/src/styles.css` | Add Pulse design tokens: phone frame (`--phone-w:375px`, `--phone-h:812px`, `--phone-radius:44px`), Spotify palette (`--pulse-green:#1DB954`, `--pulse-bg:#000`, `--pulse-surface:#181818`, `--pulse-muted:#B3B3B3`), status-bar height. **Also**: picker-modal overlay tokens (`--picker-overlay:rgba(0,0,0,0.85)`, `--picker-card-max-w:420px`) and the plan-pill tokens (`--plan-pill-premium-bg`, `--plan-pill-free-bg`). | Open Vite dev server; `body { background: var(--pulse-bg) }` renders black; a test `<div>` with `background: var(--picker-overlay)` renders semi-opaque black. | 25m | G-all |
| **T2** | `frontend/src/components/PhoneFrame.jsx` (new) | Build the 375×812 rounded-corner iPhone shell with iOS-style status bar (time "9:41", signal/wifi/battery SVGs). Accept `children` and an optional `bottomNav` slot. | Import into a scratch page; renders like `screen2-sandbox-playlist.html`'s outer chrome. | 45m | T1 |
| **T3** | `frontend/src/api/client.js` | Ensure existing functions include `credentials: 'include'`. Add `listUsers()` (`GET /users`) and `getLatestNudge(userId)` (`GET /nudges/latest?user_id=…`) if not already present. Base URL from `import.meta.env.VITE_API_BASE ?? '/api'`. | `await listUsers()` in DevTools returns 3 persona rows. | 25m | G7 |
| **T4** | `frontend/src/hooks/usePersona.js` (new) | Hook that resolves the active persona in priority order: (1) `?viewingAs=aanya\|karthik\|riya` URL query, (2) `localStorage["pulse.persona"]`, (3) **`null`** (triggers the picker modal). Returns `{personaKey, personaId, setPersona, clearPersona}`. `setPersona` writes both URL and localStorage; `clearPersona` clears both. Map: `aanya → demo-aanya-002`, `karthik → demo-karthik-001`, `riya → demo-riya-003`. | Nav to `/?viewingAs=riya` → hook returns `personaId="demo-riya-003"`. Nav to `/` in a fresh incognito tab → hook returns `null`. Call `setPersona("aanya")` → reload preserves the choice. | 25m | — |
| **T5a** | `frontend/src/components/PersonaPickerModal.jsx` (new) | Full-viewport dark overlay (`rgba(0,0,0,0.85)`) rendered **outside** the `PhoneFrame`. Reads `GET /users`, renders one card per persona with: avatar circle (`avatar_initial`), display_name + age + location + role, plan pill (green Premium / grey Free), tenure label, signature quote (eligible) or why_ineligible copy (ineligible), and an eligibility tag ("Fits target segment" green tick / "Free tier — Pulse stays silent" grey). Selecting a card → `setPersona(key)` → dismiss. No explicit close button — choice is required. Show only when `personaKey === null`. See `architecture.md` §5.5 for the full spec. | Fresh incognito tab on `/` → modal opens, all 3 cards visible, click Karthik → modal closes, home renders as Karthik. | 90m | T3, T4 |
| **T5b** | `frontend/src/components/PersonaBadge.jsx` (new) | Compact top-right pill positioned `fixed` outside the `PhoneFrame`. Shows small avatar circle + "Viewing as: <display_name>" + "Change" chevron. Click → `clearPersona()` which reopens the modal. | Badge visible in top-right corner after picking a persona. Clicking "Change" reopens the modal. | 30m | T4, T5a |
| **T6** | `frontend/src/components/SpotifyTopBar.jsx` (new) | Top bar with avatar pill (persona's `avatar_initial`) + arrow icons (visual only). Match the top bar in `screen2-sandbox-playlist.html`. | Renders inside `PhoneFrame`. | 25m | T1, T2 |
| **T7** | `frontend/src/components/SpotifyBottomNav.jsx` (new) | Bottom nav with Home / Search / Library / Premium / Create, matching `screen2` bottom nav. Static, no click behaviour in P1. | Renders at the bottom of `PhoneFrame` when `bottomNav` slot is used. | 25m | T1, T2 |
| **T8** | `frontend/src/components/PulseNudgeCard.jsx` (new; replaces `NudgeCard.jsx`) | Feed card that reads `getLatestNudge(personaId)`. If nudge is `null`, renders `null`. Copy: headline pulls from `nudge.suggested_scope` → sentence template (`"Your {language\|genre\|era\|mood} mix has been {overall_stuck_score * 100}% X for 3 weeks — try a 20-track reset?"`). Two buttons: **Try a reset** (routes to `/sandbox/new?scope=<suggested>`), **Not now** (calls `POST /nudges/{id}/respond` with `action=dismiss`). | For Karthik, card appears with "language" scope; for Riya, card is absent. | 60m | T3 |
| **T9** | `frontend/src/components/RecentlyPlayedGrid.jsx` (new) | 6 hard-coded gradient tiles per persona. Aanya: dream-pop themed; Karthik: Telugu Carnatic + Bollywood themed; Riya: eclectic (matches her diverse fixture). No API call — decorative. | Grid renders 6 tiles inside `PhoneFrame`. | 40m | T1 |
| **T10** | `frontend/src/pages/HomePage.jsx` (**rewrite**) | Compose: `<PersonaPickerModal show={!personaKey} />` + `<PersonaBadge onChange={clearPersona} />` (both outside the frame) + `PhoneFrame` > `SpotifyTopBar` + "Good evening, {display_name}" greeting + `PulseNudgeCard` (only when `personaId` set) + `RecentlyPlayedGrid` (persona-themed variant) + `SpotifyBottomNav`. Uses `usePersona()`. If `personaKey === null`, dim the phone frame behind the modal. | `/` in incognito → modal opens. Pick each persona → the whole scene switches. `PersonaBadge` "Change" button reopens modal. | 60m | T2, T5a, T5b, T6, T7, T8, T9 |
| **T11** | `frontend/src/App.jsx` | Update routes: `/` → `HomePage`; move `Dashboard` → `/engine`; move `RunsPage` → `/engine/runs`; delete top-level nav links to Reset / Engine / Runs (they only exist internally now). | `curl http://localhost:5173/engine` still renders diagnostic dashboard. | 15m | T10 |
| **T12** | `frontend/src/pages/Dashboard.jsx`, `RunsPage.jsx` | **Move only** — leave content untouched but rename header to "Pulse — Engine diagnostics". Remove any Reset-Radar-branded copy. | Manual scan: no "Reset Radar" strings left in these two files. | 20m | T11 |
| **T13** | `frontend/src/pages/ResetFlow.jsx`, components `KeepOrRevertCard.jsx`, `ResetPlaylistView.jsx`, `ScopePicker.jsx`, `StuckScoreCard.jsx` | **Delete.** These are the old desktop reset flow. `SandboxPlaylistPage` (P2), `NowPlayingPage` (P3), `OutcomePage` (P4) replace them. `StuckScoreCard` moves inside `Dashboard.jsx` in T12 if still needed. | `git status` shows 5 deletions. Frontend still builds. | 15m | T11 |
| **T14** | *(smoke)* | Start both servers; visit `/?viewingAs=karthik` and `/?viewingAs=riya`. Karthik sees nudge card; Riya sees no nudge card. `/engine` still works. | Screenshot each viewport at 375×812 into `scratch/` (not committed). | 20m | T10, T11 |

**Duration:** ~8 hours of focused work.

**Verification checklist (P1 done):**

- [ ] **First-load picker.** Fresh incognito tab on `/` shows the `PersonaPickerModal` with all 3 cards (Aanya + Karthik eligible, Riya marked "Free tier — Pulse stays silent"). Modal is un-dismissable except by picking a card.
- [ ] **Persistence.** After picking a persona, refreshing `/` does **not** reopen the modal — the badge shows the current persona.
- [ ] **Deep-link.** `/?viewingAs=riya` skips the modal and lands directly on Riya's home.
- [ ] **Reopen.** Clicking "Change" on the `PersonaBadge` reopens the modal.
- [ ] Home page renders inside a 375×812 phone frame with correct greeting name per persona.
- [ ] Nudge card renders for Aanya + Karthik with the correct scope; absent for Riya.
- [ ] `/engine` still shows the R8 dashboard.
- [ ] `/engine/runs` still shows the run history.
- [ ] No file mentions "Reset Radar" in `frontend/src/`.

---

## 10. P2 — Sandbox Playlist (screen 2)

**Goal.** Add the sandbox playlist page — the moment where trust
is earned. Every track carries a per-track *Why this?* explanation
and the whole list is explicitly labelled `SANDBOX · Not saved to
library yet`.

**Acceptance gate.** Accepting the nudge routes to
`/sandbox/:sessionId`; all 20 tracks render with `Why this?`
chips; the `SANDBOX · Not saved to library yet` pill is
prominently visible; the 3-dot menu opens a bottom sheet, and
**Remove from this reset** hits
`DELETE /reset-sessions/{id}/tracks/{trackId}` with an optimistic
UI update.

### 10.1 Tasks

| ID | Files | Do | Verify | Est. | Deps |
|---|---|---|---|---|---|
| **T15** | `frontend/src/api/client.js` | Add `createResetSession({userId, scopeDimensions, freeTextIntent})` → `POST /reset-sessions`; `getResetSession(id)` → `GET /reset-sessions/{id}`; `removeTrackFromReset(sessionId, trackId)` → `DELETE /reset-sessions/{id}/tracks/{trackId}`. | Call from DevTools; each returns the shapes in `architecture.md` §6.2. `DELETE` returns 404 in P2 until T27 lands. | 25m | — |
| **T16** | `frontend/src/components/PlaylistHeader.jsx` (new) | Cover-art tile (green→dark-green gradient) with "Pulse" wordmark + `reset · <scope>` sub. Title "Your Pulse Reset", meta line `Sandbox playlist · N songs · M min`, grey `SANDBOX · Not saved to library yet` pill. | Renders like `screen2-sandbox-playlist.html` lines 63-68. | 45m | T1 |
| **T17** | `frontend/src/components/TrackRow.jsx` (new) | 44×44 gradient art, name + artist, kebab icon. Accepts `onKebabPress` callback. | Renders one row indistinguishable from mockup. | 30m | T1 |
| **T18** | `frontend/src/components/WhyThisChip.jsx` (new) | Green-outlined chip "Why this?" + one-line reason below (`nudge.llm_explanation`). | Chip renders under each track. | 15m | T1 |
| **T19** | `frontend/src/components/CoachMark.jsx` (new; reusable) | Rounded panel with a message + optional pointer arrow + "Got it" close chip. Local `useState` for dismissed. | Renders on P2, P3, P4. | 25m | T1 |
| **T20** | `frontend/src/components/TrackActionSheet.jsx` (new) | Bottom sheet with drag handle + track header + destructive "Remove from this reset" + Add to playlist / Share / Go to artist (dumb links). Overlay dims screen behind. Reused in P3. | Kebab tap on any track opens sheet; tapping "Remove" fires callback. | 60m | T17 |
| **T21** | `frontend/src/pages/SandboxPlaylistPage.jsx` (new) | Route `/sandbox/:sessionId`. Compose: `PhoneFrame` > `SpotifyTopBar` + `PlaylistHeader` + play button row + track list (`TrackRow` + `WhyThisChip` per track) + `CoachMark` + `SpotifyBottomNav`. Manages `tracks` local state for optimistic removal. | Nav to `/sandbox/<id>` after accepting a nudge; all 20 tracks visible. | 60m | T2, T6, T7, T15, T16, T17, T18, T19, T20 |
| **T22** | `frontend/src/App.jsx` | Add route `/sandbox/:sessionId` → `SandboxPlaylistPage`. Nudge card's "Try a reset" button in `PulseNudgeCard` now calls `createResetSession` and routes to the returned session ID. | Aanya accepts → routes to her session. | 20m | T21 |
| **T23** | `frontend/src/pages/SandboxPlaylistPage.jsx` | Wire kebab → `TrackActionSheet` → Remove. On Remove: splice track from local state (optimistic), call `removeTrackFromReset`, on error roll back and show toast. | Kebab a track, tap Remove, row disappears immediately. | 45m | T21, T27 |
| **T24** | `backend/mock_data/mock_candidates.json` | Verify: 60 candidates per `scope_origin ∈ {genre, language, era, mood}`. Each candidate has non-empty `llm_explanation` (P2 needs this for `WhyThisChip`). If missing, extend. | Python one-liner counts candidates and asserts explanations non-empty. | 30m | — |
| **T25** | `backend/app/reset_engine.py` | Ensure `create_reset_session()` produces `ResetTrack.llm_explanation` for every track. In mock mode this can be a templated sentence per `scope_origin`; in real mode it comes from Groq. | Run backend, `POST /reset-sessions` for Karthik, inspect response — every track has `why`. | 45m | — |

**Duration:** ~6h frontend + ~1h backend, blocked on **T27** for
the DELETE endpoint (see §13).

**Verification checklist (P2 done):**

- [ ] Accepting the nudge for Aanya routes to `/sandbox/:sessionId`
- [ ] All 20 tracks render with `Why this?` chips
- [ ] The `SANDBOX · Not saved to library yet` pill is visible
- [ ] Tapping a track's kebab opens the bottom sheet
- [ ] "Remove from this reset" splices the row and persists (page reload keeps it gone)

---

## 11. P3 — Now Playing inside sandbox (screen 3)

**Goal.** Make the reset a first-class listening context, not a
modal. The persistent green Pulse Sandbox ribbon keeps the
reversibility promise on-screen even during playback.

**Acceptance gate.** Tapping a track on the Sandbox Playlist routes
to Now Playing; the ribbon shows the correct `days_left` from
`trial_end_date`; the Keep-or-Revert CTA routes to
`/sandbox/:sessionId/outcome`.

### 11.1 Tasks

| ID | Files | Do | Verify | Est. | Deps |
|---|---|---|---|---|---|
| **T30** | `frontend/src/components/PulseSandboxRibbon.jsx` (new) | Green ribbon (`#0F5C2E` fill, `#1DB954` dot). Left: "Pulse Sandbox". Center: `X days left` (accepts `daysLeft` prop). Right: rounded "Keep or Revert" button routing to `/sandbox/:id/outcome`. Reused in P4. | Renders exactly like `screen3-now-playing.html` lines 41-46. | 30m | T1 |
| **T31** | `frontend/src/components/PlayerControls.jsx` (new) | Transport row (shuffle+dot, prev, play/pause, next, repeat). Cosmetic — no real audio playback. | Renders like screen 3. | 30m | T1 |
| **T32** | `frontend/src/pages/NowPlayingPage.jsx` (new) | Route `/sandbox/:sessionId/now-playing/:trackId`. Composes: `PhoneFrame` > down-chevron + "PLAYING FROM PLAYLIST · Your Pulse Reset" + cover art (Pulse wordmark) + track/artist row + progress bar + `PlayerControls` + device row ("This iPhone") + `CoachMark` + `PulseSandboxRibbon`. **No bottom nav** — this is a Now Playing surface. | Nav to `/sandbox/<id>/now-playing/<track>`. Ribbon shows `days_left`. | 60m | T2, T15, T20, T30, T31 |
| **T33** | `frontend/src/pages/SandboxPlaylistPage.jsx` | Wire: tapping a track (or the play button) routes to `NowPlayingPage` for that track. | Clicking a row navigates correctly. | 15m | T32 |
| **T34** | `frontend/src/pages/NowPlayingPage.jsx` | Reuse `TrackActionSheet` for the kebab in the top nav — same "Remove from this reset" behaviour. | Kebab → sheet → Remove works. | 20m | T20, T32 |

**Duration:** ~3h.

**Verification checklist (P3 done):**

- [ ] Now Playing renders with all elements from screen 3
- [ ] Ribbon shows `days_left` from server (not hard-coded)
- [ ] "Keep or Revert" ribbon button routes to the outcome page (P4)
- [ ] Kebab from Now Playing removes the currently-playing track

---

## 12. P4 — Keep or Revert outcome (screen 4)

**Goal.** Show the user a **measured** before → after so the
Keep/Revert decision is evidenced, not vibes-based.

**Acceptance gate.** Outcome page renders real numbers from
`GET /reset-sessions/{id}/outcome` for both eligible personas
(mock-mode fixture is fine); Keep and Revert both return to `/`
with a confirmation toast.

### 12.1 Tasks

| ID | Files | Do | Verify | Est. | Deps |
|---|---|---|---|---|---|
| **T40** | `frontend/src/api/client.js` | Add `getResetOutcome(sessionId)` → `GET /reset-sessions/{id}/outcome` and `decideReset(sessionId, decision)` → `POST /reset-sessions/{id}/decide`. | Both callable from DevTools. `getResetOutcome` returns the shape in `architecture.md` §4.3. | 20m | T28 |
| **T41** | `frontend/src/components/DayPill.jsx` (new) | Green-bordered pill "PULSE RESET · DAY N". Prop `dayIndex`. | Renders as pill on top of outcome page. | 15m | T1 |
| **T42** | `frontend/src/components/OutcomeSummaryCard.jsx` (new) | Card with 3 stat rows (icon + title + sub). Fed from `outcome.tracks_played_count`, `outcome.repeat_plays`, `outcome.artist_search_hits`. Formats repeat-plays as "N tracks became repeat plays" with names comma-joined. | Karthik's card shows 14/20, Munbe Vaa/Vaathi Coming/Yeh Honsla, A.R. Rahman. | 45m | T40 |
| **T43** | `frontend/src/components/DiversityScoreCard.jsx` (new) | Before/after bar chart card. Reads `outcome.before_language_pct` / `outcome.after_language_pct` (or `before_genre_pct` / `after_genre_pct` for Aanya — check `outcome.collapsed_dimension`). Green "up X points" callout. | Karthik shows 19% → 50%, "up 31 points". | 40m | T40 |
| **T44** | `frontend/src/pages/OutcomePage.jsx` (new) | Route `/sandbox/:sessionId/outcome`. Composes: `PhoneFrame` > back-chevron + `DayPill` + "How was your reset?" title + "N days of sandbox listening" sub + `OutcomeSummaryCard` + `DiversityScoreCard` + `CoachMark` (Keep vs Revert copy) + action buttons row. **No bottom nav.** | Nav to outcome page for Karthik; matches screen 4 mockup. | 60m | T2, T41, T42, T43 |
| **T45** | `frontend/src/pages/OutcomePage.jsx` | Wire buttons: **Keep** calls `decideReset(id, 'keep')`, shows toast "Reset kept — 20 tracks saved to your library", routes to `/`. **Revert** calls `decideReset(id, 'revert')`, toast "Sandbox removed — nothing changed in your profile", routes to `/`. | Both branches complete round-trip. | 30m | T40, T44 |
| **T46** | `frontend/src/App.jsx` | Add route `/sandbox/:sessionId/outcome` → `OutcomePage`. | Ribbon CTA lands here. | 10m | T44 |

**Duration:** ~3.5h, blocked on T28.

**Verification checklist (P4 done):**

- [ ] Outcome page renders for both eligible personas with distinct numbers (Karthik: language 19→50; Aanya: genre 22→54)
- [ ] Keep decides + routes home with a toast
- [ ] Revert decides + routes home with a toast
- [ ] Subsequent visits to `/sandbox/:id` show `decision` set (no re-decide)

---

## 13. P5 — Sandbox lifecycle backend ✅ Done (2026-07-04)

**Goal.** Move `ResetSession` from "created on demand" to a
first-class 10-day lifecycle with per-track removal and a real
outcome computation. The frontend blocks on the DELETE endpoint
(T27) around P2 and on the outcome endpoint (T28) around P4, so
**run T26 → T27 and T28 in parallel with P2/P4 rather than after
them**.

**Acceptance gate.** All four Pulse screens render end-to-end
against real endpoints (mock mode is fine); `pytest` stays green
with new tests for the two new endpoints. ✅ **170 tests pass**
(was 157 pre-P5: +3 lifecycle E2E, +5 poll unit tests, +5 already
covered under P2/P4 real-mode file).

**What shipped:**

- **T26 (schema).** `ResetSession` gained `started_at`,
  `outcome_json`, `before_snapshot_id`, `after_snapshot_id`.
  `ResetTrack` gained `removed_at` for soft-delete. New
  `SandboxPlayEvent` table (real-mode only). `db.init_db()` now
  runs additive `ALTER TABLE ADD COLUMN` on boot so existing dev
  DBs pick up the columns without a wipe.
- **T27 (soft-delete refactor).** `DELETE /reset/sessions/{id}/tracks/{track_id}`
  now sets `removed_at = utcnow()` instead of hard-deleting the
  row. `_serialise_session` filters out soft-deleted tracks so the
  frontend sees the row disappear. Rationale: the outcome
  computation needs to know a track was *offered* even if the user
  removed it early.
- **T28 (outcome cache).** `GET /reset/sessions/{id}/outcome` now
  caches its payload into `ResetSession.outcome_json` on the first
  call; subsequent reads short-circuit through the cache. In mock
  mode the source of truth is `mock_outcomes.json`; in real mode a
  `TODO(P6)` marker documents where snapshot-delta compute will
  land.
- **T50 (measured after-score).** `POST /reset/sessions/{id}/decide`
  now prefers the measured post-reset dominance on the collapsed
  axis (`1 - after_language_pct` or `1 - after_genre_pct`) when
  the outcome payload is available; falls back to the
  `before * 0.6` projection otherwise. Karthik keep now reports
  `after_stuck_score = 0.50` (measured) instead of `0.492`
  (projected).
- **T51 (real-mode play polling).** Added
  `spotify_client.fetch_recent_plays_for_polling(user_record)` and
  wired `_poll_sandbox_plays(db, active_sessions)` into the tail of
  the real-mode `/jobs/run-detection` branch. Mock mode is a
  documented no-op. Spotify auth / transport errors are non-fatal
  (logged, per-session skip). Idempotent on repeat polls via a
  `(reset_session_id, spotify_track_id, played_at)` dedup check.
- **T29 (E2E lifecycle test).** `backend/tests/test_reset_lifecycle.py`
  walks create → soft-remove → outcome → decide (keep + revert
  branches) end-to-end for Karthik. Confirms the outcome cache
  short-circuits the second call and that a decision change
  attempt 409s.

### 13.1 Tasks

| ID | Files | Do | Verify | Est. | Deps |
|---|---|---|---|---|---|
| **T26** | `backend/app/models.py`, `backend/app/db.py` | Extend `ResetSession` with `started_at`, `outcome_json`, `before_snapshot_id`, `after_snapshot_id`. Extend `ResetTrack` with `removed_at`. Add `SandboxPlayEvent` table. Update `init_db()` to run non-destructive `ALTER TABLE ADD COLUMN` for existing dev DBs (SQLite is fine with these). | Delete `reset_radar.db`, restart backend, tables + columns exist. `pytest backend/tests/test_models.py -k schema` (add small test). | 60m | — |
| **T27** | `backend/app/routes/reset.py` | Add `@router.delete("/sessions/{session_id}/tracks/{track_id}")`. Behaviour: 404 on unknown session or track; soft-delete by setting `removed_at=utcnow()`; in real mode also `DELETE /playlists/{spotifyPlaylistId}/tracks` with the single URI; idempotent (second DELETE returns 200). | New test file `backend/tests/test_reset_tracks_delete.py` covers all 4 paths. `pytest` green. | 90m | T26 |
| **T28** | `backend/app/routes/reset.py`, `backend/mock_data/mock_outcomes.json` | Add `@router.get("/sessions/{session_id}/outcome")`. Mock mode: read `mock_outcomes.json` keyed by `session.user_id`, return the payload from `architecture.md` §4.3. Real mode: compute from `sandbox_play_events` + snapshot delta (leave a `TODO(P6)` comment for real signal wiring). Cache into `outcome_json` on first call, 15-min TTL in real mode. | New test file `backend/tests/test_outcome_mock_mode.py` asserts Karthik's payload matches the mockup numbers. | 90m | T26 |
| **T29** | `backend/tests/test_reset_lifecycle.py` (new) | Full end-to-end: create session → remove a track → advance clock past `trial_end_date` (freezegun) → fetch outcome → decide (both branches). Repro the demo flow in a single test. | Test passes. | 60m | T26, T27, T28 |
| **T50** | `backend/app/routes/reset.py` (existing `/sessions/{id}/decide`) | Rework `after_stuck_score`: if `outcome_json` populated, return the **measured** number; else fall back to the current projection (`before × 0.6` on keep). | Update `test_reset_flow.py` to cover both branches. | 30m | T28 |
| **T51** | `backend/app/routes/jobs.py` | Add optional `_poll_sandbox_plays()` inside real-mode branch: for each user with an active sandbox, hit `GET /me/player/recently-played` and append rows to `sandbox_play_events`. Skip in mock mode. Non-fatal on Spotify errors (log + continue). | New unit test with a mocked Spotify client; verifies inserts. | 60m | T26 |

**Duration:** ~6.5h. **Do T26 first, then T27 and T28 can be
parallelised.**

**Verification checklist (P5 done):**

- [x] All `backend/tests/` pass under `pytest tests/ -v` — **165 passed** (was 157 pre-P5)
- [x] Every P2/P3/P4 frontend acceptance check still passes end-to-end against the new backend
- [x] `_smoke_wet.py` PASSes after the ADD COLUMN migration — Aanya + Karthik fire, Riya skipped
- [x] Karthik keep round-trip now reports the measured `after_stuck_score = 0.50` instead of the projected `0.492`

---

## 13.5 P5.5 — Save-to-library flow + Screen 2 polish ✅ Done (2026-07-04)

**Goal.** Turn the "Save this playlist" wiring on Screen 3 (kebab)
into a genuine *save-to-library* action, add the same primary CTA
on Screen 2, and surface a persistent home-page card so the
reviewer can Keep or Discard the sandbox with a visible countdown.
Every "saved" flag must reset on refresh so the demo is
repeatable without a DB wipe.

**Acceptance gate.**

1. From Screen 2 or Screen 3, the reviewer can tap the
   subtle-green outlined *+ Save to library* action.
2. A `SavedSandboxCard` appears on Home showing Pulse artwork,
   `N days left`, and two buttons: **Keep** (green) and **Discard**.
3. **Discard** hits `POST /reset/sessions/:id/decide {revert}` and
   clears the card with a toast.
4. **Keep** hits `POST /reset/sessions/:id/decide {keep}` and
   promotes the sandbox to `keptPlaylist`:
   - A *"Your Pulse Reset"* section appears on Home above
     *Made For You*, showing a Pulse-artwork tile with a
     blinking green dot.
   - The bottom-nav Library icon opens `/library` where the
     same kept playlist is pinned; tapping it opens the
     sandbox playlist page.
5. Hard refresh clears both `savedSandbox` and `keptPlaylist`,
   restores the nudge, and re-shows the *+ Save to library*
   button on Screen 2 as unsaved.
6. Screen 2 renders shimmer placeholders while `/reset/sessions/:id`
   is in flight, limits the tracklist to 5 rows by default (bottom
   nav visible without scrolling), the first row's kebab gently
   pulses green + a coach-mark points at it.
7. Screen 2 play button is centered inside a 48px circle and the
   Save pill sits as a subtle secondary CTA.

### 13.5.1 What shipped

- **T55 (context).** New `frontend/src/context/SavedSandboxContext.jsx`
  provider (wrapping `<Routes>` in `App.jsx`). Exposes
  `savedSandbox`, `saveSandbox(session)`, `discardSandbox()`, and
  `isSaved(id)`. State is pure React (no localStorage /
  sessionStorage) so a hard refresh always clears it.
- **T56 (Save CTA on Screen 2).** `PlayRow` in
  `SandboxPlaylistPage.jsx` now shows a filled-green "Save to
  library" pill (Pulse green + Spotify green glow) as the primary
  action to the left of the circular play. Tap → `saveSandbox()`
  → toast → `navigate('/')`. When the same session is already
  saved the pill flips to a muted-green outlined "Saved to
  library" and disables.
- **T57 (Save action on Screen 3).** `NowPlayingPage.jsx`'s
  kebab-sheet "Save this playlist" no longer jumps to the outcome
  page — it calls `saveSandbox()` and routes back to Home. The row
  is hidden once already saved or the session is decided.
- **T58 (SavedSandboxCard).** New
  `frontend/src/components/SavedSandboxCard.jsx` renders on
  `HomePage.jsx` above `PopularAlbums` when the context has an
  entry. Shows scope-gradient artwork, `Your Pulse Reset` +
  `Saved to library` pill, `N days left · tap for details`, and
  a footer action row with Keep / Discard. Keep and Discard both
  call `api.decideReset`, then `discardSandbox()` + toast.
  Tapping the card body opens `/sandbox/:id/outcome` for the
  detailed review.
- **T59 (nudge co-existence).** While a saved sandbox is in the
  context, `PulseNudgeCard` and its coach-mark on Home are
  suppressed so there's a single unambiguous next step. After
  Keep/Discard the nudge returns.
- **T60 (Screen 2 polish).** Play button glyph replaced with an
  SVG triangle (properly centered inside the 56px circle).
  Track-row kebabs became a 36px round button with an SVG 3-dot
  icon; the first visible row's kebab gets a soft green ring while
  the coach-mark is still visible. Coach-mark rewritten as
  `FirstKebabCoach`, positioned right under row 1 with an arrow
  pointing up.
- **T61 (shimmer + 5-row cap).** New `SandboxSkeleton` component
  renders while `/reset/sessions/:id` is loading (uses a global
  `@keyframes pulse-shimmer` added to `styles.css`). Tracklist
  renders `tracks.slice(0, 5)` by default with a "Show all N
  tracks" toggle; this keeps `SpotifyBottomNav` inside the
  phone viewport on first paint.
- **T62 (docs).** `architecture.md` §5.3 component tree updated;
  new §5.6 "Save-to-library flow (SavedSandboxContext)" documents
  provider shape, wiring per screen, and refresh semantics.
  `implementationPlan.md` phase table gains this row.
- **T63 (Keep promotes to library).**
  `SavedSandboxContext` extended with a second slot, `keptPlaylist`,
  and a `keepSandbox()` promoter that atomically moves state
  (2) → (3) after a successful `/decide {keep}` round-trip. Home's
  Keep handler now calls `keepSandbox()` instead of
  `discardSandbox()`; Discard keeps its old wiring.
- **T64 (Your Pulse Reset tile).** New `YourPulseResetSection` on
  `HomePage.jsx` renders above `MadeForYou` when `keptPlaylist` is
  populated. Tile mirrors the *Made For You* single-tile look
  (110×110 gradient artwork + subtitle) with a `pulse-tile-dot`
  blinking green indicator top-right of the artwork. Tap →
  `navigate('/library')`.
- **T65 (Library route + page).** New
  `frontend/src/pages/LibraryPage.jsx` mounted at `/library`.
  Renders `LibraryHeader`, filter chips (`Playlists` active),
  and either `KeptPlaylistRow` (56×56 artwork + blinking dot +
  chevron; tap navigates back to the sandbox playlist page) or
  `EmptyState` (soft CTA back to Home) depending on
  `keptPlaylist`. `SpotifyBottomNav` renders with
  `active="library"`.
- **T66 (bottom-nav routing).** `SpotifyBottomNav.jsx` items
  became actual buttons. Home + Library route to `/` and
  `/library` via `useNavigate`. Search / Premium / Create stay
  decorative (disabled buttons) — routing them would need real
  pages that are out of scope.
- **T67 (blinking-dot CSS).** New
  `@keyframes pulse-tile-dot` in `styles.css` with the
  `.pulse-tile-dot` selector used by both the Home tile and the
  Library row. 1.6s slow opacity + scale pulse; no jitter so the
  tile itself stays calm.
- **T68 (Library carries the Keep/Discard nudge).**
  `LibraryPage` now also renders `SavedSandboxCard` (with the
  same countdown + Keep + Discard controls) when
  `savedSandbox != null`. A new `TrialBanner` sits above the
  card explaining the 10-day trial ("N days left · keep or
  discard before it ends"); it flips to a red "Final call" tint
  when `daysLeft <= 1`. Home + Library share the decision via a
  new `useSandboxDecision({ onSuccess, onError })` hook exported
  from `SavedSandboxContext.jsx`, so tapping Keep or Discard on
  either surface instantly clears the card on the other. The
  hook also owns the busy flag, so the parent page only wires
  toasts and its own local UI.

### 13.5.2 Tasks

| ID | Files | Do | Verify | Est. |
|---|---|---|---|---|
| **T55** | `frontend/src/context/SavedSandboxContext.jsx` (new), `frontend/src/App.jsx` | Add ephemeral React context with `saveSandbox` / `discardSandbox` / `isSaved`; wrap the top-level `<Routes>`. | Provider is imported; `useSavedSandbox()` throws a helpful error when used outside. | 20m |
| **T56** | `frontend/src/pages/SandboxPlaylistPage.jsx` | Replace subtle outlined save pill with a filled-green primary CTA in `PlayRow`; wire `saveSandbox(session)` + toast + `navigate('/')`. | Tap on Screen 2 → toast → home shows `SavedSandboxCard`. | 25m |
| **T57** | `frontend/src/pages/NowPlayingPage.jsx` | Kebab "Save this playlist" path calls `saveSandbox()` and routes to Home instead of `/outcome`. Hide once decided or already saved. | Kebab on Screen 3 saves + routes; sheet row is absent post-save. | 20m |
| **T58** | `frontend/src/components/SavedSandboxCard.jsx` (new), `frontend/src/pages/HomePage.jsx` | Card with Pulse artwork, countdown, Keep/Discard action row. Wire Keep / Discard to `api.decideReset` + `discardSandbox()` + toast. Card body tap → outcome route. | Save on either screen; Home renders card; both buttons decide + clear. | 40m |
| **T59** | `frontend/src/pages/HomePage.jsx` | Hide `PulseNudgeCard` + its coach-mark while `savedSandbox` is populated. | Card + nudge do not co-exist. | 10m |
| **T60** | `frontend/src/pages/SandboxPlaylistPage.jsx` | SVG play triangle centered; 3-dot kebab as an SVG in a 36px round button; first-row highlight ring; rewrite coach-mark to `FirstKebabCoach`. | Play icon visually centered; kebabs clickable and obvious; first row kebab has green ring. | 25m |
| **T61** | `frontend/src/pages/SandboxPlaylistPage.jsx`, `frontend/src/styles.css` | Add `SandboxSkeleton` shimmer component + `@keyframes pulse-shimmer`. Slice tracks to first 5 with "Show all N tracks" toggle. | Loading state shows shimmering placeholder rows; bottom nav visible with only 5 rows visible; toggle reveals rest. | 30m |
| **T62** | `doc/architecture.md`, `doc/implementationPlan.md` | Component tree + new §5.6 in architecture; new row + section here. | Grep for `SavedSandbox` in both docs returns matches. | 20m |
| **T63** | `frontend/src/context/SavedSandboxContext.jsx`, `frontend/src/pages/HomePage.jsx` | Extend the context with `keptPlaylist` + `keepSandbox()` promoter; wire Home Keep handler to call it. Discard keeps `discardSandbox()`. | Keep on Home card → `savedSandbox` clears, `keptPlaylist` populates atomically. | 20m |
| **T64** | `frontend/src/pages/HomePage.jsx` | New `YourPulseResetSection` above `MadeForYou` when `keptPlaylist` is set. Blinking green dot; tap → `navigate('/library')`. | Keep → section appears; refresh removes it. | 25m |
| **T65** | `frontend/src/pages/LibraryPage.jsx` (new), `frontend/src/App.jsx` | Scaffold Library page (header + chips + kept row / empty state). Add `/library` route in `App.jsx`. Tap on kept row → `navigate(/sandbox/:id)`. | Manual: Library tab from bottom nav opens LibraryPage; kept row renders when present; empty state renders otherwise. | 40m |
| **T66** | `frontend/src/components/SpotifyBottomNav.jsx` | Turn nav items into real buttons; Home + Library actually route; disable the other three. | Bottom-nav Home/Library taps navigate; disabled ones don't fire. | 15m |
| **T67** | `frontend/src/styles.css` | Add `@keyframes pulse-tile-dot` + `.pulse-tile-dot` selector shared by Home tile and Library row. | Visual: green dot pulses at ~1.6s cadence. | 10m |
| **T68** | `frontend/src/context/SavedSandboxContext.jsx`, `frontend/src/pages/HomePage.jsx`, `frontend/src/pages/LibraryPage.jsx` | Export `useSandboxDecision` hook; refactor Home to use it; render `TrialBanner` + `SavedSandboxCard` in Library when `savedSandbox` is set; wire Keep/Discard to the same hook. | Manual: tap Keep on Library card → toast + Home card disappears. Tap Discard on Home card → Library card disappears. | 40m |

**Duration:** ~5.2h.

**Verification checklist (P5.5 done):**

- [x] `npm run build` (or Vite HMR log) shows zero errors introduced by this batch.
- [x] `ReadLints` returns clean across `frontend/src/`.
- [x] Manual: Aanya → Try a reset → Screen 2 → *+ Save to library* → Home shows `SavedSandboxCard`.
- [x] Manual: Aanya → Try a reset → Screen 3 kebab → *Save this playlist* → Home shows `SavedSandboxCard`.
- [x] Manual: On Home card, tap **Keep** → toast → card replaced by *Your Pulse Reset* tile above Made For You with a blinking green dot.
- [x] Manual: Tap the *Your Pulse Reset* tile → `/library` opens with the kept playlist pinned + blinking dot on its 56px artwork.
- [x] Manual: After **Save**, open `/library` before deciding → Library also shows the `TrialBanner` + `SavedSandboxCard` with the same countdown and inline Keep/Discard buttons.
- [x] Manual: Tap **Keep** on the Library card → toast + Home's `SavedSandboxCard` also clears + `YourPulseResetSection` appears on Home.
- [x] Manual: Tap **Discard** on the Library card → both surfaces clear simultaneously.
- [x] Manual: Bottom-nav Library icon (from any screen where the nav is visible) opens `/library`.
- [x] Manual: On Home card, tap **Discard** → toast → card disappears; no Library entry created.
- [x] Manual: Refresh at any point → nudge card is back; saved card, *Your Pulse Reset* tile, and Library entry are all gone.
- [x] Manual: Screen 2 with 20 tracks → only 5 rows visible + toggle → bottom nav is visible from first paint; first row kebab pulses green.

---

## 14. P6 — Public deployment + deck link-in

**Goal.** Get Pulse onto a public URL, wire the GitHub Actions
cron at the live backend, and generate the fresh Pulse screenshots
that slides 08/09 reference.

**Acceptance gate.** Public URL loads Pulse on a real phone /
DevTools mobile emulation; three fresh screenshots sit in
`03-research-and-deck/assets/mvp-screenshots/`; slide 9 references
them.

### 14.1 Tasks

| ID | Files | Do | Verify | Est. | Deps |
|---|---|---|---|---|---|
| **T60** | Render (external) | Create a Render web service pointing at `02-mvp/backend`. Build cmd: `pip install -r requirements.txt`. Start cmd: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Attach a 1GB persistent disk mounted at `/data` for SQLite. Env vars: `GROQ_API_KEY`, `SESSION_SECRET_KEY`, `MOCK_MODE=true`, `DATABASE_URL=sqlite:////data/reset_radar.db`, `FRONTEND_ORIGIN=<vercel URL>`. | `curl https://pulse-mvp.onrender.com/health` returns `{"status":"ok"}`. | 45m | — |
| **T61** | Vercel or Cloudflare Pages (external) | Deploy `02-mvp/frontend` static build. Build cmd: `npm run build`. Output: `dist/`. Env: `VITE_API_BASE=https://pulse-mvp.onrender.com`. | Public URL loads and hits Render for `/api/*`. | 30m | T60 |
| **T62** | `02-mvp/backend/app/main.py` | Add the Vercel/CF Pages origin to `allow_origins` in the CORS middleware. | Frontend can call backend without CORS errors. | 15m | T61 |
| **T63** | GitHub repo settings (external) | Set repo secrets: `RESET_RADAR_API_URL=https://pulse-mvp.onrender.com`. Leave `RESET_RADAR_API_TOKEN` empty. Manually trigger `weekly-detection.yml` with `dry_run=true`. | Actions tab shows a green run; artefact `response.json` shows `users_processed: 2, users_skipped: 1, nudges_fired: 2`. | 20m | T60 |
| **T64** | Playwright script (new: `02-mvp/scripts/capture_pulse_frames.mjs`) | Automated capture: iPhone 13 viewport (390×844), 3x DPR. Sequence: home for Aanya → home for Riya → nudge accept → sandbox playlist → now playing → outcome. Output PNGs into `03-research-and-deck/assets/mvp-screenshots/`. | 6 fresh PNGs, no old Reset-Radar screenshots left. | 90m | T61 |
| **T65** | `03-research-and-deck/deck/slides/08-mvp-frames.md`, `09-pitfalls.md` | Reference the new Pulse screenshots; add the "**Pulse also correctly stays quiet**" callout showing Riya's silent home as the third frame. | Regenerate slide preview PNGs; sanity-review in the deck. | 45m | T64 |
| **T66** | `02-mvp/doc/DEMO_SCRIPT.md` | Refresh: 90-second flow now walks Karthik through screens 1-4 on a phone-sized DevTools viewport, then flips to Riya to show the silent home. | Time it: ≤ 90s from cold open. | 30m | T64 |

**Duration:** ~4.5h (of which ~2h are Render/Vercel provisioning
that mostly waits on cloud provisioning).

**Verification checklist (P6 done):**

- [ ] Both public URLs load on a real phone in Chrome + Safari
- [ ] The three new Pulse screenshots are in `03-research-and-deck/assets/mvp-screenshots/`, dated after 2026-07-04
- [ ] Deck slide 9 shows all three screenshots + the Riya "stays quiet" callout
- [ ] Manual GH Actions trigger returns green
- [ ] `DEMO_SCRIPT.md` walks end-to-end in ≤ 90 seconds

---

## 15. Cross-cutting: testing, git, deploy

### 15.1 Testing strategy

| Layer | Tool | Where | When to run |
|---|---|---|---|
| Backend unit tests | `pytest` | `02-mvp/backend/tests/` | Before every backend commit; CI on push |
| Backend smoke test (3 personas) | `python scripts/_smoke_wet.py` | `02-mvp/backend/scripts/` | Before each phase's demo dry-run |
| Frontend lint | `npm run lint` (add eslint config in P1 if missing) | `02-mvp/frontend/` | Pre-commit |
| Frontend build | `npm run build` | `02-mvp/frontend/` | Before pushing to Vercel |
| Manual e2e | DevTools mobile emulation | Browser | End of each phase |
| Full e2e (Playwright) | `capture_pulse_frames.mjs` | P6 only, doubles as screenshot capture | Before recording demo |

**Non-goals for the test suite:** unit tests for every JSX component,
full DOM snapshot tests, or a Cypress harness. The four screens have
strong visual anchors (the mockup HTMLs); manual e2e against those
mockups is faster than maintaining a screenshot-diff test.

### 15.2 Git workflow

- **Branch per phase**: `p1-mobile-shell`, `p2-sandbox-playlist`, etc.
- **Commit rhythm**: one commit per T-task in this document. Commit
  messages: `Pulse P1 T7: SpotifyBottomNav.jsx` (phase + task ID +
  short summary).
- **Merge gate**: PR from phase branch → `main` only after that
  phase's verification checklist is all-green.
- **What NEVER to commit**: `.env`, `reset_radar.db`, `dist/`,
  `node_modules/`, `.venv/`, any `*.log`, `scratch/`. All are in
  `.gitignore` already.

### 15.3 Deploy checklist (one-time at P6)

Run through this once, top to bottom, on the day of the deck demo:

1. [ ] `git status` clean; on `main`
2. [ ] Backend Render service last deploy = today; status green
3. [ ] `curl https://<render-url>/health` → `status=ok, mock_mode=true`
4. [ ] Frontend Vercel/CF deploy = today; status green
5. [ ] Home page loads in DevTools iPhone 13 emulation
6. [ ] `PersonaPickerModal` opens on first visit; all 3 personas render (Aanya + Karthik eligible, Riya marked ineligible); `PersonaBadge` "Change" reopens it
7. [ ] Nudge card visible for Aanya + Karthik
8. [ ] Nudge card absent for Riya
9. [ ] Full flow works for one persona (Karthik) end-to-end in ≤ 90s
10. [ ] `/engine` still loads (in case of Q&A)
11. [ ] GH Actions "Run workflow" (dry_run) completes green
12. [ ] Deck slides 08 + 09 reference the new Pulse screenshots
13. [ ] `DEMO_SCRIPT.md` timing matches your run

---

## 16. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Groq rate-limiting during a live demo (P2, P4) | Medium | High | Mock mode is the default deck path; the "Try a reset" button reads from `mock_candidates.json` and does not call Groq during the mock demo. Real-mode Groq calls only fire when `MOCK_MODE=false`. |
| Spotify API changes between now and demo day | Low | Medium | Mock mode is Spotify-independent. Real-mode wiring (P6) is one env flag away from the demo path. |
| Render free tier cold start (~30-60s on first hit) | High on quiet days | Medium | Ping `/health` from a UptimeRobot cron once every 10 minutes for 24h before the demo. Or upgrade to a paid tier for demo week. |
| SQLite volume loss on Render deploy | Low | Medium | Fixture-driven mock data means a fresh DB is fine — `POST /jobs/run-detection` reconstructs Aanya + Karthik + Riya state on demand. |
| Mobile Safari Flexbox quirks on the phone frame | Medium | Low | Test in DevTools iOS emulation early (T2), don't discover during T14 or T33. |
| GH Action ✗ because `RESET_RADAR_API_URL` unset | Low | Low | The workflow already handles the empty-secret case with a clear log message. Confirmed in P0.5. |
| Reviewer asks "what about Family/Duo plans?" | Medium | Low | Answer: eligibility gate is a metadata check, not a hard-coded string. `mock_users.json` supports any `plan_tier`; today only Individual is used because both interview personas were Individual. |
| Reviewer clicks around before picking a persona and sees a broken home | Low (modal is un-dismissable) | Medium | `PersonaPickerModal` blocks the phone frame until a card is selected (`architecture.md` §5.5). Add `pointer-events: none` on the phone frame while `personaKey === null` for defence-in-depth. |
| Reviewer wants to skip the picker entirely for a screenshot session | Medium | Low | Deep-link `/?viewingAs=aanya\|karthik\|riya` bypasses the modal. Document this in `DEMO_SCRIPT.md` at P6. |

---

## 17. Open questions

Resolve during P1-P5:

1. **Where does the `days_left` counter start counting from** —
   the moment `POST /reset-sessions` returns, or the first time
   the user hits play inside the sandbox? Default: from creation
   (matches how `trial_end_date` works today). Revisit in P5 if
   the demo storytelling needs a "you started listening today"
   framing.
2. **Signal for `artist_search_hits`** in real mode. Spotify's
   Web API has no read-endpoint for a user's search history.
   Proxy signal: an artist appearing in the user's
   `top-artists?time_range=short_term` between `started_at` and
   `now` who was **not** in the same list before the sandbox
   started. Documented as a proxy in the outcome caveat text.
3. **Do we ever call `/audio-features` for real mood** — no. The
   Nov 2024 removal for new apps stands; mood stays a Groq-inferred
   dimension.
4. **Native mobile** — still out of scope. Pulse is a mobile
   *web* surface. The phone frame is a design choice, not an
   iOS/Android build.

---

## 18. Non-goals + where the other docs sit

### 18.1 What this doc does NOT plan

- **Native iOS / Android SDK.** Out of scope. Pulse is mobile *web*
  styled as native — see `architecture.md` §15 non-goals.
- **Multi-user auth beyond the single-tenant demo.** No user
  onboarding flow, no Spotify allow-listing UI, no per-user rate
  limiting. Demo runs against ≤ 25 allow-listed accounts (Spotify
  Dev Mode limit).
- **Real-time push notifications** for the nudge. Nudges are a
  weekly pull from `GET /nudges/latest`, not a server-push. If we
  ever move to native, that changes.
- **Analytics / telemetry.** No Segment, no Mixpanel. Every
  `POST /jobs/run-detection` writes a `JobRun` row and that is our
  audit trail for the demo.

### 18.2 Where the other docs sit

- **Problem framing:** [`problemStatement.md`](./problemStatement.md)
  — root cause + target segment + acceptance gates
- **Architecture (source of truth for system design):**
  [`architecture.md`](./architecture.md)
- **Design source of truth:** [`mockups/`](./mockups/) — the four
  HTML files this plan is built to serve
- **Demo script:** [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) (light
  refresh in P6, not P0)
