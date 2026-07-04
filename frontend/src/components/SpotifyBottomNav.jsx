/**
 * SpotifyBottomNav - the Spotify mobile bottom tab bar.
 *
 * Rendered on:
 *   - screen 1 (Home)     -> active="home"
 *   - screen 2 (Sandbox)  -> active=null (grey/inactive - matches mockup;
 *                            you're inside a playlist, not on a Spotify tab)
 *
 * Not rendered on:
 *   - screen 3 (Now Playing) - Now Playing is a full-bleed listening
 *     surface with the persistent green Pulse ribbon at the bottom
 *     instead of nav tabs.
 *   - screen 4 (Outcome)     - decision surface; nav would compete with
 *     the two big Keep/Revert action buttons.
 *
 * Position: rendered via `PhoneFrame`'s `bottomBar` slot, which is
 * absolute-positioned OUTSIDE the scrollable content area. That means
 * the nav stays anchored to the phone frame's viewport regardless of
 * how far the user scrolls through a long track list.
 *
 * Icons: identical SVG paths across all screens - keeps the nav
 * visually stable when a user flips between screen 1 and screen 2.
 */


import { useNavigate } from 'react-router-dom';

// Only Home and Library route anywhere in the MVP - the other three
// tabs stay decorative to match the mockup. Adding routes for
// Search / Premium / Create would require full pages that are out
// of scope for this iteration.
const NAV_ITEMS = [
  { key: 'home',    label: 'Home',     icon: 'home',    to: '/'        },
  { key: 'search',  label: 'Search',   icon: 'search',  to: null       },
  { key: 'library', label: 'Library',  icon: 'library', to: '/library' },
  { key: 'premium', label: 'Premium',  icon: 'premium', to: null       },
  { key: 'create',  label: 'Create',   icon: 'create',  to: null       },
];


export default function SpotifyBottomNav({ active = null }) {
  const navigate = useNavigate();
  return (
    <nav style={{
      height: '100%',
      background: '#000',
      padding: '12px 0 10px',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      borderTop: '0.5px solid #1a1a1a',
      boxSizing: 'border-box',
    }}>
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.key}
          label={item.label}
          icon={item.icon}
          isActive={item.key === active}
          onClick={item.to ? () => navigate(item.to) : null}
        />
      ))}
    </nav>
  );
}


function NavItem({ label, icon, isActive, onClick }) {
  const color = isActive ? '#1DB954' : '#B3B3B3';
  return (
    <button
      type="button"
      onClick={onClick || undefined}
      disabled={!onClick}
      aria-label={label}
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 3,
        padding: '2px 6px',
        background: 'transparent',
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
           stroke={color} strokeWidth="2" strokeLinecap="round"
           strokeLinejoin="round" aria-hidden="true">
        {renderIcon(icon)}
      </svg>
      <span style={{
        color, fontSize: 9,
        fontWeight: isActive ? 700 : 500,
      }}>{label}</span>
    </button>
  );
}


function renderIcon(icon) {
  switch (icon) {
    case 'home':
      return (
        <>
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </>
      );
    case 'library':
      return (
        <>
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </>
      );
    case 'premium':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
        </>
      );
    case 'create':
      return (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </>
      );
    default:
      return null;
  }
}
