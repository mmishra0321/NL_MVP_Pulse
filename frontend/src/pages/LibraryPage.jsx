/**
 * LibraryPage - Pulse's stand-in for Spotify's Library tab.
 *
 * Route: /library (added in App.jsx alongside the four sandbox routes).
 * Reachable via:
 *   - The Library icon in SpotifyBottomNav
 *   - The "Your Pulse Reset" tile on HomePage (which does
 *     `navigate('/library')`)
 *
 * WHY IT EXISTS
 * -------------
 * The Library page reflects the two post-save states of the
 * `SavedSandboxContext`:
 *
 *   1. savedSandbox != null  (trial period, 10 days by default)
 *      -> Renders the shared `SavedSandboxCard` at the top with
 *         inline **Keep** and **Discard** buttons + "N days left"
 *         countdown. Any decision here mutates the same context
 *         slot used by HomePage, so the Home SavedSandboxCard
 *         clears simultaneously.
 *
 *   2. keptPlaylist != null  (post-keep, permanent library entry)
 *      -> Renders a compact `KeptPlaylistRow` under the filter
 *         chips - tapping opens the sandbox playlist page.
 *
 * If BOTH are null we render an empty-state hint.
 *
 * Just like the context itself, all state is ephemeral - hard
 * refresh wipes both slots back to null and the page shows the
 * empty state again.
 */
import { useNavigate } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame.jsx';
import SpotifyBottomNav from '../components/SpotifyBottomNav.jsx';
import SavedSandboxCard from '../components/SavedSandboxCard.jsx';
import {
  useSavedSandbox,
  useSandboxDecision,
} from '../context/SavedSandboxContext.jsx';
import { useState } from 'react';


const SCOPE_GRADIENT = {
  language: 'linear-gradient(135deg, #f97316 0%, #facc15 55%, #9f1239 100%)',
  genre:    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 55%, #1e40af 100%)',
  era:      'linear-gradient(135deg, #0891b2 0%, #06b6d4 55%, #0d9488 100%)',
  mood:     'linear-gradient(135deg, #059669 0%, #3b82f6 55%, #7c3aed 100%)',
  default:  'linear-gradient(135deg, #1DB954 0%, #0f5c2e 100%)',
};


export default function LibraryPage() {
  const navigate = useNavigate();
  const { savedSandbox, keptPlaylist } = useSavedSandbox();
  const [toast, setToast] = useState(null);

  const showToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2800);
  };

  const { decide, busy } = useSandboxDecision({
    onSuccess: (decision) => showToast(
      'info',
      decision === 'keep'
        ? 'Kept \u2014 added to your library and pinned to Home.'
        : 'Sandbox discarded \u2014 nothing changed in your profile.',
    ),
    onError: (e) => showToast(
      'error',
      `Could not save decision: ${e?.message || 'network error'}`,
    ),
  });

  const hasAnything = savedSandbox || keptPlaylist;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 16px 48px',
    }}>
      <PhoneFrame bottomBar={<SpotifyBottomNav active="library" />}>
        <div>
          <LibraryHeader />
          <FilterChips />

          {/* Trial-period sandbox card - matches Home. Both surfaces
              share the same `useSandboxDecision` hook so a Keep or
              Discard tap on either page clears the card everywhere. */}
          {savedSandbox && (
            <>
              <TrialBanner
                daysLeft={computeDaysLeft(savedSandbox.trialEndDate)}
              />
              <SavedSandboxCard
                savedSandbox={savedSandbox}
                busy={busy}
                onOpen={() => navigate(
                  `/sandbox/${encodeURIComponent(savedSandbox.sessionId)}/outcome`,
                )}
                onKeep={() => decide('keep')}
                onDiscard={() => decide('revert')}
              />
            </>
          )}

          {keptPlaylist && (
            <KeptPlaylistRow
              keptPlaylist={keptPlaylist}
              onOpen={() =>
                navigate(`/sandbox/${encodeURIComponent(keptPlaylist.sessionId)}`)
              }
            />
          )}

          {!hasAnything && <EmptyState onBack={() => navigate('/')} />}
        </div>
      </PhoneFrame>

      {toast && <LibraryToast kind={toast.kind} text={toast.text} />}
    </div>
  );
}


function computeDaysLeft(trialEndDate) {
  if (!trialEndDate) return null;
  const end = trialEndDate instanceof Date ? trialEndDate : new Date(trialEndDate);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.ceil((end.getTime() - new Date().getTime()) / msPerDay);
  return Math.max(0, diff);
}


function LibraryHeader() {
  return (
    <div style={{
      padding: '14px 18px 4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg,#059669,#3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 800, fontSize: 13,
        }}>Y</div>
        <p style={{
          color: '#fff', fontSize: 22, fontWeight: 800,
          margin: 0, letterSpacing: '-0.02em',
        }}>Your Library</p>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', color: '#fff' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
    </div>
  );
}


function FilterChips() {
  const chips = ['Playlists', 'Artists', 'Albums'];
  return (
    <div style={{
      display: 'flex', gap: 8,
      padding: '4px 18px 12px',
    }}>
      {chips.map((label, i) => (
        <span key={label} style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '5px 12px',
          borderRadius: 999,
          fontSize: 11, fontWeight: 700,
          background: i === 0 ? 'var(--pulse-green)' : 'rgba(255,255,255,0.08)',
          color: i === 0 ? '#000' : '#fff',
          border: i === 0 ? 'none' : '1px solid #2a2a2a',
        }}>{label}</span>
      ))}
    </div>
  );
}


function TrialBanner({ daysLeft }) {
  // Small green-tinted strip above the SavedSandboxCard that
  // frames it as an in-progress trial: "10-day Pulse trial - keep
  // or discard before it ends". Makes it obvious that the two
  // buttons on the card below are the decision point.
  const isFinalDay = daysLeft != null && daysLeft <= 1;
  return (
    <div style={{
      margin: '0 12px 8px',
      padding: '8px 12px',
      borderRadius: 8,
      background: isFinalDay
        ? 'rgba(220,38,38,0.10)'
        : 'rgba(29,185,84,0.10)',
      border: isFinalDay
        ? '1px solid rgba(220,38,38,0.4)'
        : '1px solid rgba(29,185,84,0.35)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span
        aria-hidden="true"
        style={{
          fontSize: 14,
          color: isFinalDay ? '#f87171' : 'var(--pulse-green)',
        }}
      >{'\u23F0'}</span>
      <div style={{ flex: 1 }}>
        <p style={{
          color: isFinalDay ? '#fca5a5' : '#d1fae5',
          fontSize: 11, fontWeight: 700,
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {isFinalDay ? 'Final call' : 'Pulse trial'}
        </p>
        <p style={{
          color: '#fff',
          fontSize: 12,
          margin: '2px 0 0 0',
          lineHeight: 1.35,
        }}>
          {daysLeft == null
            ? 'Keep or discard before the 10-day trial ends.'
            : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left \u00B7 keep or discard before it ends.`}
        </p>
      </div>
    </div>
  );
}


function KeptPlaylistRow({ keptPlaylist, onOpen }) {
  const scope = keptPlaylist.scopeDimensions?.[0] || 'default';
  const gradient = SCOPE_GRADIENT[scope] || SCOPE_GRADIENT.default;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Your Pulse Reset"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%',
        padding: '10px 18px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          width: 56, height: 56, borderRadius: 6,
          background: gradient,
          flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{
          color: '#fff', fontSize: 13, fontWeight: 800,
          letterSpacing: '-0.02em',
        }}>Pulse</span>
        {/* Same blinking green dot as the Home tile so both surfaces
            call out "new library entry" with the same visual. */}
        <span
          className="pulse-tile-dot"
          style={{
            position: 'absolute',
            top: 6, right: 6,
            width: 9, height: 9,
            borderRadius: '50%',
            background: 'var(--pulse-green)',
            boxShadow: '0 0 6px rgba(29,185,84,0.9)',
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#fff', fontSize: 14, fontWeight: 700,
        }}>Your Pulse Reset</div>
        <div style={{
          color: 'var(--pulse-muted)', fontSize: 12,
        }}>
          Playlist {'\u00B7'} {keptPlaylist.trackCount || 0} tracks {'\u00B7'} Kept
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="var(--pulse-muted)" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round"
           aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}


function EmptyState({ onBack }) {
  return (
    <div style={{
      padding: '48px 22px',
      textAlign: 'center',
      color: 'var(--pulse-muted)',
    }}>
      <div style={{
        margin: '0 auto 12px',
        width: 60, height: 60, borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      </div>
      <p style={{
        color: '#fff', fontSize: 14, fontWeight: 700,
        margin: '0 0 6px 0',
      }}>Nothing kept yet</p>
      <p style={{
        fontSize: 12, lineHeight: 1.5,
        margin: '0 0 16px 0',
      }}>
        Once you save a Pulse reset from Home and hit
        <strong style={{ color: '#fff' }}> Keep</strong>, it will pin
        here.
      </p>
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '7px 16px',
          borderRadius: 999,
          background: 'var(--pulse-green)',
          color: '#000',
          border: 'none',
          fontSize: 12, fontWeight: 700,
          cursor: 'pointer',
        }}
      >Back to Home</button>
    </div>
  );
}


function LibraryToast({ kind, text }) {
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
