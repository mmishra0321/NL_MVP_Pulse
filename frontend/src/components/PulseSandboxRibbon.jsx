/**
 * PulseSandboxRibbon - the persistent green strip anchored to the
 * bottom of the phone frame during sandbox playback (screen 3) and
 * on the outcome page (screen 4).
 *
 * Design goal: the reversibility promise ("this is a sandbox, you
 * decide on day 10") must stay on-screen at all times during the
 * trial window. That is what earns trust; that is what makes users
 * comfortable letting Pulse pick 20 tracks for them.
 *
 * The Keep-or-Revert CTA is NOT rendered inside the ribbon. That path
 * lives inside the top-right kebab menu on screen 3 ("Decide now -
 * Keep or Revert" in the TrackActionSheet) so the listening surface
 * stays visually clean and the ribbon reads as a status strip, not
 * as a call-to-action that competes with the transport controls.
 *
 * Layout:
 *   [green dot] Pulse Sandbox                             X days left
 *   OR
 *   [green dot] Pulse Sandbox                             Kept / Reverted
 */


export default function PulseSandboxRibbon({ daysLeft, decision }) {
  const alreadyDecided = decision === 'keep' || decision === 'revert';
  const statusText = alreadyDecided
    ? (decision === 'keep' ? 'Kept' : 'Reverted')
    : `${Math.max(0, daysLeft)} days left`;
  const statusColor = alreadyDecided
    ? 'var(--pulse-green)'
    : 'rgba(255,255,255,0.7)';

  return (
    <div style={{
      background: '#0F5C2E',
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--pulse-green)',
          boxShadow: '0 0 6px rgba(29,185,84,0.75)',
        }} />
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
          Pulse Sandbox
        </span>
      </div>

      <span style={{
        color: statusColor,
        fontSize: 12,
        fontWeight: alreadyDecided ? 700 : 500,
      }}>
        {statusText}
      </span>
    </div>
  );
}


/**
 * Utility: compute integer days-left from `trial_end_date` (ISO string
 * or Date). Rounds up so anything ">0" reads as at least "1 days left"
 * even in the last hour of Day 10.
 */
export function computeDaysLeft(trialEndDate) {
  if (!trialEndDate) return 0;
  const end = typeof trialEndDate === 'string' ? new Date(trialEndDate) : trialEndDate;
  if (Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
