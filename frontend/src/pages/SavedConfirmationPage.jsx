/**
 * SavedConfirmationPage - "Successfully added to your library" screen.
 *
 * Route:  /sandbox/:sessionId/saved
 * Trigger: User taps "+ Save to library" on the Sandbox Playlist (screen 2)
 *          OR "Save this playlist" from the Now Playing kebab (screen 3).
 *
 * Design intent:
 *   Between the Save action and the Home page's Keep / Discard card,
 *   we insert a full-screen confirmation surface so the "it was saved"
 *   moment lands with weight. Without it, the sandbox-to-Home
 *   transition happens in ~900ms and the reviewer misses the state
 *   change. The screen mirrors the visual grammar of screen 4
 *   (OutcomePage): PhoneFrame + brand bar, no bottom nav, a single
 *   large primary CTA sitting at the bottom of the frame.
 *
 * Layout (top -> bottom, all inside PhoneFrame):
 *   - Back chevron top-left (returns to the sandbox playlist)
 *   - Big filled green check circle (visual anchor)
 *   - Title: "Added to your library"
 *   - Sub:   "Your Pulse sandbox is saved. You have 10 days to decide
 *            whether to keep it or discard it."
 *   - Trial mini-card echoing the countdown ("N days to decide")
 *   - Flex spacer
 *   - Big filled green "Back to home" button pinned to the bottom
 *
 * Contract:
 *   - Reads `savedSandbox` from SavedSandboxContext for the countdown;
 *     never mutates it (Save happens on the caller page BEFORE we
 *     navigate here).
 *   - If someone lands on this URL without an active `savedSandbox`
 *     for this session, we still render a generic "Saved" message
 *     so a copy-pasted URL does not look broken.
 */
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PhoneFrame from '../components/PhoneFrame.jsx';
import { useSavedSandbox } from '../context/SavedSandboxContext.jsx';


export default function SavedConfirmationPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { savedSandbox } = useSavedSandbox();

  // Show a live countdown when we still have the saved-sandbox in
  // context (fresh save this session). If context is empty - e.g.
  // the user hit refresh on this URL - fall back to the trial-end
  // date on the session payload if we ever wire it in, or just a
  // static "10 days".
  const daysLeft = useMemo(() => {
    if (!savedSandbox?.trialEndDate) return 10;
    const end = new Date(savedSandbox.trialEndDate).getTime();
    const now = Date.now();
    const days = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    return days;
  }, [savedSandbox]);

  return (
    <PhoneFrame>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#fff',
      }}>
        {/* --- Top nav row: back arrow only (matches OutcomePage) --- */}
        <div style={{
          padding: '12px 20px 0',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => navigate(
              `/sandbox/${encodeURIComponent(sessionId)}`,
            )}
            aria-label="Back to sandbox"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
                 stroke="#fff" strokeWidth="2" strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* --- Hero block: check icon + title + sub --- */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 28px',
          textAlign: 'center',
        }}>
          <SuccessCheckCircle />

          <h1 style={{
            margin: '24px 0 8px',
            fontSize: '1.4rem',
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}>
            Added to your library
          </h1>

          <p style={{
            margin: 0,
            fontSize: '0.92rem',
            lineHeight: 1.45,
            color: 'var(--pulse-muted, #b3b3b3)',
            maxWidth: 300,
          }}>
            Your Pulse sandbox is saved. You have{' '}
            <strong style={{ color: '#1ed760' }}>{daysLeft} days</strong>
            {' '}to decide whether to keep it or discard it.
          </p>

          {/* --- Small trial-window card echoes the countdown --- */}
          <div style={{
            marginTop: 24,
            width: '100%',
            maxWidth: 320,
            padding: '12px 14px',
            background: 'rgba(30, 215, 96, 0.08)',
            border: '1px solid rgba(30, 215, 96, 0.25)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'center',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#1ed760',
              boxShadow: '0 0 8px rgba(30,215,96,0.6)',
            }} />
            <span style={{
              fontSize: '0.78rem',
              color: '#c4f5d5',
              letterSpacing: '0.02em',
            }}>
              Trial window {'\u00B7'} {daysLeft} days remaining
            </span>
          </div>
        </div>

        {/* --- Primary CTA pinned to the bottom of the frame --- */}
        <div style={{
          padding: '16px 20px 24px',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              padding: '14px 18px',
              background: '#1ed760',
              color: '#000',
              border: 'none',
              borderRadius: 999,
              fontSize: '0.95rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(30, 215, 96, 0.25)',
            }}
          >
            Back to home
          </button>

          <p style={{
            margin: '10px 0 0',
            fontSize: '0.72rem',
            color: 'var(--pulse-muted, #888)',
            textAlign: 'center',
            letterSpacing: '0.01em',
          }}>
            You can keep or discard the sandbox from your home page.
          </p>
        </div>
      </div>
    </PhoneFrame>
  );
}


// ============================================================
// Success check circle - big green disc with a white check inside.
// SVG only (no font icon dep). Sized so it reads as the hero
// element without pushing the CTA below the fold on the phone
// frame (max viewport ~812px).
// ============================================================
function SuccessCheckCircle() {
  return (
    <div style={{
      width: 96,
      height: 96,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 25%, #23e678 0%, #16a24a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 10px 28px rgba(30, 215, 96, 0.35), inset 0 -2px 8px rgba(0,0,0,0.25)',
    }}>
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none"
           stroke="#fff" strokeWidth="3" strokeLinecap="round"
           strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}
