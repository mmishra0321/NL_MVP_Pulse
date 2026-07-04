/**
 * SpotifyWordmark - the green Spotify circle icon + "Spotify"
 * text used as a consistent brand marker across the demo.
 *
 * Rendered by:
 *   - PhoneFrame       (top of every mobile screen)
 *   - PersonaPickerModal (above the persona cards)
 *
 * Sizing is driven by the `size` prop; both the SVG and the text
 * scale together so callers can drop it into a compact status bar
 * or a taller header without needing to tweak individual pieces.
 *
 * The SVG paths are Spotify's official mark (three sound-wave
 * curves inside a green circle). It's decorative here - we don't
 * link out or claim any endorsement - so `aria-hidden="true"`.
 */

export default function SpotifyWordmark({
  size = 18,
  color = '#fff',
  gap = 7,
  fontSize,
  fontWeight = 700,
}) {
  const derivedFontSize = fontSize ?? Math.round(size * 0.85);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <svg
        width={size} height={size} viewBox="0 0 168 168"
        aria-hidden="true"
      >
        <circle cx="84" cy="84" r="84" fill="#1DB954" />
        <path fill="#000"
              d="M119.6 122.3c-1.6 2.6-5 3.4-7.6 1.8-20.9-12.7-47.2-15.6-78.2-8.5-3 .7-6-1.2-6.7-4.2-.7-3 1.2-6 4.2-6.7 33.9-7.7 63-4.5 86.5 10 2.6 1.5 3.4 5 1.8 7.6zm9.5-21.2c-2 3.2-6.2 4.2-9.4 2.2-24-14.8-60.6-19-88.9-10.4-3.6 1.1-7.5-1-8.5-4.6-1.1-3.6 1-7.5 4.6-8.5 32.5-9.9 72.7-5.2 100.1 11.6 3.2 2 4.2 6.3 2.1 9.7zm.8-22.1C102.3 62.4 55.2 60.6 27.5 69c-4.4 1.3-9-1.2-10.3-5.5-1.3-4.4 1.2-9 5.5-10.3 31.9-9.7 84-7.5 116.1 11.6 4 2.3 5.3 7.5 3 11.5-2.4 4-7.5 5.3-11.5 3z" />
      </svg>
      <span style={{
        color,
        fontWeight,
        fontSize: derivedFontSize,
        letterSpacing: '-0.01em',
      }}>Spotify</span>
    </div>
  );
}
