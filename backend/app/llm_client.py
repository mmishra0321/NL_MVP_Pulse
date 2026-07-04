"""Groq LLM client - the single AI surface for the Reset Radar backend.

Carried over from `legacy-sonar/src/llm/client.py` (the throttled Groq
wrapper with `tenacity` retry + JSON mode helper) and extended with
three Reset-Radar-specific methods that are filled in across R1-R4:

- `classify_language(...)` - replaces Spotify's missing language field
- `classify_mood(...)` - replaces Spotify's removed `/audio-features`
- `rank_and_explain(...)` - per-track ranking + one-line "why"

These three method bodies are deliberate stubs in R0; real prompts +
parsing land in R1 (language/mood) and R2 (rank_and_explain).
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from groq import Groq
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from app.config import settings


log = logging.getLogger("reset_radar.llm")


# ============================================================
# Process-wide rate limiter
# Groq's free tier is primarily TPM (tokens per minute) limited.
# Keeping requests at least N seconds apart smooths out the rate.
# ============================================================

_MIN_INTERVAL_SECONDS = 6.5
_lock = threading.Lock()
_last_call_at: float = 0.0


def _throttle() -> None:
    global _last_call_at
    with _lock:
        delta = time.monotonic() - _last_call_at
        if delta < _MIN_INTERVAL_SECONDS:
            time.sleep(_MIN_INTERVAL_SECONDS - delta)
        _last_call_at = time.monotonic()


class GroqError(RuntimeError):
    """Wraps any error from the Groq SDK in a single type our callers can catch."""


class GroqRateLimitError(GroqError):
    """Raised when Groq returns a 429 rate-limit response.

    Split out from `GroqError` so `tenacity` can be told not to retry
    it - retrying a daily-token TPD quota exhaustion for another
    ~14 seconds only delays the (guaranteed) failure and stalls the
    UI. Callers that want a graceful fallback (see
    `rank_and_explain` MOCK_MODE branch) should catch this
    explicitly.
    """


def _is_rate_limit(exc: BaseException) -> bool:
    """Best-effort detection of a Groq 429 response.

    The Groq SDK does not export a typed RateLimit exception (yet),
    so we sniff the string representation. Matches both the
    "Error code: 429" prefix on their API errors and their message
    body's `'code': 'rate_limit_exceeded'` marker.
    """
    text = str(exc)
    return "429" in text or "rate_limit_exceeded" in text.lower()


def _get_client() -> Groq:
    if not settings.groq_api_key:
        raise GroqError(
            "GROQ_API_KEY is not set. Add it to 02-mvp/backend/.env "
            "(or to your shell environment)."
        )
    return Groq(api_key=settings.groq_api_key)


# ============================================================
# Core chat_json helper - all structured LLM calls go through this
# ============================================================

# Retry on transient GroqError only. GroqRateLimitError short-circuits
# retries - a daily-token 429 will not clear in the 2-30s tenacity would
# wait, so retrying only stalls the UI. Callers (see `rank_and_explain`
# MOCK_MODE branch) fall back to templated output instead.
def _should_retry_groq(exc: BaseException) -> bool:
    return isinstance(exc, GroqError) and not isinstance(exc, GroqRateLimitError)


@retry(
    retry=retry_if_exception(_should_retry_groq),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    before_sleep=before_sleep_log(log, logging.WARNING),
    reraise=True,
)
def chat_json(
    *,
    system: str,
    user: str,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1200,
) -> dict[str, Any]:
    """Run a chat completion in JSON mode and return the parsed dict.

    Use this for every structured LLM call in the backend. If the model
    returns invalid JSON, this raises GroqError and tenacity retries.
    A 429 is raised as GroqRateLimitError, which tenacity does NOT
    retry - the caller (typically `rank_and_explain`) is expected to
    fall back to mock output in MOCK_MODE.
    """
    _throttle()
    client = _get_client()
    model = model or settings.groq_model_reasoner
    try:
        completion = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
    except Exception as exc:                                       # noqa: BLE001
        if _is_rate_limit(exc):
            raise GroqRateLimitError(
                f"Groq rate limit hit (429): {exc}"
            ) from exc
        raise GroqError(f"Groq chat call failed: {exc}") from exc

    content = (completion.choices[0].message.content or "").strip()
    if not content:
        raise GroqError("Groq returned an empty response.")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise GroqError(
            f"Groq returned non-JSON content. First 300 chars: {content[:300]!r}"
        ) from exc


def ping() -> str:
    """Smoke-test the connection. Returns the model's free-text reply."""
    _throttle()
    client = _get_client()
    completion = client.chat.completions.create(
        model=settings.groq_model_fast,
        max_tokens=20,
        messages=[
            {"role": "system", "content": "Reply with the single word PONG."},
            {"role": "user", "content": "ping"},
        ],
    )
    return (completion.choices[0].message.content or "").strip()


# ============================================================
# Reset Radar-specific LLM operations
# ============================================================

# ---- Allowed-label vocabularies (canonical sets) -------------

_ALLOWED_LANGUAGES: set[str] = {
    # Just the codes we actually surface; the LLM will be told to fall back
    # to "other" if it sees something outside this set.
    "en", "es", "fr", "pt", "de", "it",
    "hi", "ta", "te", "ml", "kn", "bn", "pa", "ur",
    "ko", "ja", "zh",
    "instrumental", "other",
}

_ALLOWED_MOODS: set[str] = {
    "chill", "melancholy", "energetic", "nostalgic", "focus",
}


# ---- Batch language classification ---------------------------

_LANG_SYSTEM_PROMPT = """\
You are Reset Radar's language classifier. For each input track you will
return the primary lyric language as an ISO 639-1 code.

Allowed codes:
  en (English), es (Spanish), fr (French), pt (Portuguese), de (German),
  it (Italian), hi (Hindi), ta (Tamil), te (Telugu), ml (Malayalam),
  kn (Kannada), bn (Bengali), pa (Punjabi), ur (Urdu), ko (Korean),
  ja (Japanese), zh (Chinese), instrumental (no lyrics), other (anything
  else).

Use "instrumental" only when you are confident the track has no lyrics
(classical, electronic ambient, jazz instrumentals, etc.). Use "other"
when you genuinely cannot tell.

You will receive a JSON list of tracks. Return JSON of exactly:
{
  "classifications": [
    {"index": 0, "language": "<code>"},
    {"index": 1, "language": "<code>"},
    ...
  ]
}

The output list must have the same length as the input list and the
same `index` values. Do not skip or reorder.
"""


def classify_languages(tracks: list[dict[str, Any]]) -> list[str]:
    """Batch-classify the primary lyric language of each track.

    Args:
        tracks: list of dicts with at least `title` and `artist` keys; may
                also contain `genres`, `album`. Order is preserved in the
                return value.

    Returns:
        list of language codes parallel to `tracks`. Falls back to "other"
        on any per-track parse error.
    """
    if not tracks:
        return []
    compact = [
        {
            "index": i,
            "title": t.get("title", ""),
            "artist": t.get("artist", ""),
            "genres": t.get("genres", [])[:3],
            "album": t.get("album"),
        }
        for i, t in enumerate(tracks)
    ]
    payload = chat_json(
        system=_LANG_SYSTEM_PROMPT,
        user=json.dumps({"tracks": compact}, ensure_ascii=False),
        model=settings.groq_model_fast,                                # 8b is plenty for label tasks
        temperature=0.0,
        max_tokens=1024 + 32 * len(tracks),
    )

    result = ["other"] * len(tracks)
    items = payload.get("classifications") if isinstance(payload, dict) else None
    if isinstance(items, list):
        for entry in items:
            if not isinstance(entry, dict):
                continue
            idx = entry.get("index")
            lang = entry.get("language")
            if (isinstance(idx, int) and 0 <= idx < len(tracks)
                    and isinstance(lang, str) and lang.lower() in _ALLOWED_LANGUAGES):
                result[idx] = lang.lower()
    return result


# ---- Backwards-compatible per-track shim ---------------------

def classify_language(
    *,
    track_title: str,
    artist_name: str,
    genres: list[str] | None = None,
) -> str:
    """Single-track convenience wrapper around `classify_languages`.

    Real implementations should call the batch version directly to avoid
    paying the Groq round-trip cost per track. Kept here for API
    stability and ad-hoc REPL use.
    """
    return classify_languages([{
        "title": track_title,
        "artist": artist_name,
        "genres": genres or [],
    }])[0]


# ---- Batch mood classification -------------------------------

_MOOD_SYSTEM_PROMPT = """\
You are Reset Radar's mood classifier. For each input track return the
dominant mood as one of EXACTLY:
  chill        - relaxed, low-energy, smooth
  melancholy   - sad, wistful, introspective
  energetic    - upbeat, danceable, propulsive
  nostalgic    - sentimental, looks-back, comfortable
  focus        - instrumental or minimal-vocal, suited to concentration

Pick the best fit even if more than one applies. This is an approximation
(Spotify's audio-features endpoint was removed) and is documented as such
in the product UI.

Input is a JSON list of tracks. Return JSON of exactly:
{
  "classifications": [
    {"index": 0, "mood": "<label>"},
    {"index": 1, "mood": "<label>"},
    ...
  ]
}

The output list must have the same length as the input list and the
same `index` values.
"""


def classify_moods(tracks: list[dict[str, Any]]) -> list[str]:
    """Batch-classify the dominant mood of each track.

    Returns:
        list of mood labels parallel to `tracks`. Falls back to "chill"
        (the most common bucket) on any per-track parse error.
    """
    if not tracks:
        return []
    compact = [
        {
            "index": i,
            "title": t.get("title", ""),
            "artist": t.get("artist", ""),
            "genres": t.get("genres", [])[:3],
            "album": t.get("album"),
        }
        for i, t in enumerate(tracks)
    ]
    payload = chat_json(
        system=_MOOD_SYSTEM_PROMPT,
        user=json.dumps({"tracks": compact}, ensure_ascii=False),
        model=settings.groq_model_fast,
        temperature=0.0,
        max_tokens=1024 + 32 * len(tracks),
    )

    result = ["chill"] * len(tracks)
    items = payload.get("classifications") if isinstance(payload, dict) else None
    if isinstance(items, list):
        for entry in items:
            if not isinstance(entry, dict):
                continue
            idx = entry.get("index")
            mood = entry.get("mood")
            if (isinstance(idx, int) and 0 <= idx < len(tracks)
                    and isinstance(mood, str) and mood.lower() in _ALLOWED_MOODS):
                result[idx] = mood.lower()
    return result


def classify_mood(
    *,
    track_title: str,
    artist_name: str,
    genres: list[str] | None = None,
    album: str | None = None,
) -> str:
    """Single-track convenience wrapper around `classify_moods`."""
    return classify_moods([{
        "title": track_title,
        "artist": artist_name,
        "genres": genres or [],
        "album": album,
    }])[0]


_RANK_SYSTEM_PROMPT = """\
You are Reset Radar's track-ranking assistant. The user is a Spotify
Premium listener whose listening has narrowed onto one dimension; they
have explicitly chosen ONE reset SCOPE (genre / language / era / mood)
to step outside their current pattern.

You will receive:
- the chosen scope dimensions (most commonly a single one)
- an optional free-text intent describing the user's preference
- a candidate pool of tracks (already filtered by scope on the backend)

You MUST:
1. Pick exactly `target_count` tracks from the pool, ordered most to least
   recommended.
2. Use ONLY `spotify_track_id` values that appear in the candidate pool.
   Do NOT invent IDs or use any external knowledge of Spotify catalog
   identifiers - hallucinated IDs are dropped by a downstream guard and
   would waste a slot.
3. For each pick, write a `why` string (<= 160 characters) that:
   - is written directly to the user (second person, "you")
   - references the chosen reset scope by name
   - explains why this track is a good bridge from where the user is
     stuck to something new (NOT a marketing pitch; honest framing)
   - never mentions "AI", "LLM", "Groq", or implementation details

Return JSON of exactly this shape:
{
  "picks": [
    {"spotify_track_id": "<id from pool>", "score": <float 0..1>, "why": "<<=160 chars>"},
    ...
  ]
}

Pick exactly `target_count` items. Score must be in [0, 1] reflecting
how strong a recommendation this is (1 = best fit for this reset).
"""


def _mock_rank_and_explain(
    *,
    scope_dimensions: list[str],
    candidates: list[dict[str, Any]],
    target_count: int,
) -> list[dict[str, Any]]:
    """Deterministic templated ranker for MOCK_MODE without a Groq key.

    Ordering: preserves the input order (which is `mock_candidates.json`
    order, already curated for diversity). Score is a linearly decaying
    0.95 -> 0.55 across the picked window so downstream code that sorts
    by score still produces a stable ordering.

    Why-text: chosen per candidate's own scope_origin, using its
    genre/language/era/mood tags for specificity. Falls back gracefully
    when a tag is missing.
    """
    picked = candidates[:target_count]
    n = max(1, len(picked))
    scope_set = set(scope_dimensions or [])

    def _why(c: dict[str, Any]) -> str:
        origin = (c.get("scope_origin") or "").lower()
        # Prefer the explicitly-requested scope if it matches; fall back to
        # whatever scope this candidate was harvested under.
        chosen = origin if origin in scope_set else (next(iter(scope_set)) or origin)
        genres = c.get("genres") or []
        genre = genres[0] if genres else None
        language = c.get("language")
        era = c.get("era")
        mood = c.get("mood")
        title = c.get("title", "this track")
        artist = c.get("artist", "an artist you may not have heard")

        if chosen == "genre":
            if genre:
                return (
                    f"Widens your genre mix with {genre} \u2014 you have not "
                    f"leaned on this pocket in your last 8 weeks."
                )
            return f"Adds a fresh genre that is not in your recent listening pattern."
        if chosen == "language":
            if language:
                lang_name = _LANG_LABEL.get(language, language)
                return (
                    f"Adds a {lang_name} track \u2014 breaks the language "
                    f"streak your Discover Weekly has been reinforcing."
                )
            return f"Adds a different-language track to break your recent streak."
        if chosen == "era":
            if era:
                return (
                    f"Pulls from the {era}, an era you have not spent "
                    f"time in recently."
                )
            return f"Pulls from a different era than your recent listening."
        if chosen == "mood":
            if mood:
                return (
                    f"A {mood} track to widen the mood range you have "
                    f"been listening to."
                )
            return f"Widens the mood range of your recent rotation."
        # Fallback if scope_origin missing entirely.
        return (
            f"Fresh pick outside your recent pattern: \u201C{title}\u201D "
            f"by {artist}."
        )

    out: list[dict[str, Any]] = []
    for idx, c in enumerate(picked):
        # Linear decay 0.95 -> 0.55 across the picked window so `_validate_picks`
        # and downstream `sorted(..., key=-score)` produce a stable order.
        score = 0.95 - (0.40 * (idx / max(1, n - 1))) if n > 1 else 0.90
        out.append({
            "spotify_track_id": c["spotify_track_id"],
            "score": max(0.0, min(1.0, score)),
            "why": _why(c)[:200],
        })
    return out


# Human-readable language labels for the templated "why". Anything not
# in this map falls back to the ISO code itself.
_LANG_LABEL = {
    "en": "English",
    "hi": "Hindi",
    "te": "Telugu",
    "ta": "Tamil",
    "kn": "Kannada",
    "ml": "Malayalam",
    "bn": "Bengali",
    "es": "Spanish",
    "fr": "French",
    "ja": "Japanese",
    "ko": "Korean",
    "pt": "Portuguese",
}


def rank_and_explain(
    *,
    scope_dimensions: list[str],
    free_text_intent: str | None,
    candidates: list[dict[str, Any]],
    target_count: int = 20,
) -> list[dict[str, Any]]:
    """Rank the candidate pool and write a one-line `why` per kept track.

    Returns a list of `target_count` items, each shaped:
        {
            "spotify_track_id": str,
            "score": float (0-1),
            "why": str (max 160 chars),
        }

    Hallucination guard: the caller (`reset_engine._validate_picks`)
    drops any track_id not in the candidate pool. This function does NOT
    enforce that on its own - the system prompt asks the LLM to comply,
    and the guard catches the (rare) failures.
    """
    if not candidates:
        raise ValueError("rank_and_explain called with empty candidate pool.")

    # === Mock-mode fallback (deck-safe path) ==============================
    # If we're in MOCK_MODE and no Groq API key is configured, produce a
    # deterministic templated "why" per candidate. Keeps the P2 demo fully
    # offline while still emitting sensible per-track explanations that the
    # WhyThisChip in the Sandbox Playlist screen can render. When a real
    # GROQ_API_KEY is set, we fall through to the real Groq call below.
    if settings.mock_mode and not settings.groq_api_key:
        log.info(
            "rank_and_explain | using mock templated explanations "
            "(MOCK_MODE=true, GROQ_API_KEY empty) | candidates=%d target=%d",
            len(candidates), target_count,
        )
        return _mock_rank_and_explain(
            scope_dimensions=scope_dimensions,
            candidates=candidates,
            target_count=target_count,
        )

    # Compact candidate dicts for the prompt - the LLM only needs the
    # fields it can reason about (title, artist, genres, language, era,
    # mood). The spotify_track_id is the join key it MUST echo back.
    compact = [
        {
            "spotify_track_id": c["spotify_track_id"],
            "title": c["title"],
            "artist": c["artist"],
            "genres": c.get("genres", []),
            "language": c.get("language"),
            "era": c.get("era"),
            "mood": c.get("mood"),
        }
        for c in candidates
    ]

    user_payload = {
        "scope_dimensions": scope_dimensions,
        "free_text_intent": free_text_intent or "",
        "target_count": target_count,
        "candidates": compact,
    }
    user_msg = json.dumps(user_payload, ensure_ascii=False)

    # Heuristic max_tokens: 20 picks * ~200 tokens/pick (id + score + why
    # + JSON overhead) ≈ 4000. Round up to give headroom.
    try:
        payload = chat_json(
            system=_RANK_SYSTEM_PROMPT,
            user=user_msg,
            model=settings.groq_model_reasoner,
            temperature=0.3,
            max_tokens=4096,
        )
    except GroqError as exc:
        # === Graceful degrade (rate limit / transport / auth) =============
        # In MOCK_MODE we treat every Groq failure - 429 rate-limits, 5xx,
        # network resets, empty responses - as a signal to fall back to
        # the deterministic templated ranker rather than 502-ing the whole
        # request. This is what keeps a demo working even when the daily
        # Groq token quota is exhausted (a very real risk during a live
        # demo). In real mode (MOCK_MODE=false) we still raise so callers
        # see the true error.
        if settings.mock_mode:
            log.warning(
                "rank_and_explain | Groq failed (%s); falling back to "
                "templated ranker in MOCK_MODE | candidates=%d target=%d",
                exc, len(candidates), target_count,
            )
            return _mock_rank_and_explain(
                scope_dimensions=scope_dimensions,
                candidates=candidates,
                target_count=target_count,
            )
        raise

    picks = payload.get("picks") if isinstance(payload, dict) else None
    if not isinstance(picks, list):
        raise GroqError(
            f"rank_and_explain response missing 'picks' list; got {payload!r}"
        )

    normalised: list[dict[str, Any]] = []
    for entry in picks:
        if not isinstance(entry, dict):
            continue
        tid = entry.get("spotify_track_id")
        if not isinstance(tid, str) or not tid:
            continue
        score = float(entry.get("score", 0.5))
        score = max(0.0, min(1.0, score))
        why = str(entry.get("why", ""))[:200]
        normalised.append({
            "spotify_track_id": tid,
            "score": score,
            "why": why,
        })

    if not normalised and settings.mock_mode:
        # Groq returned a well-formed empty picks list - still not useful.
        # Same fallback path as above so the reviewer never sees a broken
        # sandbox in MOCK_MODE.
        log.warning(
            "rank_and_explain | Groq returned empty picks list; falling "
            "back to templated ranker in MOCK_MODE",
        )
        return _mock_rank_and_explain(
            scope_dimensions=scope_dimensions,
            candidates=candidates,
            target_count=target_count,
        )

    return normalised


__all__ = [
    "chat_json",
    "ping",
    "classify_language",
    "classify_languages",
    "classify_mood",
    "classify_moods",
    "rank_and_explain",
    "GroqError",
    "GroqRateLimitError",
]
