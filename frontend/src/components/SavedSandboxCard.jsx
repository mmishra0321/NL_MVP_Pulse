/**
 * SavedSandboxCard - the "Your Pulse Reset is saved" home tile.
 *
 * Rendered near the top of HomePage when SavedSandboxContext holds
 * an entry (user tapped "Save to library" from Screen 2 or Screen 3).
 * Shows:
 *   - The Pulse gradient artwork (matches Screen 2 header)
 *   - "Your Pulse Reset" title + a "Saved to library" pill
 *   - `N days left` derived from the session's trial_end_date
 *   - Two inline actions: Keep (green, primary) and Discard (grey)
 *   - Tapping the card body opens the full outcome page (Screen 4)
 *
 * Both action buttons call the props (`onKeep` / `onDiscard`); the
 * caller owns the network round-trip + toast + context cleanup.
 */
import { useMemo } from 'react';

const SCOPE_GRADIENT = {
  language: 'linear-gradient(135deg, #f97316 0%, #facc15 55%, #9f1239 100%)',
  genre:    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 55%, #1e40af 100%)',
  era:      'linear-gradient(135deg, #0891b2 0%, #06b6d4 55%, #0d9488 100%)',
  mood:     'linear-gradient(135deg, #059669 0%, #3b82f6 55%, #7c3aed 100%)',
  default:  'linear-gradient(135deg, #1DB954 0%, #0f5c2e 100%)',
};


function computeDaysLeft(trialEndDate) {
  if (!trialEndDate) return null;
  const end = trialEndDate instanceof Date ? trialEndDate : new Date(trialEndDate);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.ceil((end.getTime() - now.getTime()) / msPerDay);
  return Math.max(0, diff);
}


export default function SavedSandboxCard({
  savedSandbox,
  onOpen,
  onKeep,
  onDiscard,
  busy = false,
}) {
  const daysLeft = useMemo(
    () => computeDaysLeft(savedSandbox?.trialEndDate),
    [savedSandbox?.trialEndDate],
  );
  const scope = savedSandbox?.scopeDimensions?.[0] || 'default';
  const gradient = SCOPE_GRADIENT[scope] || SCOPE_GRADIENT.default;

  if (!savedSandbox) return null;

  return (
    <div style={{
      margin: '10px 12px 14px',
      background: '#181818',
      borderRadius: 12,
      border: '1px solid rgba(29,185,84,0.35)',
      overflow: 'hidden',
    }}>
      {/* Tappable body -> opens the full outcome page. Buttons live
          in a separate row so their taps don't bubble here. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open outcome details"
        style={{
          display: 'flex', width: '100%',
          gap: 12, padding: '12px 12px 10px',
          background: 'transparent', border: 'none',
          textAlign: 'left', cursor: 'pointer',
          color: '#fff',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56, height: 56, flexShrink: 0, borderRadius: 6,
            background: gradient,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{
            fontSize: '0.85rem', fontWeight: 800, color: '#fff',
            letterSpacing: '-0.02em',
          }}>Pulse</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{
              color: '#fff', fontWeight: 700, fontSize: '0.95rem',
            }}>
              Your Pulse Reset
            </span>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: 'var(--pulse-green)',
              padding: '2px 7px',
              border: '1px solid rgba(29,185,84,0.45)',
              borderRadius: 999,
              background: 'rgba(29,185,84,0.08)',
            }}>Saved to library</span>
          </div>
          <div style={{
            color: 'var(--pulse-muted)', fontSize: '0.75rem',
            marginTop: 4,
          }}>
            {savedSandbox.trackCount || 0} songs {'\u00B7'} sandbox trial
          </div>
          <div style={{
            marginTop: 6,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              display: 'inline-block',
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--pulse-green)',
            }} />
            <span style={{
              color: '#fff', fontSize: '0.78rem', fontWeight: 600,
            }}>
              {daysLeft != null ? `${daysLeft} days left` : 'Trial active'}
            </span>
            <span style={{
              color: 'var(--pulse-muted)', fontSize: '0.72rem',
            }}>
              {'\u00B7'} tap for details
            </span>
          </div>
        </div>
      </button>

      {/* Action row - Keep on the left, Discard on the right. Both
          call the parent so it can round-trip the /decide endpoint. */}
      <div style={{
        display: 'flex', gap: 8,
        padding: '10px 12px 12px',
        borderTop: '1px solid #232323',
      }}>
        <ActionButton
          label="Keep"
          primary
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onKeep && onKeep(); }}
        />
        <ActionButton
          label="Discard"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onDiscard && onDiscard(); }}
        />
      </div>
    </div>
  );
}


function ActionButton({ label, primary = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '9px 12px',
        borderRadius: 999,
        fontSize: '0.82rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: primary ? 'none' : '1px solid #3a3a3a',
        background: primary ? 'var(--pulse-green)' : 'transparent',
        color: primary ? '#000' : '#fff',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {label}
    </button>
  );
}
