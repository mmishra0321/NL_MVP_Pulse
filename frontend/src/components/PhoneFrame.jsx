/**
 * PhoneFrame - the 375x812 rounded-notch iPhone shell every Pulse
 * screen renders inside.
 *
 * The top of every phone used to show a fake iOS-style status bar
 * ("9:41" + wifi/signal/battery). That was cute but not honest -
 * it's a web demo, not an iOS build, and the little icons added
 * visual noise. It has been replaced with a consistent Spotify
 * brand bar (green Spotify circle + wordmark), which is the same
 * top-of-frame marker every screen now shares. The choice makes
 * two things obvious at a glance:
 *
 *   1. This is *inside* Spotify - Pulse is a feature layer, not a
 *      standalone app.
 *   2. All four screens (Home, Sandbox, Now Playing, Outcome) plus
 *      Library carry the same header, so the demo reads as a
 *      cohesive product rather than five loose mockups.
 *
 * Layout slots:
 *   1. `SpotifyBrandBar` at top (44px, fixed) - green logo + wordmark
 *   2. Scrollable content area in the middle - `children` prop
 *   3. Optional `bottomBar` slot pinned to the frame's bottom
 *
 * The bottom bar lives OUTSIDE the scroll container so it stays glued
 * to the phone frame's viewport regardless of how far the user scrolls
 * inside the content. Screens that pass a bottomBar (Home, Sandbox,
 * Library) automatically get their scroll area shortened by
 * BOTTOM_BAR_H so the last content row is never hidden behind the
 * nav.
 *
 * Now Playing (screen 3) does NOT use `bottomBar`; it renders a
 * `PulseSandboxRibbon` inline at the end of a flex-column layout.
 * That page has fixed content height so there's no scroll, and the
 * ribbon and the transport controls have to share space explicitly.
 */
import SpotifyWordmark from './SpotifyWordmark.jsx';

const PHONE_W = 375;
const PHONE_H = 812;
const RADIUS = 44;
const BRAND_BAR_H = 44;
const BOTTOM_BAR_H = 62;


export default function PhoneFrame({ children, bottomBar = null, dimmed = false }) {
  return (
    <div
      style={{
        width: PHONE_W,
        height: PHONE_H,
        borderRadius: RADIUS,
        background: 'var(--pulse-bg)',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 0 0 8px #111 inset',
        margin: '0 auto',
        filter: dimmed ? 'brightness(0.35) saturate(0.6)' : 'none',
        pointerEvents: dimmed ? 'none' : 'auto',
        transition: 'filter 180ms ease',
      }}
    >
      <SpotifyBrandBar />
      <div
        style={{
          position: 'absolute',
          top: BRAND_BAR_H,
          left: 0,
          right: 0,
          // When a bottom bar is present, shrink the scroll area so
          // its last child clears the fixed nav.
          bottom: bottomBar ? BOTTOM_BAR_H : 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          color: '#fff',
        }}
      >
        {children}
      </div>
      {bottomBar && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: BOTTOM_BAR_H,
            zIndex: 6,
          }}
        >
          {bottomBar}
        </div>
      )}
    </div>
  );
}


function SpotifyBrandBar() {
  // Sits where the old iOS status bar used to. Green Spotify mark
  // + wordmark on the left, small green PULSE pill on the right so
  // it's obvious which layer of the product the reviewer is
  // looking at. The bar height is the same 44px so no downstream
  // page has to re-calculate offsets.
  return (
    <div
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: BRAND_BAR_H,
        padding: '10px 16px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        // Pointer events off - the bar is decorative branding.
        // (If we later add a "back to Spotify" affordance, this
        // is the right place to hook it up.)
        pointerEvents: 'none',
      }}
    >
      <SpotifyWordmark size={18} />
      <span
        aria-hidden="true"
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.14em',
          color: 'var(--pulse-green)',
          padding: '3px 8px',
          borderRadius: 999,
          border: '1px solid rgba(29,185,84,0.5)',
          background: 'rgba(29,185,84,0.08)',
        }}
      >PULSE</span>
    </div>
  );
}
