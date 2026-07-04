/**
 * TrackActionSheet - bottom-sheet track-options overlay.
 *
 * Used from:
 *   - screen 2 (SandboxPlaylistPage) via each row's kebab (track-level menu)
 *   - screen 3 (NowPlayingPage) via the top-right kebab (session + track menu)
 *
 * Matches doc/mockups/screen2-sandbox-playlist.html + screen3-now-playing.html
 * (both show the identical sheet). "Remove from this reset" is wired to
 * the backend; the other three are dumb links to signal the surface is
 * a real Spotify-context menu, not a bespoke Pulse popover.
 *
 * `onDecide` (optional) - when the caller passes a handler, the sheet
 * renders an extra "Save this playlist" action at the top. Screen 3
 * uses this so the top-right kebab is the entry point into the
 * outcome page (screen 4). Screen 2's per-track kebabs deliberately
 * do NOT pass onDecide - a session-scoped decision does not belong in
 * a track-scoped menu.
 *
 * Wording note: the top action reads as a plain action-verb ("Save
 * this playlist") rather than the more precise-but-cryptic "Decide
 * now - Keep or Revert" that the earlier build used. The Keep path
 * IS the save-to-library outcome, and Revert is available on the
 * outcome screen itself. The sub-copy is honest that the choice is
 * still exposed one screen away.
 */

export default function TrackActionSheet({ track, onClose, onRemove, onDecide }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#181818',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          width: '100%',
          maxWidth: 420,
          padding: '10px 0 18px',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.5)',
          animation: 'pulse-sheet-in 220ms ease-out',
        }}
      >
        <div style={{
          width: 42, height: 4, background: '#3a3a3a',
          borderRadius: 4, margin: '4px auto 12px',
        }} />
        <div style={{ padding: '0 18px 14px', borderBottom: '1px solid #232323' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>{track.title}</div>
          <div style={{ color: 'var(--pulse-muted)', fontSize: '0.8rem' }}>{track.artist}</div>
        </div>
        {onDecide && (
          <SheetAction
            label="Save this playlist"
            sub="See what you played, then keep to library or revert."
            accent
            onClick={onDecide}
            icon={'\u2665'}
          />
        )}
        <SheetAction
          label="Remove from this reset"
          sub="Track is dropped from the sandbox; nothing changes in your library."
          destructive
          onClick={onRemove}
          icon={'\u2716'}
        />
        <SheetAction label="Add to another playlist" icon={'+'} disabled />
        <SheetAction label="Share" icon={'\u2934'} disabled />
        <SheetAction label="Go to artist" icon={'\u25CE'} disabled />
      </div>
    </div>
  );
}


function SheetAction({
  label, sub, icon,
  destructive = false, accent = false, disabled = false,
  onClick,
}) {
  const textColor =
    disabled    ? '#4b5563' :
    destructive ? '#f87171' :
    accent      ? '#1DB954' :
    '#fff';
  const subColor =
    destructive ? 'rgba(248,113,113,0.75)' :
    accent      ? 'rgba(29,185,84,0.75)' :
    'var(--pulse-muted)';
  const bg = accent ? 'rgba(29,185,84,0.06)' : 'transparent';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        width: '100%',
        background: bg,
        border: 'none',
        borderRadius: 0,
        padding: '14px 18px',
        color: textColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '1.05rem', minWidth: 22 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '0.9rem',
          fontWeight: (destructive || accent) ? 700 : 500,
        }}>{label}</div>
        {sub && (
          <div style={{
            fontSize: '0.72rem',
            color: subColor,
            marginTop: 2,
            lineHeight: 1.4,
          }}>{sub}</div>
        )}
      </div>
    </button>
  );
}
