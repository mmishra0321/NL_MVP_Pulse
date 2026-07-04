/**
 * SandboxPlaylistPage - Pulse screen 2.
 *
 * Route: /sandbox/:sessionId
 * Data:  GET /reset/sessions/:id (loads on mount)
 *
 * Actions:
 *   - Filled-green "Save to library" pill (primary CTA) calls
 *     SavedSandboxContext.saveSandbox(session) and routes back to
 *     Home so the SavedSandboxCard can surface the countdown +
 *     Keep/Discard flow. Once saved, the pill flips to a muted-
 *     green outlined "Saved to library" state.
 *   - Circular Play button routes to Now Playing for track 0.
 *   - 3-dot kebab on any track opens the shared TrackActionSheet.
 *   - "Remove from this reset" (destructive) hits
 *     DELETE /reset/sessions/:id/tracks/:trackId with an optimistic
 *     splice; on error the row is rolled back and a toast shows why.
 *
 * P5.5 UX polish:
 *   - Shimmer SandboxSkeleton renders while /reset/sessions/:id is
 *     in flight so the page does not paint a blank frame.
 *   - Tracklist shows the first 5 rows by default with a "Show all
 *     N tracks" toggle - keeps the SpotifyBottomNav inside the
 *     phone viewport on first paint.
 *   - First visible row's kebab is highlighted with a green ring
 *     and FirstKebabCoach points at it, so reviewers immediately
 *     see the "remove tracks you dislike" affordance.
 *   - Play button is an SVG triangle sized inside a 56px circle
 *     (previously a unicode glyph that sat off-center).
 *
 * Trust-signal design goals:
 *   - The `SANDBOX - Not saved to library yet` pill sits right
 *     below the playlist title so the user always sees this is
 *     reversible.
 *   - Every track row carries a `Why this?` chip fed from
 *     ResetTrack.llm_explanation (Groq in real mode, templated in
 *     the mock-mode fallback).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PhoneFrame from '../components/PhoneFrame.jsx';
import TrackActionSheet from '../components/TrackActionSheet.jsx';
import SpotifyBottomNav from '../components/SpotifyBottomNav.jsx';
import { useSavedSandbox } from '../context/SavedSandboxContext.jsx';


// ============================================================
// Track-art gradient by scope - keeps rows visually distinct
// without shipping actual album art in mock mode.
// ============================================================
const SCOPE_GRADIENT = {
  language: 'linear-gradient(135deg, #f97316 0%, #facc15 55%, #9f1239 100%)',
  genre:    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 55%, #1e40af 100%)',
  era:      'linear-gradient(135deg, #0891b2 0%, #06b6d4 55%, #0d9488 100%)',
  mood:     'linear-gradient(135deg, #059669 0%, #3b82f6 55%, #7c3aed 100%)',
  default:  'linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #581c87 100%)',
};

function pickGradient(scopeDimensions) {
  const first = (scopeDimensions && scopeDimensions[0]) || 'default';
  return SCOPE_GRADIENT[first] || SCOPE_GRADIENT.default;
}


// ============================================================
// Root page
// ============================================================
export default function SandboxPlaylistPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { saveSandbox, isSaved, isKept } = useSavedSandbox();

  const [session, setSession] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionSheet, setActionSheet] = useState(null); // { track }
  const [toast, setToast] = useState(null);             // { kind, text }
  const [coachDismissed, setCoachDismissed] = useState(false);
  // Show first 5 tracks by default so the bottom nav is visible
  // without any scrolling; "Show all" reveals the rest inline.
  const [showAll, setShowAll] = useState(false);
  // "Save to library" pill shows its muted "saved" state for both
  // pending-Keep (isSaved) and post-Keep (isKept) sessions, so a
  // reviewer coming back from the Library tab does not see a
  // stale unsaved-looking button.
  const alreadySaved = isSaved(sessionId) || isKept(sessionId);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await api.getResetSession(sessionId);
      setSession(s);
      setTracks(Array.isArray(s.tracks) ? s.tracks : []);
    } catch (e) {
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  const scopeLabel = useMemo(() => {
    if (!session) return '';
    const dims = session.scope_dimensions || [];
    return dims.join(' + ');
  }, [session]);

  const totalMin = useMemo(() => {
    // No duration in the API today; approximate 3.5 min/track for the meta line.
    return Math.max(1, Math.round(tracks.length * 3.5));
  }, [tracks.length]);

  const handleRemove = async (trackId) => {
    setActionSheet(null);
    const prev = tracks;
    const next = tracks.filter((t) => t.spotify_track_id !== trackId);
    setTracks(next); // optimistic
    setToast({ kind: 'info', text: 'Removed from this reset' });
    try {
      const updated = await api.removeTrackFromReset(sessionId, trackId);
      // Server is the source of truth; reconcile in case order_index shifted.
      setTracks(Array.isArray(updated.tracks) ? updated.tracks : next);
    } catch (e) {
      setTracks(prev);
      setToast({
        kind: 'error',
        text: `Could not remove: ${e?.message || 'network error'}`,
      });
    } finally {
      setTimeout(() => setToast(null), 2600);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 16px 48px',
    }}>
      {/*
        Screen 2 gets the bottom nav via PhoneFrame's `bottomBar` slot
        so the nav stays pinned to the phone viewport instead of
        scrolling with the track list. No `active` prop = all tabs
        rendered in grey per doc/mockups/screen2-sandbox-playlist.html.
      */}
      <PhoneFrame bottomBar={<SpotifyBottomNav />}>
        <div>
          <TopNavBar onBack={() => navigate('/')} />

          {loading && <SandboxSkeleton />}

          {loadError && !loading && (
            <CenteredMsg
              text={`Could not load session: ${loadError}`}
              action={{ label: 'Retry', onClick: loadSession }}
            />
          )}

          {!loading && !loadError && session && (
            <>
              <PlaylistHeader
                scopeLabel={scopeLabel}
                trackCount={tracks.length}
                totalMinutes={totalMin}
                gradient={pickGradient(session.scope_dimensions)}
              />

              <PlayRow
                alreadySaved={alreadySaved}
                onPlay={() => {
                  const first = tracks[0];
                  if (first) {
                    navigate(
                      `/sandbox/${encodeURIComponent(sessionId)}`
                      + `/now-playing/${encodeURIComponent(first.spotify_track_id)}`,
                    );
                  }
                }}
                onSave={() => {
                  // Save is a pure frontend state flip: the session
                  // already exists on the backend, we're just
                  // promoting it into the user's Home / Library
                  // view. We then route the user to the "Added to
                  // your library" confirmation screen (screen 4-
                  // style) so the state change lands with weight
                  // before they see the Home page.
                  saveSandbox(session);
                  navigate(
                    `/sandbox/${encodeURIComponent(sessionId)}/saved`,
                  );
                }}
              />

              <div style={{ padding: '0 4px' }}>
                {tracks.length === 0 && (
                  <div style={{
                    color: 'var(--pulse-muted)',
                    fontSize: '0.85rem',
                    padding: '16px 12px',
                    textAlign: 'center',
                  }}>
                    You have removed every track. Head back home to try a
                    fresh reset.
                  </div>
                )}
                {/* Render only 5 rows by default so the bottom nav
                    sits inside the viewport on the very first paint.
                    The "Show all" toggle lets the reviewer expand to
                    the full sandbox on demand. */}
                {(showAll ? tracks : tracks.slice(0, 5)).map((t, idx) => (
                  <TrackRow
                    key={t.spotify_track_id}
                    track={t}
                    highlightKebab={idx === 0 && !coachDismissed}
                    onKebab={() => setActionSheet({ track: t })}
                    onPlay={() => navigate(
                      `/sandbox/${encodeURIComponent(sessionId)}`
                      + `/now-playing/${encodeURIComponent(t.spotify_track_id)}`,
                    )}
                  />
                ))}
                {tracks.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((s) => !s)}
                    style={{
                      display: 'block',
                      margin: '4px auto 8px',
                      padding: '6px 14px',
                      borderRadius: 999,
                      background: 'transparent',
                      border: '1px solid #3a3a3a',
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    {showAll
                      ? 'Show less'
                      : `Show all ${tracks.length} tracks`}
                  </button>
                )}
              </div>

              {!coachDismissed && tracks.length > 0 && (
                <FirstKebabCoach
                  onDismiss={() => setCoachDismissed(true)}
                />
              )}
            </>
          )}
        </div>
      </PhoneFrame>

      {actionSheet && (
        <TrackActionSheet
          track={actionSheet.track}
          onClose={() => setActionSheet(null)}
          onRemove={() => handleRemove(actionSheet.track.spotify_track_id)}
        />
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} />}
    </div>
  );
}


// ============================================================
// Sub-components (inlined for MVP)
// ============================================================

function TopNavBar({ onBack }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px 4px',
    }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: '1.2rem',
          padding: 4,
          cursor: 'pointer',
        }}
      >
        {'\u2039'}
      </button>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: '#fff' }}>
        <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{'\u2315'}</span>
        <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{'\u22EE'}</span>
      </div>
    </div>
  );
}


function PlaylistHeader({ scopeLabel, trackCount, totalMinutes, gradient }) {
  return (
    <div style={{ padding: '4px 16px 12px' }}>
      <div style={{
        margin: '4px auto 16px',
        width: 160,
        height: 160,
        borderRadius: 6,
        background: gradient,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
        color: '#fff',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '2.1rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          textShadow: '0 2px 10px rgba(0,0,0,0.35)',
        }}>Pulse</div>
        {scopeLabel && (
          <div style={{
            marginTop: 4,
            fontSize: '0.7rem',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            opacity: 0.9,
          }}>reset {'\u00b7'} {scopeLabel}</div>
        )}
      </div>
      <div style={{
        color: '#fff',
        fontSize: '1.5rem',
        fontWeight: 800,
        letterSpacing: '-0.02em',
        margin: '0 0 4px 0',
      }}>
        Your Pulse Reset
      </div>
      <div style={{
        color: 'var(--pulse-muted)',
        fontSize: '0.82rem',
        marginBottom: 10,
      }}>
        Sandbox playlist {'\u00b7'} {trackCount} songs {'\u00b7'} ~{totalMinutes} min
      </div>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'rgba(179,179,179,0.14)',
        border: '1px solid #2a2a2a',
        color: 'var(--pulse-muted)',
        fontSize: '0.68rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        <span aria-hidden="true">{'\uD83D\uDD12'}</span> Sandbox {'\u00b7'} Not saved to library yet
      </div>
    </div>
  );
}


function PlayRow({ onPlay, onSave, alreadySaved = false }) {
  // Two-CTA layout, secondary + primary:
  //   - Left: small OUTLINED green "Save to library" pill. Auto
  //     width, transparent background, green border + text. This
  //     is Pulse's secondary action - visible but not shouting.
  //   - Right: circular Play button (Pulse green, 48px). Standard
  //     Spotify convention. Play glyph is an SVG triangle so it
  //     sits perfectly centered.
  const savedLabel = alreadySaved ? 'Saved' : '+ Save to library';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 16px 12px',
      gap: 10,
    }}>
      <button
        type="button"
        onClick={onSave}
        disabled={alreadySaved}
        aria-label={alreadySaved ? 'Saved to library' : 'Save to library'}
        style={{
          display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          gap: 6,
          padding: '7px 14px',
          borderRadius: 999,
          background: 'transparent',
          border: `1px solid ${alreadySaved
            ? 'rgba(29,185,84,0.5)'
            : 'rgba(29,185,84,0.7)'}`,
          color: 'var(--pulse-green)',
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          cursor: alreadySaved ? 'default' : 'pointer',
          opacity: alreadySaved ? 0.7 : 1,
        }}
      >
        {savedLabel}
      </button>
      <button
        type="button"
        aria-label="Play"
        onClick={onPlay}
        style={{
          flexShrink: 0,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--pulse-green)',
          color: '#000',
          border: 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* SVG play triangle - baked-in offset (path starts at x=8
            with the visual centre at x=15 of a 24-wide viewbox)
            gives us a perfectly centered glyph without the
            paddingLeft hack that the unicode character needed. */}
        <svg width="18" height="18" viewBox="0 0 24 24"
             fill="currentColor" aria-hidden="true">
          <path d="M8 5.14v13.72a1 1 0 001.53.85l10.63-6.86a1 1 0 000-1.7L9.53 4.29A1 1 0 008 5.14z" />
        </svg>
      </button>
    </div>
  );
}


function TrackRow({ track, onKebab, onPlay, highlightKebab = false }) {
  const scope = (track.scope_origin || '').toLowerCase();
  // The whole row is a tap-to-play surface (matches Spotify).
  // Kebab stopPropagation() prevents opening Now Playing when the
  // user is trying to open the action sheet. When `highlightKebab`
  // is true (first visible row, coach still visible) the button
  // gets a soft green ring so the reviewer notices it is tappable.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay && onPlay(); }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        borderRadius: 6,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: 4,
          background: SCOPE_GRADIENT[scope] || SCOPE_GRADIENT.default,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#fff',
          fontSize: '0.9rem',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{track.title}</div>
        <div style={{
          color: 'var(--pulse-muted)',
          fontSize: '0.78rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{track.artist}</div>
        {track.why && <WhyThisChip why={track.why} />}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onKebab && onKebab(); }}
        aria-label={`Track options for ${track.title}`}
        // First row's kebab gets `pulse-attention-dots` so it
        // gently blinks green - draws the reviewer's eye without
        // adding any extra chrome or borders to the row itself.
        className={highlightKebab ? 'pulse-attention-dots' : undefined}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--pulse-muted)',
          fontSize: '1.3rem',
          padding: '4px 6px',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {'\u22EE'}
      </button>
    </div>
  );
}


function WhyThisChip({ why }) {
  return (
    <div style={{ marginTop: 6 }}>
      <span style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid rgba(29,185,84,0.45)',
        color: 'var(--pulse-green)',
        fontSize: '0.62rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 4,
      }}>Why this?</span>
      <div style={{
        color: '#d1d5db',
        fontSize: '0.75rem',
        lineHeight: 1.45,
      }}>
        {why}
      </div>
    </div>
  );
}


function FirstKebabCoach({ onDismiss }) {
  // Renders directly under the first track row and points its arrow
  // up-and-right so the reviewer's eye lands on the 3-dots button on
  // row 1. The green tint matches the ring we place on that button.
  return (
    <div style={{
      margin: '4px 14px 10px',
      padding: '10px 12px',
      background: 'rgba(29,185,84,0.10)',
      border: '1px solid rgba(29,185,84,0.35)',
      borderRadius: 10,
      color: '#d1fae5',
      fontSize: '0.78rem',
      lineHeight: 1.45,
      position: 'relative',
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      {/* Small arrow indicator pointing up toward the highlighted
          kebab on the first row above. */}
      <div style={{
        position: 'absolute',
        top: -6, right: 22,
        width: 12, height: 12,
        background: 'rgba(11,45,25,0.9)',
        borderTop: '1px solid rgba(29,185,84,0.35)',
        borderLeft: '1px solid rgba(29,185,84,0.35)',
        transform: 'rotate(45deg)',
      }} />
      <span aria-hidden="true" style={{ fontSize: '1rem', flexShrink: 0 }}>
        {'\u25CE'}
      </span>
      <div style={{ flex: 1 }}>
        Tap the blinking 3-dots on any track to remove it from your
        reset. Nothing is saved to your library until you hit
        <strong> + Save to library</strong>.
      </div>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--pulse-green)',
          fontSize: '0.72rem',
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        Got it
      </button>
    </div>
  );
}


function SandboxSkeleton() {
  // Shimmer placeholders for the playlist header + first few rows.
  // Rendered while /reset/sessions/:id is in flight so the reviewer
  // sees the layout stabilise instead of a blank page. Uses the
  // same widths / row heights the real content will occupy so the
  // page does not jump when the fetch resolves.
  return (
    <div>
      <div style={{ padding: '4px 16px 12px' }}>
        <SkelBlock
          width={160}
          height={160}
          radius={6}
          style={{ margin: '4px auto 16px' }}
        />
        <SkelBlock width="70%" height={20} radius={4}
                   style={{ marginBottom: 8 }} />
        <SkelBlock width="45%" height={12} radius={4}
                   style={{ marginBottom: 10 }} />
        <SkelBlock width={200} height={22} radius={999} />
      </div>
      <div style={{
        padding: '6px 16px 12px',
        display: 'flex', gap: 10, alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <SkelBlock width={130} height={30} radius={999} />
        <SkelBlock width={48} height={48} radius={24} />
      </div>
      <div style={{ padding: '0 12px' }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            display: 'flex', gap: 10,
            padding: '10px 4px',
            alignItems: 'center',
          }}>
            <SkelBlock width={44} height={44} radius={4} />
            <div style={{ flex: 1 }}>
              <SkelBlock
                width={`${75 - i * 5}%`}
                height={12} radius={3}
                style={{ marginBottom: 6 }}
              />
              <SkelBlock width={`${55 - i * 4}%`} height={10} radius={3} />
            </div>
            <SkelBlock width={18} height={18} radius={9} />
          </div>
        ))}
      </div>
    </div>
  );
}


function SkelBlock({ width, height, radius = 4, style = {} }) {
  // Simple pulsing bar. The keyframe is registered globally in
  // styles.css (`@keyframes pulse-shimmer`); we fall back to a
  // static grey block if the animation is unavailable.
  return (
    <div
      style={{
        width, height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #1a1a1a 0%, #262626 50%, #1a1a1a 100%)',
        backgroundSize: '200% 100%',
        animation: 'pulse-shimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}


function CenteredMsg({ text, action }) {
  return (
    <div style={{
      padding: '40px 24px',
      color: 'var(--pulse-muted)',
      fontSize: '0.9rem',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
    }}>
      {text}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: 'var(--pulse-green)',
            color: '#000',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >{action.label}</button>
      )}
    </div>
  );
}


function Toast({ kind, text }) {
  const bg = kind === 'error' ? '#7f1d1d' : '#111';
  const border = kind === 'error' ? '#dc2626' : '#2a2a2a';
  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      left: '50%',
      transform: 'translateX(-50%)',
      background: bg,
      border: `1px solid ${border}`,
      color: '#fff',
      padding: '10px 16px',
      borderRadius: 999,
      fontSize: '0.82rem',
      fontWeight: 600,
      zIndex: 90,
      boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
    }}>{text}</div>
  );
}
