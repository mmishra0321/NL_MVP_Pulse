/**
 * NowPlayingPage - Pulse screen 3.
 *
 * Route:  /sandbox/:sessionId/now-playing/:trackId
 * Loads:  GET /reset/sessions/:sessionId
 * Renders (top -> bottom, all inside PhoneFrame):
 *   - Top nav row: down chevron (back to sandbox) + "PLAYING FROM PLAYLIST /
 *     Your Pulse Reset" label + kebab (opens shared TrackActionSheet)
 *   - Cover art (280x280 green gradient with "Pulse" wordmark + "reset - <scope>")
 *   - Track row: name + artist + heart icon
 *   - Progress bar with mm:ss/mm:ss (visual only, no audio playback)
 *   - Transport controls: shuffle (green + dot), prev, play/pause (50x50 white
 *     circle - deliberately smaller than Spotify's 60px reference so it
 *     does not overpower the sandbox ribbon), next, repeat
 *   - Device row: "This iPhone"
 *   - Coach mark pointing to the top kebab
 *   - Flex spacer -> the ribbon always hugs the bottom of the frame
 *   - PulseSandboxRibbon (green, persistent) - the reversibility promise
 *
 * Design goals (why this page exists at all):
 *   - Prove Pulse is a first-class listening context, not a modal that
 *     the user has to keep in mind. Once they hit Play from the sandbox
 *     playlist, they are inside the standard Spotify Now Playing surface
 *     PLUS the green Pulse Sandbox ribbon. That ribbon is the visual
 *     anchor of "you can walk this back".
 *
 * MVP scope:
 *   - No real audio playback. The play button toggles the play/pause
 *     icon state; the progress bar is a fixed 38% fill matching the
 *     mockup so the surface reads as real.
 *   - Track-page removal (kebab -> Remove) fires the same DELETE
 *     endpoint the sandbox playlist uses, then navigates back to the
 *     sandbox with a toast. Rationale: if you remove the currently-
 *     playing track, "now playing this track" no longer makes sense.
 *   - The "Save this playlist" action inside the top kebab flips
 *     the frontend SavedSandboxContext flag (making the sandbox
 *     visible as a card on Home) and routes back to Home with a
 *     toast. The Keep / Discard decision itself lives on that Home
 *     card so the user can review the countdown before committing.
 *     The ribbon stays as a passive status strip so it does not
 *     compete with the transport controls for the user's attention
 *     during playback.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PhoneFrame from '../components/PhoneFrame.jsx';
import TrackActionSheet from '../components/TrackActionSheet.jsx';
import PulseSandboxRibbon, { computeDaysLeft } from '../components/PulseSandboxRibbon.jsx';
import { useSavedSandbox } from '../context/SavedSandboxContext.jsx';


// ============================================================
// Root page
// ============================================================

export default function NowPlayingPage() {
  const { sessionId, trackId } = useParams();
  const navigate = useNavigate();
  const { saveSandbox, isSaved } = useSavedSandbox();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await api.getResetSession(sessionId);
      setSession(s);
    } catch (e) {
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  const track = useMemo(() => {
    if (!session || !Array.isArray(session.tracks)) return null;
    return session.tracks.find((t) => t.spotify_track_id === trackId) || null;
  }, [session, trackId]);

  const scopeLabel = useMemo(() => {
    if (!session) return '';
    const dims = session.scope_dimensions || [];
    return dims.join(' + ');
  }, [session]);

  const daysLeft = useMemo(() => {
    return session ? computeDaysLeft(session.trial_end_date) : 0;
  }, [session]);

  const handleBack = () => navigate(`/sandbox/${encodeURIComponent(sessionId)}`);

  const handleRemoveCurrent = async () => {
    setActionSheetOpen(false);
    if (!track) return;
    setBusy(true);
    try {
      await api.removeTrackFromReset(sessionId, track.spotify_track_id);
      setToast('Removed from this reset');
      setTimeout(() => {
        navigate(`/sandbox/${encodeURIComponent(sessionId)}`);
      }, 600);
    } catch (e) {
      setBusy(false);
      setToast(`Could not remove: ${e?.message || 'network error'}`);
      setTimeout(() => setToast(null), 2400);
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
      <PhoneFrame>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          // 44px status bar sits at top of PhoneFrame; content starts here.
        }}>
          {loading && (
            <CenteredMsg text="Loading your Pulse Reset..." />
          )}
          {loadError && !loading && (
            <CenteredMsg
              text={`Could not load session: ${loadError}`}
              action={{ label: 'Retry', onClick: loadSession }}
            />
          )}
          {!loading && !loadError && !track && (
            <CenteredMsg
              text="That track is not in this sandbox any more."
              action={{ label: 'Back to sandbox', onClick: handleBack }}
            />
          )}

          {!loading && !loadError && track && (
            <>
              <TopNavRow
                onBack={handleBack}
                onKebab={() => setActionSheetOpen(true)}
              />
              <CoverArt scopeLabel={scopeLabel} />
              <TrackRow track={track} />
              <ProgressBar />
              <TransportControls
                isPlaying={isPlaying}
                onToggle={() => setIsPlaying((p) => !p)}
              />
              <DeviceRow />
              {!coachDismissed && (
                <TopKebabCoach onDismiss={() => setCoachDismissed(true)} />
              )}
              <div style={{ flex: 1 }} />
              <PulseSandboxRibbon
                daysLeft={daysLeft}
                decision={session?.decision}
              />
            </>
          )}
        </div>
      </PhoneFrame>

      {actionSheetOpen && track && (
        <TrackActionSheet
          track={track}
          onClose={() => setActionSheetOpen(false)}
          onRemove={handleRemoveCurrent}
          onDecide={
            // "Save this playlist" on Screen 3 now behaves the same
            // as the new Screen 2 button: it flips the frontend
            // "saved" flag (which surfaces the sandbox on Home with
            // the countdown + Keep/Discard) and routes the user
            // back home so they can see it. Hidden once the session
            // is already decided or already saved - the ribbon /
            // home card cover that state.
            session?.decision || isSaved(sessionId) ? undefined : () => {
              // Mirror the Screen 2 "+ Save to library" pill: flip
              // the frontend save flag, then route to the
              // full-screen "Added to your library" confirmation
              // (screen 4-style) instead of dropping straight into
              // Home. Keeps the save moment legible during a demo.
              setActionSheetOpen(false);
              saveSandbox(session);
              navigate(
                `/sandbox/${encodeURIComponent(sessionId)}/saved`,
              );
            }
          }
        />
      )}

      {busy && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)',
          pointerEvents: 'none', zIndex: 70,
        }} />
      )}
      {toast && <Toast text={toast} />}
    </div>
  );
}


// ============================================================
// Sub-components
// ============================================================

function TopNavRow({ onBack, onKebab }) {
  return (
    <div style={{
      padding: '10px 20px 0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to sandbox"
        style={{
          background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/*
          Left-chevron back arrow. The mockup ships a down-chevron
          (Spotify convention for "minimize now-playing"), but our
          MVP has no minimize behavior - the button is just plain
          back navigation to the sandbox playlist - so a leftward
          arrow reads more accurately here and matches screens 2 & 4.
        */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="white" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div style={{ textAlign: 'center' }}>
        <p style={{
          color: 'var(--pulse-muted)', fontSize: 10, fontWeight: 600,
          letterSpacing: '1px', margin: 0,
        }}>PLAYING FROM PLAYLIST</p>
        <p style={{
          color: '#fff', fontSize: 13, fontWeight: 700,
          margin: '2px 0 0 0',
        }}>Your Pulse Reset</p>
      </div>

      <button
        type="button"
        onClick={onKebab}
        aria-label="Track options"
        style={{
          background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="white" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </div>
  );
}


function CoverArt({ scopeLabel }) {
  return (
    <div style={{
      padding: '20px 28px 14px',
      display: 'flex', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div style={{
        width: 280, height: 280, borderRadius: 12,
        background: 'linear-gradient(145deg,#1DB954,#0a3d1f)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6,
        boxShadow: '0 20px 60px rgba(29,185,84,0.25), 0 8px 24px rgba(0,0,0,0.5)',
      }}>
        <span style={{
          color: '#fff', fontSize: 30, fontWeight: 800,
          letterSpacing: '1px',
        }}>Pulse</span>
        {scopeLabel && (
          <span style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: 12, letterSpacing: '0.5px',
          }}>reset {'\u00b7'} {scopeLabel}</span>
        )}
      </div>
    </div>
  );
}


function TrackRow({ track }) {
  return (
    <div style={{
      padding: '0 28px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
      flexShrink: 0,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          color: '#fff', fontSize: 21, fontWeight: 800,
          margin: '0 0 3px 0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{track.title}</p>
        <p style={{
          color: 'var(--pulse-muted)', fontSize: 14, margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{track.artist}</p>
      </div>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
           stroke="#555" strokeWidth="1.5" strokeLinecap="round"
           strokeLinejoin="round" aria-label="Add to library">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </div>
  );
}


function ProgressBar() {
  // Cosmetic only; MVP does not play actual audio. The 38% fill
  // matches the mockup so the surface reads as real.
  return (
    <div style={{ padding: '0 28px', marginBottom: 14, flexShrink: 0 }}>
      <div style={{
        height: 4, background: '#333', borderRadius: 2,
        marginBottom: 6, position: 'relative',
      }}>
        <div style={{
          height: 4, width: '38%',
          background: '#fff', borderRadius: 2,
        }} />
        <div style={{
          width: 12, height: 12, background: '#fff',
          borderRadius: '50%',
          position: 'absolute', top: -4, left: '37%',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--pulse-muted)', fontSize: 11 }}>1:24</span>
        <span style={{ color: 'var(--pulse-muted)', fontSize: 11 }}>3:47</span>
      </div>
    </div>
  );
}


function TransportControls({ isPlaying, onToggle }) {
  return (
    <div style={{
      padding: '0 22px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      flexShrink: 0,
    }}>
      {/* Shuffle (with green active dot) */}
      <div style={{ position: 'relative' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             stroke="var(--pulse-green)" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round" aria-label="Shuffle">
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
        </svg>
        <div style={{
          width: 4, height: 4, background: 'var(--pulse-green)',
          borderRadius: '50%',
          position: 'absolute', bottom: -7, left: '50%',
          transform: 'translateX(-50%)',
        }} />
      </div>

      {/* Previous */}
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
           stroke="white" strokeWidth="1.8" strokeLinecap="round"
           strokeLinejoin="round" aria-label="Previous">
        <polygon points="19 20 9 12 19 4 19 20" />
        <line x1="5" y1="19" x2="5" y2="5" />
      </svg>

      {/* Play / Pause - compact 50px disc. Original 60px felt over-
          weighted next to the 28px transport glyphs; the tighter
          circle reads as "primary control" without dominating the
          bottom half of the phone frame. Shadow softened to match. */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: 50, height: 50, borderRadius: '50%',
          background: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
        }}
      >
        {isPlaying ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#000" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#000" aria-hidden="true">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        )}
      </button>

      {/* Next */}
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
           stroke="white" strokeWidth="1.8" strokeLinecap="round"
           strokeLinejoin="round" aria-label="Next">
        <polygon points="5 4 15 12 5 20 5 4" />
        <line x1="19" y1="5" x2="19" y2="19" />
      </svg>

      {/* Repeat */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
           stroke="#555" strokeWidth="1.8" strokeLinecap="round"
           strokeLinejoin="round" aria-label="Repeat">
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 014-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 01-4 4H3" />
      </svg>
    </div>
  );
}


function DeviceRow() {
  return (
    <div style={{
      padding: '0 28px 10px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 7,
      flexShrink: 0,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="#555" strokeWidth="2" strokeLinecap="round"
           strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <span style={{ color: 'var(--pulse-muted)', fontSize: 12 }}>
        This iPhone
      </span>
    </div>
  );
}


function TopKebabCoach({ onDismiss }) {
  // Matches doc/mockups/screen3-now-playing.html lines 36-39, 71.
  // Arrow points BOTTOM-right (down toward the ribbon area) because
  // the actual kebab is at the top of the screen and the arrow in
  // the mockup actually points *up* toward it - but the mockup
  // renders it as a bottom-arrow variant because the coach floats
  // just below the transport controls, not near the top nav.
  // We keep the mockup's exact geometry.
  return (
    <div style={{
      margin: '0 12px',
      background: '#181818',
      borderRadius: 10,
      padding: '10px 14px',
      border: '1px solid #333',
      position: 'relative',
      flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute',
        top: -7, right: 50,
        width: 12, height: 12,
        background: '#181818',
        borderTop: '1px solid #333',
        borderLeft: '1px solid #333',
        transform: 'rotate(45deg)',
      }} />
      <p style={{
        color: '#fff', fontSize: 10, lineHeight: 1.4,
        margin: '0 0 3px 0',
      }}>
        Tap the 3 dots at the top to save this playlist to your
        library, remove a track, or see more options.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--pulse-muted)', fontSize: 10, fontWeight: 600,
          padding: 0, cursor: 'pointer',
        }}
      >Got it</button>
    </div>
  );
}


// ============================================================
// Small utility components
// ============================================================

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
      flex: 1,
      justifyContent: 'center',
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


function Toast({ text }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#111',
      border: '1px solid #2a2a2a',
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
