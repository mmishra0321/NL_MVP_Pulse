/**
 * PersonaBadge - the compact "Viewing as: <name> - Change" pill that sits
 * fixed in the top-right corner OUTSIDE the phone frame.
 *
 * Only rendered when a persona is currently chosen. Clicking "Change"
 * clears the persona, which causes HomePage to re-open the PersonaPickerModal.
 */

export default function PersonaBadge({ displayName, avatarInitial, onChange }) {
  if (!displayName) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 6px 6px',
        background: 'rgba(20, 20, 20, 0.9)',
        border: '1px solid #2a2a2a',
        borderRadius: 999,
        color: '#fff',
        fontSize: '0.78rem',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'rgba(29,185,84,0.18)',
          color: 'var(--pulse-green)',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}
      >
        {avatarInitial || displayName.charAt(0)}
      </span>
      <span style={{ color: 'var(--pulse-muted)' }}>Viewing as</span>
      <span style={{ fontWeight: 600 }}>{displayName}</span>
      <button
        type="button"
        onClick={onChange}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--pulse-green)',
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'pointer',
          marginLeft: 4,
        }}
      >
        Change {'\u203A'}
      </button>
    </div>
  );
}
