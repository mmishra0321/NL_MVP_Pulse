# Problem Statement - MVP (Part 4): Pulse

> **REBRAND NOTE (2026-07-04).** This MVP was previously called
> *Reset Radar*. It is now **Pulse**. The problem definition (§2, §3,
> §5, §11) is unchanged — only the surface (mobile-first, Spotify-
> embedded), the locked decisions (§1), the functional requirements
> (§6), and the acceptance gates (§10) have been refreshed.
>
> **Earlier pivot note (2026-06-26).** The MVP pivoted from *Sonar*
> (user-initiated intent box) to system-initiated stuck-detection
> + scoped reversible reset. The reasoning is captured in
> [`architecture.md`](./architecture.md) §0 and §1.
>
> Read in this order:
>
> 1. This file — why Pulse exists (unchanged root cause + refreshed decisions)
> 2. [`implementationPlan.md`](./implementationPlan.md) — phased plan P0 → P6 with per-task tables (strategic + tactical, merged 2026-07-04)
> 3. [`architecture.md`](./architecture.md) — how Pulse is built (v2, mobile-first)
> 4. [`mockups/`](./mockups/) — the four HTML mockups (design source of truth)
>
> Cross-repo companions:
> - [`../../03-research-and-deck/problem-definition/one-pager.md`](../../03-research-and-deck/problem-definition/one-pager.md) — the root-cause analysis Pulse answers
> - [`../../03-research-and-deck/problem-definition/personas.md`](../../03-research-and-deck/problem-definition/personas.md) — Aanya + Karthik composites; Pulse adds Riya as the free-tier control case
> - [`../../01-ai-review-engine/doc/problemStatement.md`](../../01-ai-review-engine/doc/problemStatement.md) — the full project brief

---

## 1. What this MVP must do (per the project brief)

From Part 4 of the project brief:

> *Based on your insights, design and build a functional MVP. The MVP
> may take the form of a prototype for a feature within the existing
> product or an agent. You need to deploy these to production. The MVP
> must demonstrate why AI is uniquely suited to solving this problem.*

**Locked decisions (post-rebrand, 2026-07-04):**

| Decision | Locked value |
|---|---|
| Product name | **Pulse** |
| Form factor | **Mobile web** styled as a native Spotify mobile screen (375×812 phone frame) — **not** a desktop companion app, **not** a native SDK. See `architecture.md` §0 for the reasoning. |
| Initiation model | **System-initiated** (passive weekly detection, proactive in-feed nudge card) — **not** user-initiated |
| Detection "AI work" | Deterministic statistical detection (jaccard overlap + Shannon entropy over 4 categorical dimensions). No LLM inside the trigger decision. |
| Reset "AI work" | Groq Llama 3.x for (a) language classification, (b) mood classification, (c) per-track ranking + one-sentence "Why this?" explanation |
| Reset shape | **20-track sandbox playlist**, 10-day trial, `SANDBOX · Not saved to library yet` pill, per-track removal, ending in a **Keep-or-Revert** decision with measured before → after diversity |
| Eligibility gate | Backend enforces target-segment criteria (Premium plan, ≥ 3 years tenure) before firing any nudge. See §4 + `architecture.md` §10.1. |
| Mock-mode default | `MOCK_MODE=true` is the deck-day default. The full four-screen flow runs against synthetic fixtures with zero Spotify calls. |
| Personas seeded | Three: **Aanya** (genre-stuck), **Karthik** (language-stuck), **Riya** (free-tier control — Pulse must stay silent for her) |
| Deployment | Public URL via Render (backend) + Vercel/Cloudflare Pages (frontend). Weekly cron via GitHub Actions. |
| Linked from | Deck slide 5 (Why AI), slide 7 (Solution detail), slide 8 (four Pulse mobile screenshots including Riya's silent home), slide 9 (honest gap) |

---

## 2. The problem Pulse exists to solve

From `03-research-and-deck/problem-definition/one-pager.md`, the root
cause of the stuck-loop problem is three structural mechanisms in
Spotify's existing recommendation system:

1. **Recency dominance** - one off-pattern session distorts recommendations for 2 weeks to 4 months
2. **Self-reinforcing feedback loop** - each like narrows the radius of future suggestions; no decay; no counter-pressure
3. **No fast correction mechanism** - snooze, hide, thumbs-down, refresh, private session are too narrow or too cosmetic to undo (1) and (2)

The third mechanism is the one **Pulse directly addresses**:

> **Spotify's correction surface is entirely reactive and entirely narrow.
> Snooze removes one song. Hide removes one artist. Thumbs-down corrects
> one play. There is no surface that says "your overall diversity has
> collapsed - here is a scoped, reversible way to break out."**
>
> **Pulse is that surface.**

Mechanisms (1) and (2) are addressed by **scoping** (you reset *only*
the dimension that collapsed) and **reversibility** (the trial doesn't
permanently rewrite anything until you say "Keep").

---

## 3. The "Why AI" defense the MVP must prove

Pulse requires AI for four specific reasons that classical
recommender architectures structurally cannot match:

| Capability | Why a classical recommender cannot do this | Where Pulse uses AI |
|---|---|---|
| **Multi-axis statistical detection that decides when to speak up** | Recommenders react to a click; they don't *initiate*. They have no model of "the user is stuck across these specific axes". | `detection.py` computes jaccard + entropy across 4 dimensions weekly; the trigger fires only when statistical stagnation persists, not on any single signal. |
| **Language classification from text alone** | Spotify has no language field in its public API; classical systems treat language as a black-box feature of the embedding. | Groq Llama classifies language from artist name + track titles + genre tags. |
| **Mood inference without audio features** | Spotify's `/audio-features` endpoint was removed for new apps in Nov 2024 - classical recommenders that depended on it are now disabled. | Groq classifies mood from genre + text metadata, treated as an explicit approximation. |
| **Per-track natural-language explanation tied to a scope** | A vector dot-product is not an explanation - it's a rationalisation. | `reset_engine.py` calls Groq to write a one-sentence "why this track fits your reset of dimension X" per track — surfaced verbatim on screen 2's `Why this?` chip. |

**At least 3 of these 4 must be visibly demonstrable in the live UX.**
(Statistical detection + per-track explanation are non-negotiable;
language and mood classification appear in the dashboard chart and the
reset scope picker.)

---

## 4. Target user (locked from P2 + P3)

**Stuck Heavy Premium Listener** - defined by all five of:

| # | Criterion | Threshold |
|---|---|---|
| 1 | Plan | Spotify Premium (any sub-tier) |
| 2 | Tenure | ≥ 3 years on Premium |
| 3 | Usage | ≥ 5 days/week active |
| 4 | Self-awareness | Recommendations have felt stale in the last 6 months |
| 5 | Intent | Wishes they discovered new music more often |

**Sizing:** ~55M globally (268M Premium × 55% heavy × 37% stuck-staleness;
sensitivity in `business-case.md`).

**Sub-segment:** Stuck Multilingual Premium Listener - same criteria
plus listening regularly in 2+ languages with distinct genre preferences
per language. ~2-4M globally. Suffers all primary pain plus
"language-treated-as-genre" overlay.

**Personas seeded in the MVP (mock mode):**

| # | Persona | Fits target segment? | Role in the demo |
|---|---|---|---|
| 1 | **Aanya** — Stuck Heavy Premium, monolingual | ✅ Yes | Primary happy-path demo. Genre-stuck → nudge fires, sandbox created, Keep-or-Revert. |
| 2 | **Karthik** — Stuck Multilingual Premium | ✅ Yes | Multilingual sub-segment demo. Language-stuck → the "language treated as genre" story. |
| 3 | **Riya** — new **free-tier** user (2 months tenure) | ❌ No | **Control case.** Pulse must visibly *not* offer itself to her. Backend gates on `eligible_for_pulse=false`; the trace records `skipped: not_eligible`. |

Aanya and Karthik are documented as composites in
[`../../03-research-and-deck/problem-definition/personas.md`](../../03-research-and-deck/problem-definition/personas.md).
Riya is a mock-only control — her purpose is proof that the gate
works, not primary research.

---

## 5. The MVP's job-to-be-done (post-pivot)

### Primary JTBD

> **When I have been listening to the same narrow slice of music for
> several weeks without noticing,
> I want Spotify to tell me, suggest a way out that I can try without
> commitment, and then let me decide whether to keep it,
> so I can break out of comfort loops without rebuilding my entire
> profile from scratch.**

### Secondary JTBD (multilingual sub-segment)

> **When my recommendations have collapsed along one language axis,
> I want to reset just that language without touching the others,
> so my Carnatic-in-Telugu listening doesn't get diluted when I try
> something new in English.**

The **scoped** reset (just genre, OR just language, OR just era, OR just
mood) is the structural answer to the second JTBD. It exists because the
sub-segment explicitly asked for it ("don't treat my Telugu listening as
Telugu film music" - Vikram, interview 02).

---

## 6. Functional requirements (locked)

1. **Eligibility gate.** Before any detection runs for a user, Pulse
   checks target-segment membership (`plan == "premium"`,
   `tenure_months >= 36`). Non-eligible users get zero snapshots, zero
   scores, and zero nudges written — but the skip is recorded in the
   `JobRun` trace with `skipped: not_eligible: <reason>` so the gate
   is auditable. See `architecture.md` §10.1.
2. **Passive weekly snapshot.** For every eligible user, the backend
   computes a snapshot of the user's top tracks, recently played, and
   saved library every week. No user action required.
3. **Four-dimension diversity scoring.** Each snapshot decomposes into
   four dimensions: genre, language, era, mood. Each dimension gets a
   stuck-score 0-1 via the formulas in `architecture.md` §2.
4. **Statistical trigger.** A nudge fires only when
   `overall_stuck_score > STUCK_THRESHOLD` (default 0.6) for
   `STUCK_STREAK_WEEKS` (default 3) consecutive weeks, AND no nudge
   shown in the last `COOLDOWN_WEEKS` (default 4), AND no reset
   session currently active.
5. **Suggested scope.** When the nudge fires, the worst-scoring
   dimension is pre-selected as the reset scope. In v2 (mobile) the
   scope is preset per screen 1 — the picker step from Reset Radar v1
   is compressed into the nudge card's copy.
6. **In-feed nudge card.** The nudge surfaces as a Spotify-home-feed
   card (screen 1), sitting between the "Good evening" greeting and
   the Recently played grid. Two actions: **Try a reset** (accept) /
   **Not now** (dismiss).
7. **Scoped reset with per-track "Why this?".** Accepting the nudge
   builds a 20-track sandbox playlist via `GET /search` with
   field filters keyed to the chosen scope (**not** via Spotify's
   removed `/recommendations` endpoint). Groq Llama 3.x ranks the
   candidate pool and writes a one-sentence natural-language "why"
   per track, rendered as a green `Why this?` chip on screen 2.
8. **Sandbox lifecycle** *(new in v2)*.
   - Playlist is labelled `SANDBOX · Not saved to library yet`
     (screen 2 pill).
   - Real-mode: created in the user's Spotify account via
     `POST /me/playlists` + `POST /playlists/{id}/items` (Feb-2026
     endpoint rename).
   - **Per-track removal** during trial: 3-dot kebab on any track
     → bottom sheet → "Remove from this reset". In real mode also
     `DELETE`s from the Spotify playlist. Soft-deleted rows retained
     for outcome attribution.
   - A persistent green **Pulse Sandbox ribbon** on screens 3 and 4
     shows `days_left` (from `trial_end_date`) and a `Keep or Revert`
     CTA.
9. **Time-boxed trial.** Each reset session has
   `trial_end_date = created_at + TRIAL_WINDOW_DAYS` (default 10).
10. **Measured outcome** *(new in v2)*. On Day N (default 10) the
    outcome endpoint returns `tracks_played_count`, `repeat_plays`,
    `artist_search_hits`, and a **measured** `before_<axis>_pct` →
    `after_<axis>_pct` delta from real snapshot data — not a
    projection. Powers screen 4. Mock mode reads pre-baked numbers
    from `mock_outcomes.json`.
11. **Keep / Revert decision.** After the trial:
    - **Keep:** follow the top-N promoted artists (`PUT /me/following`),
      save the top tracks (`PUT /me/tracks`) so they survive playlist
      deletion.
    - **Revert:** `DELETE /playlists/{id}/followers` (canonical Spotify
      pattern to remove a playlist), mark session reverted, nothing
      else changes.
12. **Mock mode for the live demo.** `MOCK_MODE=true` runs the entire
    flow against synthetic fixtures (`synthetic_weeks.json`,
    `mock_candidates.json`, `mock_outcomes.json`, `mock_users.json`)
    with zero live Spotify calls. **Default configuration for the deck.**
13. **Weekly GitHub Action cron.** A scheduled workflow calls
    `POST /jobs/run-detection` every Monday 09:00 UTC, evidence that
    the system is proactive by design. In mock mode it replays the
    fixture; in real mode it fetches this week's snapshots + polls
    `sandbox_play_events` for outcome computation.
14. **Deployed to production.** Public URL clickable from the deck,
    loadable on a real phone in Safari + Chrome.

---

## 7. Out of scope (this MVP)

- **Backend-enforced sandboxing of the trial.** No public Spotify API
  allows a third party to exclude listening from the user's internal
  Spotify model. The sandbox is a **UX-level guarantee** with a
  reversibility floor (Revert = zero profile impact). Called out
  honestly on deck slide 9 and in `architecture.md` §12.
- **Production-grade language detection.** LLM classification is an
  approximation, good enough for a demo.
- **More than 25 users.** Spotify Development Mode caps allow-listed
  users at 25; Extended Quota approval is not in scope for this MVP.
- **Native mobile SDK.** Pulse is mobile *web* styled to look native
  (rendered inside a 375×812 phone frame). An iOS/Android SDK is a
  v3 conversation.
- **Free-tier / new-user support.** Pulse is Premium-only by design
  (§6.1). Riya (`demo-riya-003`) is included in mock mode to
  demonstrate the eligibility gate correctly staying silent.
- **Real audio playback / streaming licenses.** Screen 3's Now Playing
  is a Spotify player *mock* — actual playback happens in the user's
  real Spotify app (which they open by tapping into the sandbox
  playlist).
- **Replacement for Discover Weekly / Daily Mix / AI DJ.** Pulse is a
  *correction layer*, not a primary discovery surface. It fires when
  a user is stuck and stays quiet otherwise.
- **The R8 diagnostic dashboard as user-facing UI.** The `/engine`
  and `/engine/runs` routes still exist for internal QA + Q&A but are
  intentionally not linked from the Pulse mobile home.

---

## 8. Success criteria

- [ ] **Live public URL** clickable in the final deck (both backend
      + frontend reachable), loadable on a real phone in Safari + Chrome
- [ ] **Mock-mode end-to-end flow works in ≤ 90 seconds**: mobile
      home (screen 1) → accept nudge → sandbox playlist (screen 2) →
      tap a track → Now Playing (screen 3) → Keep-or-Revert CTA →
      outcome (screen 4) → Keep or Revert
- [ ] **Detection trigger fires on week 6 of the synthetic fixture**
      for both Aanya (genre) and Karthik (language) with
      `overall_stuck_score > 0.6` and the 3-week streak rule satisfied
- [ ] **First-load persona picker** — opening the deployed URL in a
      fresh incognito tab surfaces a full-screen modal listing all
      three personas (Aanya + Karthik as "Fits target segment",
      Riya as "Free tier — Pulse stays silent"). Picking a persona
      dismisses the modal and loads that persona's home. A
      top-right `Viewing as: X · Change` badge lets reviewers switch
      without reloading.
- [ ] **Eligibility gate holds** — `POST /jobs/run-detection` reports
      `users_processed=2, users_skipped=1, nudges_fired=2` on the
      3-persona fixture, and Riya's home page shows the Spotify shell
      without a Pulse nudge card
- [ ] **20-track sandbox playlist** with non-empty `Why this?` for every
      track, `SANDBOX · Not saved to library yet` pill visible
- [ ] **Per-track removal** from the sandbox works (3-dot kebab →
      "Remove from this reset") with an optimistic UI update
- [ ] **Persistent Pulse Sandbox ribbon** shows correct `days_left`
      derived from `trial_end_date` (server-truth, not hard-coded)
- [ ] **Measured outcome numbers** on screen 4 match the mockups for
      both eligible personas (Karthik: language 19% → 50%; Aanya:
      genre 22% → 54%)
- [ ] **Zero hallucinated track IDs** — every track on a sandbox
      playlist exists in the candidate pool
- [ ] **At least 3 of 4 "Why AI" capabilities** visibly demonstrable
      in the mobile flow (statistical detection + per-track
      explanation + at least one of language/mood classification)
- [ ] **Honest-gap copy** present on deck slide 9 and in
      `architecture.md` §12: "sandbox is UX-level, not backend-enforced"
- [ ] **GitHub Action workflow file** exists and `workflow_dispatch`
      succeeds against the deployed backend
- [ ] **Fresh Pulse mobile screenshots** captured at iPhone 13 viewport
      (390×844, 3× DPR) into `03-research-and-deck/assets/mvp-screenshots/`
      for slide 8, including one showing Riya's silent home

---

## 9. Open questions (resolve during P1-P5)

1. **Where does `days_left` start counting from** — the moment
   `POST /reset-sessions` returns, or the first `sandbox_play_events`
   row? Default: from `created_at`. Revisit in P5 if demo storytelling
   needs a "you started listening today" framing.
2. **Proxy signal for `artist_search_hits`** in real mode. Spotify's
   Web API has no read endpoint for user search history. Proxy:
   artists in `top-artists?time_range=short_term` at `computed_at`
   who were **not** there at `started_at`, restricted to artists on
   the sandbox playlist. Documented as a proxy in outcome copy.
3. **How many promoted artists to follow on Keep** — placeholder 5,
   tune during P5.
4. **Should the nudge card show a mini stuck-score chart** — default
   no; nudge card stays copy-only. `/engine` retains the full chart.
5. **Backend deployment target** — Render (default) vs Railway vs
   Fly. Decide at P6 based on which has the least painful free tier
   for FastAPI + SQLite + a persistent disk.
6. **Nudge display cadence for eligible users** — once fired, does
   the card persist in the feed until accepted or dismissed, or does
   it self-dismiss after N views? Default: persists until user
   action or `COOLDOWN_WEEKS` elapses.

---

## 10. Acceptance gates (build-order checkpoints)

The phase overview is in [`implementationPlan.md`](./implementationPlan.md) §6; the per-task build
tables live in the P1-P6 sections of the same doc. One acceptance
gate per phase:

| Phase | Gate that proves it's done |
|---|---|
| **P0** ✅ | Docs rewritten for Pulse; folder tree pruned; 4 mockups saved in `doc/mockups/` |
| **P0.5** ✅ | 3-persona pack live: `_smoke_wet.py` PASSes with `users_processed=2, users_skipped=1, nudges_fired=2`; `GET /users` returns enriched roster |
| **P1** | Mobile home (`/`) renders inside a phone frame; Pulse nudge card visible for Aanya + Karthik, absent for Riya; `/engine` still works for internal QA |
| **P2** | Accepting the nudge routes to `/sandbox/:sessionId` with all 20 tracks + `Why this?` chips; 3-dot kebab opens the bottom sheet; "Remove from this reset" hits `DELETE /reset-sessions/{id}/tracks/{trackId}` |
| **P3** | `/sandbox/:sessionId/now-playing/:trackId` renders full player + persistent Pulse Sandbox ribbon with server-truth `days_left`; "Keep or Revert" CTA routes to outcome page |
| **P4** | Outcome page shows measured before → after numbers for both eligible personas; Keep and Revert each round-trip through the decide endpoint and return home with a toast |
| **P5** | `pytest` green with new tests for `DELETE tracks/{id}` and `GET outcome`; sandbox lifecycle (create → remove → outcome → decide) covered end-to-end |
| **P6** | Public URL loads Pulse on a real phone; three fresh mobile screenshots (including Riya's silent home) live in `03-research-and-deck/assets/mvp-screenshots/`; deck slides 8-9 reference them; `workflow_dispatch` succeeds against the deployed backend |

---

## 11. Why this MVP is the right answer to the locked problem

The problem (per project-brief P3): three structural mechanisms in
Spotify's recommender compound on one taste vector, and the existing
correction tools are too narrow to undo them.

The MVP (**Pulse**):

- **Acts proactively.** Mechanism (3) was "no fast correction"; Pulse
  removes the "you have to notice you're stuck" prerequisite by
  running weekly detection and surfacing a nudge in the Spotify home
  feed when stagnation is real.
- **Acts at the right granularity.** Mechanisms (1) and (2) compound
  *along specific axes*; Pulse lets the user correct **just the
  collapsed axis** (genre / language / era / mood), not the whole
  profile.
- **Acts reversibly.** The sandbox + Day-10 Keep-or-Revert decision
  means trying a reset is **literally free** — Revert deletes the
  playlist, follows no artists, saves no tracks. This is the missing
  ingredient that unblocks the stuck cohort's behavioural willingness
  to explore.
- **Acts within its lane.** The eligibility gate keeps Pulse silent
  for users outside the target segment (Riya, free-tier). A product
  that fires nudges at everyone is spam; a product that fires only
  when the criteria hold is a feature.

Without all four together, the existing Spotify tools (and the
closest existing AI feature, AI Playlist) cannot break the loop
architecturally. Pulse can, because its design is causally aligned
with the root-cause analysis from the research phase — not bolted on
top of an existing surface.
