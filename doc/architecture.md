# Pulse — architecture (v2, mobile-first)

> **Version note (2026-07-04).** This document is a full rewrite
> aligned to the four mobile mockups now stored in
> [`mockups/`](./mockups/). The problem the MVP answers has not
> changed — see [`problemStatement.md`](./problemStatement.md) —
> but the delivery surface has. Anything the old (Reset Radar)
> architecture said that this file does not restate is no longer
> in force.
>
> Companion docs:
> - [`problemStatement.md`](./problemStatement.md) — **why** Pulse
>   exists (root cause + target segment + success criteria)
> - [`implementationPlan.md`](./implementationPlan.md) — **which
>   phases** and **what to type**, in what order, with a task-level
>   table (Files/Do/Verify/Est./Deps) for every T-task (merged
>   strategic + tactical plan)
> - [`mockups/`](./mockups/) — the four HTML mockups (design source
>   of truth)

---

## 0. Guiding decisions

| Decision | Locked value | Why |
|---|---|---|
| **Brand** | **Pulse** | One-syllable, verb-adjacent, works as a wordmark on cover art (screens 2 & 3). |
| **Form factor** | **Mobile web** rendered inside a 375×812 phone frame | The core promise ("nudge appears where you already listen") is only credible on a mobile Spotify surface. Native app is P6+ territory. |
| **Initiation** | **System-initiated**, weekly | The stuck-loop pain is a *state*, not a *task*. A user-initiated intent box (the abandoned Sonar direction) can't help someone who doesn't yet know they're stuck. |
| **Detection** | Statistical, on Spotify metadata only | Jaccard overlap week-over-week + Shannon entropy across categorical distributions. No `/audio-features` (removed for new apps in Nov 2024). |
| **AI on top** | Groq Llama 3.x, throttled, single-purpose calls | Used **only** for (a) language classification, (b) mood classification, (c) per-track ranking + one-line explanation. Detection math is deterministic. |
| **Reset shape** | 20-track **sandbox** playlist, 10-day trial, Keep-or-Revert decision | Reversibility is the load-bearing feature; the sandbox metaphor makes reversibility legible to the user. |
| **Backend enforcement of the sandbox** | **Not possible on today's public API** — the sandbox is a UX-level guarantee. Named honestly. | Spotify's API does not let a third party exclude listening from the user's model. §12 documents this. |
| **Default demo mode** | `MOCK_MODE=true` | Reviewers can't (and shouldn't have to be) allow-listed. Mock mode ships the whole flow against synthetic fixtures. |

---

## 1. The four screens the architecture serves

Every backend endpoint, every persisted table, every LLM call
exists to serve **one or more of these four screens**. If a
component doesn't map to one of them, it doesn't belong in Pulse
(and it moves to `/engine/*` — see §11).

| # | Screen | Mockup | Backend it depends on | Frontend route |
|---|---|---|---|---|
| 1 | **Home nudge** — mobile Spotify home feed with the Pulse nudge card | *(feed embed, no separate file)* | `GET /nudges/latest?user_id=…` | `/` |
| 2 | **Sandbox Playlist** — 20 tracks, per-track `Why this?` chip, `SANDBOX` pill, 3-dot per-track menu | `mockups/screen2-sandbox-playlist.html` | `POST /reset-sessions` (creates it), `GET /reset-sessions/{id}` (rehydrates), `DELETE /reset-sessions/{id}/tracks/{trackId}` (per-track remove) | `/sandbox/:sessionId` |
| 3 | **Now Playing (in sandbox)** — full mobile player + persistent green Pulse Sandbox ribbon showing `X days left · Keep or Revert` | `mockups/screen3-now-playing.html` | `GET /reset-sessions/{id}` (for ribbon `days_left`), Spotify's own playback (link-out in v1) | `/sandbox/:sessionId/now-playing/:trackId` |
| 4 | **Keep or Revert (Day N)** — outcome stats + measured before/after diversity + Keep/Revert buttons | `mockups/screen4-keep-or-revert.html` | `GET /reset-sessions/{id}/outcome`, `POST /reset-sessions/{id}/decide` | `/sandbox/:sessionId/outcome` |

---

## 2. Detection engine (deterministic, unchanged from R1)

The engine is a pure function of the last 8 weekly snapshots. It
lives in `backend/app/detection.py` and is exercised by
`POST /jobs/run-detection` (weekly cron + manual trigger).

### 2.1 Per-week snapshot

Each Monday's `WeeklySnapshot` row holds, for one user, the
categorical distributions across the four dimensions:

```jsonc
// weekly_snapshots.payload_json
{
  "genre":    {"indie-pop": 0.42, "acoustic": 0.31, ...},   // sums to 1
  "language": {"english": 0.86, "hindi": 0.14},
  "era":      {"2020s": 0.71, "2010s": 0.29},
  "mood":     {"chill": 0.55, "energetic": 0.45}
}
```

Distributions come from:
- **genre** — Spotify artist genre tags, aggregated per track then
  weighted by play count.
- **language** — Groq classification over `(artist, title,
  genre_tags)`, batched for throughput.
- **era** — decade bucket derived from `album.release_date`.
- **mood** — Groq classification over `(genre, title)` (no
  `/audio-features` — that endpoint was removed for new apps in
  Nov 2024).

### 2.2 Per-dimension stuck-score

For dimension `d` in the current week `t`:

```
overlap(d, t)   = jaccard(top15(d, t), top15(d, t-1))    # 0..1
entropy(d, t)   = shannon(distribution_d_t)              # normalised to 0..1
stuck(d, t)     = 0.6 * overlap(d, t) + 0.4 * (1 - entropy(d, t))
```

Where `top15(d, t)` is the top-15 categorical values in dimension
`d` this week. High overlap + low entropy = collapsed axis =
high stuck-score.

### 2.3 Overall + streak + trigger

```
overall(t)          = max(stuck(d, t)) over d ∈ {genre, language, era, mood}
suggested_scope(t)  = argmax_d(stuck(d, t))
streak(t)           = number of consecutive prior weeks with overall(k) > STUCK_THRESHOLD
```

A nudge fires when **all three** are true:
1. `overall(t) > STUCK_THRESHOLD` (default `0.6`)
2. `streak(t) >= STUCK_STREAK_WEEKS - 1` (default `3` → 3 total
   weeks in a row)
3. No nudge shown in the last `COOLDOWN_WEEKS` (default `4`) **and**
   no reset session currently active for this user.

The `Nudge` row is persisted with `overall_stuck_score`,
`suggested_scope`, and `status="pending"`. The frontend polls
`GET /nudges/latest` on home-page load.

---

## 3. Reset engine (deterministic scaffold + one Groq call)

Lives in `backend/app/reset_engine.py`. Invoked by
`POST /reset-sessions`.

### 3.1 Scope → search queries

The user picks (or accepts the suggested) `scope_dimensions`.
For each scope, we build **4 to 6** Spotify search queries with
field filters — **not** `/recommendations` (which was removed
for new apps in late 2024):

- **genre reset**: `genre:"<orthogonal_genre_i>"` over 3–5 genres
  chosen from the *complement* of the user's collapsed genres
- **language reset**: `year:<recent_range>` combined with a set
  of `artist:` seeds chosen from a curated list keyed to the
  target language (Groq-generated, cached per language)
- **era reset**: `year:<opposite_decade>` combined with the
  user's dominant genre (so era diversifies but genre affinity
  is preserved)
- **mood reset**: seed with the top-genre + `year:` recent, then
  Groq re-classifies mood on the raw candidates and we keep only
  the target mood band

Each query is paginated to a cap (default `market="IN"`, 40
tracks per query, deduplicated by `spotify_track_id`) — usually
60–80 raw candidates.

### 3.2 Groq ranking + per-track explanation

One Groq call per session (batched over all candidates):

- **Input:** the scope, the user's own top-artists / top-genres
  as context, and the deduplicated candidate list.
- **Output:** JSON with `[{track_id, score, why}, …]` — score 0–1,
  `why` a single 8–14-word sentence.

We keep the **top 20** by `score`. Every track must have a
non-empty `why` — this is what powers the `Why this?` chip on
screen 2. Empty `why` == acceptance-gate failure at P2.

### 3.3 Real-mode side effects

In real mode (`MOCK_MODE=false`), immediately after ranking:

- `POST /me/playlists` — creates a **private** playlist in the
  user's Spotify account with name "Your Pulse Reset — <scope>"
  and description "20-track sandbox reset by Pulse. Trial ends
  <trial_end_date>."
- `POST /playlists/{id}/items` — adds all 20 track URIs (the
  Feb 2026 `/items` endpoint, not the deprecated `/tracks`).

The Spotify playlist ID is stored on `ResetSession.spotify_playlist_id`.
The user opening this playlist inside Spotify is what makes
screen 3 (Now Playing) work — Pulse doesn't stream audio; it
uses the user's real Spotify app for playback.

In mock mode, no HTTP call is made; the session and 20 tracks
are persisted in SQLite only.

---

## 4. Sandbox lifecycle (new in v2)

The old architecture treated `ResetSession` as "playlist plus a
decision at the end". Pulse treats it as a lifecycle with three
observable phases:

```
    created         playing (0..N days)          decided
      │                    │                        │
      ▼                    ▼                        ▼
POST /reset-sessions   DELETE /...tracks/{id}   POST /decide
                       (per-track remove         { keep | revert }
                        during trial)
                                                    │
                                          + real-mode side effects
                                          (follow artists + save
                                          tracks, or unfollow
                                          playlist)
```

### 4.1 Days-left math

The Pulse Sandbox ribbon on screens 3 and 4 shows a live
countdown. `days_left` is computed on the server whenever the
frontend rehydrates a session:

```
days_left = ceil((trial_end_date - now) / 86400 seconds)   # clamped to [0, TRIAL_WINDOW_DAYS]
```

Where `trial_end_date = created_at + timedelta(days=TRIAL_WINDOW_DAYS)`
and `TRIAL_WINDOW_DAYS` defaults to `10`.

### 4.2 Per-track removal

Screen 2 exposes a 3-dot menu per track. Screen 3's bottom-sheet
does the same for the currently-playing track. Both post to:

```
DELETE /reset-sessions/{id}/tracks/{trackId}
```

Effects:
- Mark the `ResetTrack` row as removed (soft-delete via a
  `removed_at` timestamp — we keep the row for outcome
  attribution).
- Real mode only: `DELETE /playlists/{playlistId}/tracks` with
  the single URI (canonical Spotify endpoint for removing items
  from a playlist).
- The frontend does an optimistic hide + refetch.

**Removal never triggers Groq re-ranking.** The v1 rule is: the
20 tracks Pulse chose are the 20 the user got; if they remove
one, they end up with 19, and that's fine.

### 4.3 Outcome (Day N ≥ 3)

The outcome endpoint returns the five numbers screen 4 needs:

```
GET /reset-sessions/{id}/outcome
→ {
    "session_id": "...",
    "day_index": 10,
    "tracks_played_count":  { "played": 14, "total": 20 },
    "repeat_plays":         [ {"title": "Munbe Vaa", "artist": "A.R. Rahman", "plays": 6}, ... ],
    "artist_search_hits":   [ {"artist": "A.R. Rahman", "source": "search_history_proxy"} ],
    "before_language_pct":  0.19,
    "after_language_pct":   0.50,
    "diversity_delta_pts":  31,
    "collapsed_dimension":  "language",
    "computed_at":          "..."
  }
```

- **Mock mode:** deterministically read from
  `backend/mock_data/mock_outcomes.json` — one row per persona
  (Aanya's genre-stuck outcome, Karthik's language-stuck
  outcome matching the numbers on screen 4).
- **Real mode:** computed from the delta between the pre-sandbox
  weekly snapshot (`ResetSession.before_snapshot_id`) and a
  freshly-computed snapshot at `computed_at`. See §4.4 for the
  per-metric signal sources.

### 4.4 Where each outcome number comes from (real mode)

| Metric | Signal source | Notes |
|---|---|---|
| `tracks_played_count.played` | Union over `GET /me/player/recently-played` (multiple paginated calls between `started_at` and `computed_at`), filtered to tracks in `reset_tracks` | Spotify only stores ~50 recently-played entries at a time, so we poll during the sandbox and persist play events in a new `sandbox_play_events` table (see §7) |
| `tracks_played_count.total` | `count(reset_tracks where reset_session_id = ...)` | Excludes removed tracks |
| `repeat_plays` | Same source, grouped by `spotify_track_id`, filtered to `plays >= REPEAT_PLAY_THRESHOLD` (default `3`) | Sorted by plays desc, top 5 |
| `artist_search_hits` | **Proxy** — artists present in `GET /me/top/artists?time_range=short_term` at `computed_at` **but not** in the same list at `started_at`, restricted to artists appearing on the sandbox playlist | Documented as a proxy on the outcome card copy; Spotify does not expose user search history |
| `before_language_pct` | `payload_json["language"]` of the pre-sandbox snapshot, taking `1 - max(distribution)` (higher = more diverse) | For screen 4's Karthik example: max was 0.81 Telugu → before_pct = 0.19 |
| `after_language_pct` | Same formula on a freshly-computed post-sandbox snapshot | Screen 4 example: max drops to 0.50 → after_pct = 0.50 |

### 4.5 Decision handler

```
POST /reset-sessions/{id}/decide
Body: { "decision": "keep" | "revert" }
```

- **Keep** (real mode):
  1. `GET /tracks?ids=<20 URIs>` → collect unique artist IDs.
  2. `PUT /me/following?type=artist&ids=<artist_ids>` — follow
     everyone on the sandbox playlist.
  3. `PUT /me/tracks?ids=<track_ids>` — save the 20 tracks so
     they survive playlist deletion.
  4. Update `ResetSession.decision = "keep"`, `decided_at = now`.
- **Revert** (real mode):
  1. `DELETE /playlists/{playlistId}/followers` — canonical
     Spotify pattern to remove a playlist (there is no
     `DELETE /playlists`).
  2. Update `ResetSession.decision = "revert"`, `decided_at = now`.
  3. Optionally record the outcome so the diversity delta
     survives even though the playlist is gone.
- **Both**: return the user to `/` with a confirmation toast; the
  home page's nudge slot reverts to "no nudge yet — next check
  Monday".

---

## 5. Frontend architecture

### 5.1 Route map

| Path | Component | Purpose |
|---|---|---|
| `/` | `HomePage` (mobile Spotify home) | Screen 1 — Pulse nudge card embedded in a Spotify-like feed |
| `/sandbox/:sessionId` | `SandboxPlaylistPage` | Screen 2 |
| `/sandbox/:sessionId/now-playing/:trackId` | `NowPlayingPage` | Screen 3 |
| `/sandbox/:sessionId/outcome` | `OutcomePage` | Screen 4 |
| `/engine` | `Dashboard` (rehomed) | Internal diagnostics — chart + last-run card + mode switch. Not part of the Pulse UX. |
| `/engine/runs` | `RunsPage` (rehomed) | Internal — per-run 4-step trace |

### 5.2 The `PhoneFrame` shell

Every Pulse route (`/`, `/library`, `/sandbox/*`) renders inside
a shared mobile chrome:

```
frontend/src/components/PhoneFrame.jsx
├── outer 375×812 rounded-corner phone body (matches mockups)
├── SpotifyBrandBar          ← 44px strip, green Spotify mark + "Spotify" wordmark
│                              on the left, small "PULSE" pill on the right.
│                              Same bar on every screen so the demo reads as one
│                              cohesive product. (Replaces the earlier fake iOS
│                              status bar with 9:41 + wifi/signal/battery icons,
│                              which was decorative noise for a web demo.)
├── {children}                                ← the page (scrollable)
└── (optional) Spotify-style bottom nav (Home / Search / Library / Premium / Create)
```

The Spotify mark itself lives in the reusable
`frontend/src/components/SpotifyWordmark.jsx` component (also
used inside `PersonaPickerModal` at the top of the first-load
sheet), so the brand mark on the persona picker matches the one
on every in-app screen.

`/engine` and `/engine/runs` do **not** use `PhoneFrame` — those
are desktop diagnostic surfaces.

### 5.3 Component tree by screen

```
HomePage
├── PersonaPickerModal        (full-screen overlay, opens if no persona chosen — see §5.5)
├── PersonaBadge              (compact top-right pill "Viewing as: X · Change", outside the frame)
├── PhoneFrame
│   ├── SpotifyTopBar         (avatar pill, nav arrows)
│   ├── SavedSandboxCard      ← rendered when SavedSandboxContext is populated (see §5.6)
│   │                            Pulse artwork + "N days left" + inline Keep / Discard buttons
│   ├── Greeting              ("Good evening, <display_name>")
│   ├── PulseNudgeCard        ← loads GET /nudges/latest; hidden while SavedSandboxCard is shown
│   ├── RecentlyPlayedGrid    (6 gradient tiles, decorative, persona-themed)
│   └── SpotifyBottomNav

SandboxPlaylistPage
├── PhoneFrame
│   ├── SpotifyTopBar (back arrow, search, kebab)
│   ├── SandboxSkeleton       (shimmer placeholders while /reset/sessions/:id is in flight)
│   ├── PlaylistHeader        (Pulse cover art + "SANDBOX" pill + meta)
│   ├── PlayRow               ← BIG green "Save to library" pill (primary CTA) + circular Play SVG
│   ├── TrackList
│   │   └── TrackRow          (name, artist, art, high-contrast SVG kebab)
│   │       └── WhyThisChip   ("Why this?" + reason)
│   │   └── "Show all N tracks" toggle  (visible when tracks.length > 5)
│   ├── FirstKebabCoach       ("Tap the highlighted 3-dots …" — first row kebab gets a green ring)
│   └── SpotifyBottomNav
└── TrackActionSheet          (bottom sheet, opens on kebab)
    └── "Remove from this reset" (destructive) + Add / Share / Go to artist

NowPlayingPage
├── PhoneFrame
│   ├── PlayerTopBar          (left chevron, "PLAYING FROM PLAYLIST" + "Your Pulse Reset", kebab)
│   ├── CoverArt              (Pulse wordmark)
│   ├── TrackRow              (name + artist + heart)
│   ├── ProgressBar
│   ├── TransportControls     (shuffle, prev, play, next, repeat)
│   ├── DeviceRow             ("This iPhone")
│   ├── TopKebabCoach         ("Tap the 3 dots to save this playlist …")
│   └── PulseSandboxRibbon    ← reads days_left from server
└── TrackActionSheet          (reused from SandboxPlaylistPage)
    └── "Save this playlist" → saveSandbox() + route back to Home  (see §5.6)

OutcomePage
└── PhoneFrame
    ├── DayPill               ("PULSE RESET · DAY N")
    ├── PageHeader            ("How was your reset?" + sub)
    ├── OutcomeSummaryCard    ← 3 stat rows from GET /reset-sessions/:id/outcome
    ├── DiversityScoreCard    ← before/after bars + "up N pts" callout
    ├── CoachMark             (Keep vs Revert copy)
    └── ActionButtons         (Keep · Revert)
```

### 5.4 State + data flow

- **API client:** `frontend/src/api/client.js` — thin `fetch`
  wrapper with `credentials: 'include'`, `VITE_API_BASE`, and one
  function per endpoint. No global store; every page owns its
  own `useEffect` fetches.
- **Persona state:** `usePersona()` hook resolves the active
  persona in this priority order:
  1. `?viewingAs=aanya|karthik|riya` URL query parameter
  2. `localStorage["pulse.persona"]` from a previous session
  3. **null** — no persona chosen, triggers `PersonaPickerModal`
     on `HomePage` mount
  The hook exposes `{ personaKey, personaId, setPersona,
  clearPersona }`. `setPersona("karthik")` updates both the URL
  and localStorage; `clearPersona()` reopens the picker.
- **Optimistic removal:** `SandboxPlaylistPage` maintains its
  own local `tracks` array; on remove it splices immediately and
  fires the DELETE, rolling back if the request fails.

### 5.5 Persona picker (first-load chooser)

**Why it exists.** Pulse is a mobile Spotify-embedded surface. In
production, "who is signed in" is answered by Spotify's own auth.
For the deck-day mock-mode demo, three personas are pre-seeded
(§10 and `mock_users.json`) and the reviewer needs an explicit,
frictionless way to pick which one they're viewing as. A passive
toggle row is too easy to miss; a mandatory picker on first load
is honest ("this is a demo, pick a character") and self-
explanatory.

**When it appears.**

| Situation | Modal state |
|---|---|
| First-ever load of `/` in this browser | **Open**, blocking. No persona chosen yet, so no nudge or home body renders behind it (the phone frame is dimmed). |
| Subsequent loads after picking a persona | **Closed.** `localStorage["pulse.persona"]` remembers the choice; `PersonaBadge` in the top-right shows "Viewing as: Karthik · Change". |
| User clicks "Change" on `PersonaBadge` | **Open.** Same modal, same three cards. |
| URL has `?viewingAs=<key>` | **Closed.** Query param wins over localStorage (so shareable demo links skip the picker). |

**What it renders.** Full-viewport dark overlay (`rgba(0,0,0,0.85)`)
sitting *outside* the `PhoneFrame` — it's clearly a demo-only
meta-UI, not part of the Spotify experience. Contents:

- **Title.** *"Choose a demo persona"*
- **Sub.** *"Pulse is a mobile-only prototype. In production, you
  are whoever is signed into Spotify. Pick a character to see how
  Pulse behaves for that user."*
- **Three cards** — one per row from `GET /users`. For each:
  - `avatar_initial` (A / K / R) inside a green circle
  - `display_name`, `age`, `location`, `role`
  - Plan pill: **Premium Individual** (green) or **Free** (grey)
  - Tenure: `X months`
  - Signature quote (eligible personas) or `why_ineligible` text
    (Riya)
  - Right-hand tag: **Fits target segment** (green tick) or
    **Free tier — Pulse stays silent** (grey mute icon)
- **Small footer.** *"You can change this any time from the badge
  in the top-right."*

Selecting a card calls `setPersona(<key>)` and dismisses the
modal. There is no explicit close button — the choice is
required. (Corner-case: if `GET /users` fails, the modal shows a
"Backend unavailable — retry" state instead of dismissing.)

**Component tree.**

```
PersonaPickerModal
├── Overlay                 (dark, click-through disabled)
├── Card                    (rounded, dark surface, centred)
│   ├── Title + Sub
│   ├── PersonaOptionRow    × 3
│   │   ├── AvatarCircle
│   │   ├── PersonaMeta     (name, age, location, role)
│   │   ├── PlanPill + TenureLabel
│   │   ├── QuoteOrIneligibleCopy
│   │   └── EligibilityTag  (green tick | grey mute)
│   └── Footer copy
```

**Component tree — badge.**

```
PersonaBadge                 (fixed top-right, outside PhoneFrame)
├── AvatarCircle (small)
├── "Viewing as: <display_name>"
└── "Change" chevron         ← onClick: clearPersona()
```

**No new backend endpoint.** `PersonaPickerModal` reads
`GET /users` (already returning the enriched roster with
`plan`, `tenure_months`, `eligible_for_pulse`, `signature_quote`,
`why_ineligible` — see §6.2). Nothing else changes on the
backend for this feature.

### 5.6 Save-to-library flow (SavedSandboxContext)

**Why it exists.** The backend has always been the source of
truth for what a `ResetSession` contains, but the demo needs a
distinction between four UX states that the DB doesn't natively
model:

1. **Sandbox exists as a preview** — user tapped *Try a reset*
   on the Home nudge card. `ResetSession` row created but the
   playlist is not "in the user's library" yet.
2. **User explicitly saved it** — Screen 2's *Save to library*
   button OR Screen 3's kebab *Save this playlist* action was
   tapped. The sandbox now appears on Home as a persistent
   `SavedSandboxCard` with a countdown and inline Keep / Discard
   buttons.
3. **User tapped Keep** — the /decide endpoint fires with
   `keep`; the saved card is replaced by a persistent
   *"Your Pulse Reset"* tile on Home (right above Made For You)
   and a matching entry in the Library tab. A small green dot
   blinks on both surfaces so the "new library entry" is
   visible at a glance.
4. **User tapped Discard** — /decide fires with `revert`, the
   card disappears, and nothing else changes on the Home page.

Modelling states (2) and (3) in the DB would make
refresh-repeatable demos painful: a reviewer walking through
the flow multiple times would find stale library entries from
previous runs. So we keep both flags purely in React state
(`SavedSandboxContext`,
`frontend/src/context/SavedSandboxContext.jsx`) that lives above
the Route tree. It survives navigation
Home ↔ Sandbox ↔ Now Playing ↔ Outcome ↔ Library, but any hard
refresh resets both to `null` — reviewers get a clean slate
every reload without touching the backend.

**Shapes.**

```js
savedSandbox = null | {
  sessionId,          // ResetSession.id
  savedAt,            // Date - drives the countdown display
  trialEndDate,       // Date - from ResetSession.trial_end_date
  scopeDimensions,    // e.g. ['language'] - for card artwork
  trackCount,         // integer - for the "20 songs" subtitle
}

keptPlaylist = null | {
  sessionId,          // preserved from savedSandbox
  keptAt,             // Date - when Keep was tapped
  trialEndDate,       // preserved
  scopeDimensions,    // preserved for artwork
  trackCount,         // preserved
}
```

**Provider surface.**

```js
const {
  savedSandbox, keptPlaylist,
  saveSandbox, discardSandbox, keepSandbox, clearKeptPlaylist,
  isSaved, isKept,
} = useSavedSandbox();
```

- `saveSandbox(session)` — called from Screen 2 (Save button)
  or Screen 3 (kebab). Stores the sandbox metadata in context
  and toasts. **No backend call.**
- `discardSandbox()` — clears `savedSandbox`. Called on Discard
  or when the user wants to un-save without deciding.
- `keepSandbox()` — promotes the current `savedSandbox` into
  `keptPlaylist` (with a fresh `keptAt`) and nulls
  `savedSandbox`. Called after a successful `POST
  /reset/sessions/:id/decide {decision: keep}`.
- `clearKeptPlaylist()` — reserved for a future "remove from
  library" action; unused today.
- `isSaved(sessionId)` / `isKept(sessionId)` — helpers used by
  the screens to dim their Save affordance once the same
  session is already saved / kept.

The context module also exports a companion hook
`useSandboxDecision({ onSuccess, onError })` that wraps the
`POST /reset/sessions/:id/decide` round-trip and the context
transition into a single `decide('keep' | 'revert')` call.
`HomePage` and `LibraryPage` both instantiate it; a decision
tapped from either surface instantly clears the
`SavedSandboxCard` on the other because they share the same
context slot.

**Where each action wires up.**

| Trigger | Behaviour |
|---|---|
| Screen 2: *Save to library* (outlined green pill) | `saveSandbox(session)` → toast → `navigate('/')` |
| Screen 3: kebab → *Save this playlist* | `saveSandbox(session)` → toast → `navigate('/')` |
| Home: `SavedSandboxCard` tap-body | `navigate(/sandbox/:id/outcome)` — full outcome page |
| Home: `SavedSandboxCard` **Keep** button | `useSandboxDecision → decide('keep')` → `POST /reset/sessions/:id/decide {keep}` → `keepSandbox()` → toast |
| Home: `SavedSandboxCard` **Discard** button | `useSandboxDecision → decide('revert')` → `POST /reset/sessions/:id/decide {revert}` → `discardSandbox()` → toast |
| Home: *"Your Pulse Reset"* tile tap | `navigate('/library')` |
| SpotifyBottomNav → Library icon | `navigate('/library')` |
| SpotifyBottomNav → Home icon | `navigate('/')` |
| Library: `TrialBanner` + `SavedSandboxCard` (renders when `savedSandbox != null`) | Same wiring as the Home card via the shared `useSandboxDecision` hook — Keep/Discard on either surface mutates the same slot |
| Library: kept playlist row tap | `navigate(/sandbox/:id)` — back to Screen 2 |

**Refresh semantics.**

- Frontend: any reload wipes React state → the Home card,
  the *"Your Pulse Reset"* tile, and the Library entry all
  disappear. Screen 2's *Save to library* pill reverts to
  its unsaved appearance.
- Backend: the `ResetSession` row (and its `ResetTrack` rows)
  are intentionally left intact — the nudge stays `pending`
  through the sandbox lifecycle, so a refresh cleanly returns
  the reviewer to the "your Pulse card is calling out X"
  starting state on Home. Old sessions linger in SQLite but
  are invisible to the UI.

**Component trees.**

```
SavedSandboxCard             (renders when savedSandbox != null)
├── PulseArtwork             (scope-dimension gradient, "Pulse" wordmark)
├── Meta
│   ├── Title                ("Your Pulse Reset")
│   ├── SavedPill            ("Saved to library", green outline)
│   ├── Subtitle             ("N songs · sandbox trial")
│   └── CountdownRow         (green dot + "N days left · tap for details")
└── ActionRow                (borderTop)
    ├── KeepButton           (primary, filled Pulse green)
    └── DiscardButton        (secondary, grey outline)

YourPulseResetSection        (renders when keptPlaylist != null, above MadeForYou)
├── SectionHeader            ("Your Pulse Reset")
└── PlaylistTile             (button, onClick → navigate('/library'))
    ├── PulseArtwork         (scope-dimension gradient, "Pulse" wordmark)
    ├── BlinkingGreenDot     (top-right, .pulse-tile-dot keyframe)
    ├── Title                ("Your Pulse Reset")
    └── Subtitle             ("N tracks · kept in library")

LibraryPage                  (route /library)
└── PhoneFrame
    ├── LibraryHeader        (avatar + "Your Library" + search + create)
    ├── FilterChips          (Playlists · Artists · Albums)
    ├── TrialBanner          (present when savedSandbox != null; green tint
    │                         normally, red on the final day; "N days
    │                         left · keep or discard before it ends")
    ├── SavedSandboxCard     (present when savedSandbox != null; shared with
    │                         Home; Keep + Discard call useSandboxDecision)
    ├── KeptPlaylistRow      (present when keptPlaylist != null)
    │   ├── PulseArtwork     (56x56, blinking dot)
    │   ├── Meta             ("Your Pulse Reset" · "Playlist · N tracks · Kept")
    │   └── ChevronRight
    ├── EmptyState           (present when BOTH slots are null; CTA back to Home)
    └── SpotifyBottomNav     (active="library")
```

---

## 6. Backend architecture

### 6.1 Process layout

```
backend/
├── app/
│   ├── main.py               # FastAPI app + CORS + init_db()
│   ├── config.py             # pydantic-settings (.env reader)
│   ├── db.py                 # SQLAlchemy engine + session factory + Base
│   ├── models.py             # ORM tables + Pydantic wire shapes
│   ├── detection.py          # §2 formulas (deterministic)
│   ├── reset_engine.py       # §3 candidates + Groq rank
│   ├── llm_client.py         # throttled Groq wrapper
│   ├── spotify_client.py     # mock-first Spotify wrapper
│   └── routes/
│       ├── nudges.py         # GET /nudges/latest, POST /nudges/{id}/respond
│       ├── reset.py          # POST /reset-sessions, GET /reset-sessions/{id},
│       │                     # DELETE /reset-sessions/{id}/tracks/{trackId},
│       │                     # GET /reset-sessions/{id}/outcome,
│       │                     # POST /reset-sessions/{id}/decide
│       ├── jobs.py           # POST /jobs/run-detection, GET /jobs/runs/*
│       ├── auth.py           # OAuth Authorization Code + PKCE (real mode only)
│       └── dashboard.py      # GET /scores/history — powers /engine only
├── mock_data/
│   ├── mock_users.json       # 3-persona roster (Aanya, Karthik, Riya) + eligibility metadata
│   ├── synthetic_weeks.json  # 8 weeks × eligible + 4 weeks × Riya, for detection
│   ├── mock_candidates.json  # 240 candidates (60 per scope) for reset_engine
│   └── mock_outcomes.json    # Per-persona screen-4 numbers (eligible personas only)
└── tests/                    # pytest, one file per route module
```

### 6.2 Endpoint surface (v2)

| Verb | Path | Screen | Purpose |
|---|---|---|---|
| `GET`  | `/health` | — | Liveness (returns `{"ok": true, "mode": "mock" \| "real"}`) |
| `GET`  | `/users` | 1 (persona toggle) | Persona roster + eligibility metadata (`plan`, `tenure_months`, `eligible_for_pulse`, `why_ineligible`, …). Sorted eligible-first. Union of `mock_users.json` and DB users. |
| `GET`  | `/nudges/latest?user_id=…` | 1 | Latest `pending` nudge for user, or `null` (returns `null` for ineligible users like Riya since detection never wrote a nudge for them) |
| `POST` | `/nudges/{id}/respond` | 1 | Body `{action: accept \| dismiss}`; accept returns a `ResetSession` |
| `POST` | `/reset-sessions` | 1→2 | Body `{user_id, scope_dimensions, free_text_intent?}`; runs §3 candidate gen + Groq rank; in real mode creates the Spotify playlist |
| `GET`  | `/reset-sessions/{id}` | 2, 3 | Rehydrates the session incl. `days_left`, live track list |
| `DELETE` | `/reset-sessions/{id}/tracks/{trackId}` | 2, 3 | Per-track remove; real mode also `DELETE`s from the Spotify playlist |
| `GET`  | `/reset-sessions/{id}/outcome` | 4 | See §4.3 payload |
| `POST` | `/reset-sessions/{id}/decide` | 4 | Body `{decision: keep \| revert}`; §4.5 side effects |
| `POST` | `/jobs/run-detection` | — | Full detection pass over all users; cron + manual |
| `GET`  | `/jobs/runs`, `/jobs/runs/last`, `/jobs/runs/{id}` | `/engine` only | Diagnostic trace (R8 legacy) |
| `GET`  | `/scores/history?user_id=…` | `/engine` only | Fuels the chart at `/engine` |
| `GET`  | `/auth/login`, `/auth/callback`, `/auth/me`, `/auth/logout` | (real mode) | Authorization Code + PKCE |

### 6.3 What changed vs. Reset Radar v1

| Endpoint | v1 | v2 |
|---|---|---|
| `POST /reset-sessions` | Returned `trial_end_date` but nothing else lifecycle-shaped | Same, plus responds with `days_left` and `spotify_playlist_id` so screen 2 has everything it needs on first paint |
| `GET /reset-sessions/{id}` | Existed | Adds `days_left` (server-truth), a `removed_at` flag on each `ResetTrack`, and the outcome-so-far preview |
| `DELETE /reset-sessions/{id}/tracks/{trackId}` | Did not exist | **New** — see §4.2 |
| `GET /reset-sessions/{id}/outcome` | Did not exist (outcome was a projection embedded in `/decide`) | **New** — see §4.3, powers screen 4 |
| `POST /reset-sessions/{id}/decide` | Existed, returned projected `after_stuck_score` | Same signature, but `after_stuck_score` is measured from the outcome computation when available |

Everything else — auth, detection job, mode switch, `/engine/*` —
is preserved verbatim from R4-R8.

---

## 7. Database (SQLite, one file per env)

Same 7 tables as R8 plus two additive changes and one new table
for sandbox play-event capture.

### 7.1 Tables

| Table | Row semantics |
|---|---|
| `users` | One row per Spotify account (mock-mode personas are pre-seeded with static IDs) |
| `weekly_snapshots` | One row per (user × ISO week) — distribution JSON |
| `stuck_scores` | One row per (user × ISO week) — per-dimension + overall + suggested_scope |
| `nudges` | One row per fired nudge; `status` in {pending, accepted, dismissed, expired} |
| `reset_sessions` | One row per accepted nudge, extended per §7.2 |
| `reset_tracks` | 20 rows per session (some may be `removed_at != NULL` post-P5) |
| `sandbox_play_events` | **NEW** — one row per real-mode `recently_played` poll hit for a track that is in an active sandbox |
| `job_runs` | R8 diagnostic row per `POST /jobs/run-detection` call |

### 7.2 `reset_sessions` — additive changes vs. R8

Added columns:

- `started_at DATETIME NOT NULL DEFAULT (created_at)`
- `outcome_json JSON NULL` — cached copy of §4.3 payload, refreshed
  by the outcome endpoint (cache TTL 15 min in real mode, forever
  in mock mode)
- `before_snapshot_id VARCHAR NULL FK weekly_snapshots.id` — the
  snapshot that fired the nudge; anchors the "before" diversity number
- `after_snapshot_id VARCHAR NULL FK weekly_snapshots.id` — the
  post-sandbox snapshot; populated on first outcome fetch

Existing columns retained: `id, user_id, nudge_id,
scope_dimensions_json, free_text_intent, spotify_playlist_id,
trial_end_date, decision, before_stuck_score, after_stuck_score,
created_at, decided_at`.

### 7.3 `reset_tracks` — additive changes

- `removed_at DATETIME NULL` — soft-delete timestamp; a track with
  `removed_at IS NOT NULL` is excluded from `days_left`/outcome
  computation but retained for auditability.

### 7.4 `sandbox_play_events` — new table

```
id                 STRING  PK
reset_session_id   STRING  FK reset_sessions.id
spotify_track_id   STRING  (from reset_tracks.spotify_track_id)
played_at          DATETIME
ingested_at        DATETIME  default now
```

Populated by a small poller inside the weekly `/jobs/run-detection`
call (or manually with `POST /jobs/poll-play-events`) that walks
`GET /me/player/recently-played` for each user with an active
sandbox. Only rows whose `track_id` is in an active sandbox are
persisted — everything else is ignored.

### 7.5 Migration path from R8

Because SQLite is fine with `ALTER TABLE ADD COLUMN`, migration
is one `db.py` bootstrap block:

1. `ALTER TABLE reset_sessions ADD COLUMN started_at DATETIME`
2. `ALTER TABLE reset_sessions ADD COLUMN outcome_json JSON`
3. `ALTER TABLE reset_sessions ADD COLUMN before_snapshot_id VARCHAR`
4. `ALTER TABLE reset_sessions ADD COLUMN after_snapshot_id VARCHAR`
5. `ALTER TABLE reset_tracks ADD COLUMN removed_at DATETIME`
6. `CREATE TABLE IF NOT EXISTS sandbox_play_events (...)`

No destructive migration; the deleted `reset_radar.db` file from
P0 is regenerated on first boot in v2 shape.

---

## 8. Configuration

`backend/.env` (v2 shape):

```dotenv
# LLM
GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-70b-versatile

# Mode
MOCK_MODE=true                        # true for the deck demo; flip for real Spotify

# Spotify (only needed when MOCK_MODE=false)
SPOTIFY_CLIENT_ID=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8000/auth/callback
SESSION_SECRET_KEY=...                # python -c "import secrets;print(secrets.token_urlsafe(48))"

# Frontend origin for CORS
FRONTEND_ORIGIN=http://127.0.0.1:5173

# Detection tuning (safe defaults)
STUCK_THRESHOLD=0.6
STUCK_STREAK_WEEKS=3
COOLDOWN_WEEKS=4
TRIAL_WINDOW_DAYS=10
REPEAT_PLAY_THRESHOLD=3

# Optional
JOBS_API_TOKEN=                       # empty = unauthenticated (fine for single-tenant demo)
```

`config.py` reads via pydantic-settings; `settings.mock_mode`,
`settings.trial_window_days`, etc. are the accessors used across
the app.

---

## 9. Weekly job (cron)

Unchanged from R8. `.github/workflows/weekly-detection.yml`
fires Mondays 09:00 UTC and manually via `workflow_dispatch`:

```
0 9 * * 1  →  POST $RESET_RADAR_API_URL/jobs/run-detection
              Authorization: Bearer $RESET_RADAR_API_TOKEN
              body: {}
```

For each user with `access_token`:
1. `GET /me/top/tracks?time_range=short_term`
2. `GET /me/player/recently-played`
3. `GET /me/tracks` (saved library)
4. Compute weekly snapshot → append to `weekly_snapshots`
5. Compute stuck-scores → append to `stuck_scores`
6. Fire `Nudge` if trigger rule passes
7. **NEW in v2:** for each user with an active sandbox, poll
   `recently-played` again and append `sandbox_play_events`
   rows for anything matching a track in the sandbox

The response JSON is uploaded as a 30-day artefact and rendered
as a Markdown summary on the Actions run.

---

## 10. Mock mode (the deck-day default)

Mock mode is the load-bearing configuration for the deck. It
means:

- **`spotify_client.py`** returns fixture data from
  `mock_data/synthetic_weeks.json` and never calls Spotify. Zero
  auth requirements.
- **`reset_engine.py`** in mock mode reads candidates from
  `mock_data/mock_candidates.json` (60-80 tracks keyed by
  `(scope, persona)`), then still calls Groq for the top-20
  ranking + `why` — because that's the load-bearing "AI is
  necessary" claim from `problemStatement.md` §3.
- **Outcome endpoint** in mock mode reads pre-baked persona
  outcomes from `mock_data/mock_outcomes.json` — numbers chosen
  to match the screen-4 mockup (Karthik: language 19% → 50%,
  14/20 played, 3 repeat plays including Munbe Vaa / Vaathi
  Coming / Yeh Honsla, A.R. Rahman in search history).
- **Per-track removal** in mock mode only mutates the SQLite row;
  no Spotify call.
- **Decide (Keep/Revert)** in mock mode only mutates SQLite; no
  Spotify follow/save/unfollow.

**Three personas** are pre-seeded in
`backend/mock_data/mock_users.json` and anchored to
`../../03-research-and-deck/problem-definition/personas.md`:

- **Aanya** (`demo-aanya-002`) — Premium Individual, 3 years tenure,
  Bollywood/Hindi-Pop-heavy English-indie listener, **genre-stuck**.
  Suggested scope: `genre`. Screen-4 shows a genre-diversity before /
  after.
- **Karthik** (`demo-karthik-001`) — Premium Individual, 5 years
  tenure, Telugu + Hindi + English mix, **language-stuck**. Suggested
  scope: `language`. Screen-4 shows language 19% → 50%.
- **Riya** (`demo-riya-003`) — **Free-tier, 2 months tenure**. Included
  as the **control case**: Pulse must visibly *not* offer itself to
  users outside the target segment. See §10.1 for the eligibility gate.

### 10.1 Eligibility gate

`POST /jobs/run-detection` reads `mock_users.json` at the top of the
mock loop. For every user whose row has
`eligible_for_pulse == false`:

- **Zero writes.** No `WeeklySnapshot`, `StuckScore`, or `Nudge` rows
  are ever created for this user, no matter how many detection runs
  are triggered.
- **Trace-visible skip.** The `JobRun.details_json` array still gets a
  row for the user with `skipped_by_eligibility: true`,
  `reason: "not_eligible: <why>"`, and the `plan` + `tenure_months`
  attached. `/engine/runs` renders this alongside eligible-user rows
  so the gate is auditable.
- **Independent counter.** `summary["users_skipped"]` is separate from
  `users_processed`. A run over the current fixture reports
  `users_processed=2, users_skipped=1, nudges_fired=2` — the trio the
  demo needs.

The eligibility rule is anchored to
[`problemStatement.md`](./problemStatement.md) §4 (target segment):
`plan == "premium"`, `tenure_months >= 36`, `active_days_per_week >= 5`,
`self_awareness == true`, `wants_more_discovery == true`. In mock mode
these five criteria live in `mock_users.json` as declared metadata;
Riya fails criteria 1 and 2. In **real mode** (P6+), the same gate
runs against Spotify's `/me.product` (premium vs free) and the OAuth
account-creation timestamp — same shape, real signals.

**Why this matters for the deck.** Slide 9's honest-gap callout can
now be paired with a positive claim: *"Pulse also correctly stays
quiet — 33% of the demo roster gets no nudge at all, on purpose."*
That's more trustworthy than a product that fires nudges for
everyone.

### 10.2 Fixture files

| File | Rows | Purpose |
|---|---|---|
| `mock_users.json` | 3 users (Aanya, Karthik, Riya) | Roster + plan + tenure + `eligible_for_pulse` + persona metadata for the frontend toggle. Read by `jobs.py` (eligibility gate) and `dashboard.py` (`GET /users`). |
| `synthetic_weeks.json` | 8 weeks × Aanya + Karthik, 4 weeks × Riya | Weekly listening snapshots fed to `detection.process_user_weeks`. Riya's 4 weeks show healthy diverse listening (multiple genres, languages, eras, moods) — even if the eligibility gate were removed, her overall stuck-score never crosses the 0.6 threshold and no 3-week streak forms. |
| `mock_candidates.json` | 240 tracks (60 per scope) | Candidate pool for `reset_engine.py`. Keyed by `scope_origin`, not by persona — reset_engine draws from the scope the user picks. |
| `mock_outcomes.json` | Screen-4 numbers for Aanya + Karthik (Riya absent) | Read by `GET /reset-sessions/{id}/outcome` in mock mode. Riya has no outcome by definition — she can never accept a nudge that isn't offered. |

---

## 11. `/engine` — the internal diagnostic surface

Everything under `/engine` is **not part of the Pulse UX** and
never appears in a screenshot on the deck. It's kept because
it's useful during a demo Q&A ("what is the model actually
seeing?"):

- **`/engine`** — the R8 dashboard: mode switcher, `LastRunCard`,
  8-week stuck-score chart, per-dimension grid, `/scores/history`
  data. Now branded "Pulse — Engine diagnostics".
- **`/engine/runs`** — R8's `RunsPage`: one row per detection
  call, expandable to the 4-step per-user trace (LOAD → FORMULAS
  → TRIGGER → NUDGE?).

Both routes are unlinked from the mobile home. Only someone who
knows the URL sees them. They render **without** the `PhoneFrame`
— they're diagnostic tools, not Pulse.

If the deck day feedback is "cut this too" — the routes can be
deleted whole; nothing in the Pulse UX imports them.

---

## 12. The honest gap (unchanged, restated for v2)

Pulse's sandbox promise is **UX-level**, not backend-enforced.
Concretely:

- Spotify's public Web API does **not** expose a "listen-outside-
  my-taste-model" mode. Every play the user makes inside the
  sandbox playlist feeds Spotify's recommender the same way any
  other play does.
- Pulse compensates with reversibility: **Revert** deletes the
  playlist and doesn't follow any artists / save any tracks,
  which means the profile impact from a single 10-day sandbox
  is bounded and not permanent.
- **What would close the gap:** a first-party surface — a
  "sandbox-mode playlist" flag inside Spotify itself that
  excludes plays from the recommender for the trial window. That
  is a Spotify partnership conversation, and it's the "bet 4"
  future-scope line on the deck.
- The deck says this in plain text on slide 9 (screen frames)
  and slide 11 (future scope).

Nothing in this architecture pretends otherwise.

---

## 13. Testing

`backend/tests/`, one file per route module + one for detection
+ one for reset-engine. What's added in v2:

- `test_reset_lifecycle.py` — covers the sandbox lifecycle end-
  to-end: create session → remove a track → advance clock past
  `trial_end_date` → fetch outcome → decide (both keep and
  revert branches).
- `test_reset_tracks_delete.py` — the new per-track DELETE
  endpoint: 404 on unknown track, soft-delete + audit trail,
  real-mode side effect (mocked), and idempotency on repeat
  DELETE.
- `test_outcome_mock_mode.py` — outcome endpoint reads
  `mock_outcomes.json` correctly for both personas and matches
  the screen-4 mockup numbers exactly.

Existing R8 suite (170 tests) is preserved with one edit: the
old assertion that `/decide` returns a projected
`after_stuck_score` becomes "returns a `measured`
`after_stuck_score` when the outcome endpoint has been
called, else projected".

---

## 14. Deployment (P6)

- **Backend** — Render web service, `uvicorn app.main:app --host
  0.0.0.0 --port $PORT`. SQLite lives on a small persistent
  disk (10GB free tier is plenty). Secrets from Render env vars.
- **Frontend** — Vercel (or Cloudflare Pages) static build,
  `VITE_API_BASE=https://<render-service>.onrender.com`.
- **GitHub Action** — flip `RESET_RADAR_API_URL` secret to point
  at the deployed backend; `RESET_RADAR_API_TOKEN` stays empty
  because `JOBS_API_TOKEN` on the backend stays empty for the
  single-tenant demo.
- **Deck link-in** — slide 9 (frames) references the deployed
  frontend URL; slide 11 (future scope) references
  `../02-mvp/README.md` and `../02-mvp/doc/architecture.md`
  (this file).

---

## 15. Non-goals (v2)

Unchanged from v1 problem statement §7, restated so this file is
self-contained:

- **Not a native mobile app.** Pulse is mobile *web*, styled to
  look mobile. A native SDK is a v3 conversation.
- **Not a Discover Weekly replacement.** Pulse is a *correction
  layer*; it fires when a user is stuck and stays quiet
  otherwise.
- **Not a >25-user product.** Spotify Development Mode caps
  allow-listed users at 25. Growth beyond that requires Extended
  Quota approval.
- **Not backend-enforced sandboxing.** See §12.
- **Not audio-features-based.** The Nov 2024 removal for new
  apps is respected; every "mood"-adjacent signal is Groq-inferred.

---

## 16. File map (post-P5)

```
02-mvp/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models.py               (extended per §7)
│   │   ├── llm_client.py
│   │   ├── spotify_client.py
│   │   ├── detection.py
│   │   ├── reset_engine.py
│   │   └── routes/
│   │       ├── nudges.py
│   │       ├── reset.py            (extended: DELETE tracks, GET outcome)
│   │       ├── jobs.py
│   │       ├── auth.py
│   │       └── dashboard.py        (/scores/history for /engine)
│   ├── mock_data/
│   │   ├── mock_users.json         NEW in P0.5 — 3-persona roster + eligibility
│   │   ├── synthetic_weeks.json
│   │   ├── mock_candidates.json
│   │   └── mock_outcomes.json      NEW in P0.5 — per-persona screen-4 numbers
│   ├── tests/
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                        (git-ignored)
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                 (routes per §5.1)
│   │   ├── theme.js
│   │   ├── styles.css
│   │   ├── api/
│   │   │   └── client.js
│   │   ├── hooks/
│   │   │   └── usePersona.js
│   │   ├── context/
│   │   │   └── SavedSandboxContext.jsx  NEW — session-local "saved to library" flag (see §5.6)
│   │   ├── components/
│   │   │   ├── PhoneFrame.jsx      NEW — shared 375×812 shell with SpotifyBrandBar top-strip
│   │   │   ├── SpotifyWordmark.jsx NEW — reusable green-circle + "Spotify" mark (see §5.2)
│   │   │   ├── PersonaPickerModal.jsx NEW — first-load chooser (see §5.5)
│   │   │   ├── PersonaBadge.jsx    NEW — top-right "Viewing as X · Change"
│   │   │   ├── SpotifyTopBar.jsx   NEW
│   │   │   ├── SpotifyBottomNav.jsx NEW
│   │   │   ├── PulseNudgeCard.jsx  NEW (or reworked NudgeCard)
│   │   │   ├── SavedSandboxCard.jsx NEW — Home tile with countdown + Keep/Discard (see §5.6)
│   │   │   ├── TrackRow.jsx        NEW
│   │   │   ├── WhyThisChip.jsx     NEW
│   │   │   ├── TrackActionSheet.jsx NEW
│   │   │   ├── PulseSandboxRibbon.jsx NEW
│   │   │   ├── DiversityScoreCard.jsx NEW
│   │   │   ├── OutcomeSummaryCard.jsx NEW
│   │   │   ├── CoachMark.jsx       NEW
│   │   │   └── (engine-only) LastRunCard.jsx, StuckScoreCard.jsx
│   │   └── pages/
│   │       ├── HomePage.jsx        (rewritten mobile-first)
│   │       ├── SandboxPlaylistPage.jsx  NEW
│   │       ├── NowPlayingPage.jsx  NEW
│   │       ├── OutcomePage.jsx     NEW (renamed KeepOrRevertCard)
│   │       ├── LibraryPage.jsx     NEW — /library, hosts the kept Pulse playlist (see §5.6)
│   │       ├── Dashboard.jsx       (moved to /engine)
│   │       └── RunsPage.jsx        (moved to /engine/runs)
│   ├── package.json
│   └── vite.config.js
├── .github/
│   └── workflows/
│       └── weekly-detection.yml
├── doc/
│   ├── implementationPlan.md       merged strategic + tactical plan (P0 → P6 with task tables)
│   ├── problemStatement.md         refreshed in P0 for Pulse
│   ├── architecture.md             (this file)
│   ├── DEMO_SCRIPT.md
│   └── mockups/
│       ├── screen2-sandbox-playlist.html
│       ├── screen3-now-playing.html
│       └── screen4-keep-or-revert.html
├── .gitignore
└── README.md
```

The old `legacy-sonar/`, `screenshots/`, all `*.log` files, the
`.pytest_cache/`, `frontend/dist/`, and the stale `reset_radar.db`
are gone as of P0.

---

## 17. Summary — one line

**Pulse = passive stuck-detection + a 20-track sandbox playlist
inside Spotify, with a persistent Keep-or-Revert ribbon that
makes reversibility the load-bearing feature.** Everything in
this document exists to serve the four screens in `mockups/`
and to make that promise real (as far as the public Spotify API
allows) inside the honest-gap boundary of §12.
