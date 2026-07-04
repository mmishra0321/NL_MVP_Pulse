# Pulse — UI mockups (design source of truth)

These four HTML files are the **canonical** design for Pulse.
The architecture in [`../architecture.md`](../architecture.md)
and the phased plan in [`../implementationPlan.md`](../implementationPlan.md) exist to serve
them; if any of the built code disagrees with these files, the
files win and the code is wrong.

| File | Screen | Deck slide it feeds |
|---|---|---|
| *(none — Spotify-home mobile shell we build ourselves)* | **1 · Home nudge** | 9 (frames) |
| `screen2-sandbox-playlist.html` | **2 · Sandbox Playlist** — 20 tracks, per-track `Why this?` chip, `SANDBOX · Not saved to library yet` pill | 9 (frames) |
| `screen3-now-playing.html` | **3 · Now Playing (inside sandbox)** — full player + persistent green Pulse Sandbox ribbon showing `X days left · Keep or Revert` | 9 (frames) |
| `screen4-keep-or-revert.html` | **4 · Keep or Revert (Day N)** — outcome summary + measured before/after diversity + Keep / Revert buttons | 9 (frames) |

To view any file, open it in a browser — each is a self-
contained mobile mockup (375×812 phone frame, dark background,
inline SVGs, no external assets). Do **not** treat any part of
these files as build artefacts; the frontend re-implements the
layout in React inside a shared `PhoneFrame` component.

Screen 1 (home feed nudge) is not a standalone HTML — it's the
Spotify-mobile-home shell we build in `frontend/src/pages/HomePage.jsx`
with the Pulse nudge card slotted between the greeting and the
Recently played grid. See architecture §5.3 for its component tree.
