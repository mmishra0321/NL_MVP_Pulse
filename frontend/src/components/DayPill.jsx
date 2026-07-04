/**
 * DayPill - green-bordered pill announcing "PULSE RESET - DAY N".
 *
 * Screen 4's headline element. Matches
 * doc/mockups/screen4-keep-or-revert.html line 53.
 */

export default function DayPill({ dayIndex }) {
  return (
    <span style={{
      display: 'inline-block',
      background: '#1a2a1a',
      color: 'var(--pulse-green)',
      fontSize: 10,
      fontWeight: 800,
      padding: '4px 14px',
      borderRadius: 20,
      letterSpacing: '0.8px',
      border: '1px solid var(--pulse-green)',
    }}>
      PULSE RESET {'\u00b7'} DAY {dayIndex}
    </span>
  );
}
