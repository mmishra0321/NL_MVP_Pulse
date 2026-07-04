/**
 * OutcomePage - Pulse screen 4 (Day-10 Keep or Revert).
 *
 * Route:  /sandbox/:sessionId/outcome
 * Loads:  GET /reset/sessions/:id/outcome (rich payload) +
 *         GET /reset/sessions/:id       (for `decision`, if already decided)
 *
 * Renders (top -> bottom, inside PhoneFrame; NO bottom nav):
 *   - Nav row:   back-chevron (routes to /sandbox/:id) + kebab (visual only)
 *   - Header:    DayPill + "How was your reset?" title + "N days of sandbox listening" sub
 *   - Cards:     OutcomeSummaryCard + DiversityScoreCard
 *   - Coach:     "Revert removes the playlist with zero profile impact. Keep saves these tracks to your library."
 *   - Actions:   [Keep · Save to your library]   [Revert · Remove the sandbox]
 *
 * Wiring (T45):
 *   - Keep   -> api.decideReset(id, 'keep')   -> toast + navigate to /
 *   - Revert -> api.decideReset(id, 'revert') -> toast + navigate to /
 *   - If session.decision already set, the buttons render as disabled
 *     "Kept" / "Reverted" pills - matches the ribbon-idempotency in
 *     screen 3 and prevents accidental re-decisions on refresh.
 *
 * Design intent: this page has to feel like a verdict, not a form.
 * Evidence first (cards), then a single-tap decision. Both branches
 * end with the user back on Home so screen 1 <-> screen 4 <-> screen 1
 * is a demoable 90-second loop.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import PhoneFrame from '../components/PhoneFrame.jsx';
import DayPill from '../components/DayPill.jsx';
import OutcomeSummaryCard from '../components/OutcomeSummaryCard.jsx';
import DiversityScoreCard from '../components/DiversityScoreCard.jsx';


// ============================================================
// Root page
// ============================================================

export default function OutcomePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [outcome, setOutcome] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [deciding, setDeciding] = useState(null);   // 'keep' | 'revert' | null
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Fetch both in parallel - the summary+score cards read from
      // outcome, and the button state reads from session.decision.
      const [o, s] = await Promise.all([
        api.getResetOutcome(sessionId),
        api.getResetSession(sessionId),
      ]);
      setOutcome(o);
      setSession(s);
    } catch (e) {
      setLoadError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const alreadyDecided = session?.decision === 'keep' || session?.decision === 'revert';

  const daysOfListening = useMemo(() => outcome?.day_index ?? 10, [outcome]);

  const decide = async (decision) => {
    if (alreadyDecided || deciding) return;
    setDeciding(decision);
    try {
      await api.decideReset(sessionId, decision);
      const nextToast = decision === 'keep'
        ? 'Reset kept \u2014 20 tracks saved to your library'
        : 'Sandbox removed \u2014 nothing changed in your profile';
      setToast(nextToast);
      // Give the toast a beat to be seen, then home. The ribbon on
      // screen 3 will read "Kept" / "Reverted" on the next visit.
      setTimeout(() => navigate('/'), 1300);
    } catch (e) {
      setDeciding(null);
      setToast(`Could not decide: ${e?.message || 'network error'}`);
      setTimeout(() => setToast(null), 2600);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 16px 48px',
    }}>
      <PhoneFrame>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}>
          <TopNavRow onBack={() => navigate(`/sandbox/${encodeURIComponent(sessionId)}`)} />

          {loading && <CenteredMsg text="Measuring your reset..." />}

          {loadError && !loading && (
            <CenteredMsg
              text={`Could not load outcome: ${loadError}`}
              action={{ label: 'Retry', onClick: load }}
            />
          )}

          {!loading && !loadError && outcome && (
            <>
              <PageHeader dayIndex={outcome.day_index} daysOfListening={daysOfListening} />
              <OutcomeSummaryCard outcome={outcome} />
              <DiversityScoreCard outcome={outcome} />

              {!coachDismissed && (
                <CoachMark onDismiss={() => setCoachDismissed(true)} />
              )}

              <div style={{ flex: 1 }} />

              <ActionButtons
                alreadyDecided={alreadyDecided}
                decision={session?.decision}
                deciding={deciding}
                onKeep={() => decide('keep')}
                onRevert={() => decide('revert')}
              />
            </>
          )}
        </div>
      </PhoneFrame>

      {toast && <Toast text={toast} />}
    </div>
  );
}


// ============================================================
// Sub-components (inlined for MVP)
// ============================================================

function TopNavRow({ onBack }) {
  return (
    <div style={{
      padding: '10px 20px 0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to sandbox"
        style={{
          background: 'transparent', border: 'none',
          padding: 4, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="white" strokeWidth="2.5" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div aria-hidden="true" style={{ padding: 4, opacity: 0.7 }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="white" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </div>
    </div>
  );
}


function PageHeader({ dayIndex, daysOfListening }) {
  return (
    <div style={{
      padding: '20px 22px 0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      <div style={{ marginBottom: 12 }}>
        <DayPill dayIndex={dayIndex} />
      </div>
      <h1 style={{
        color: '#fff', fontSize: 24, fontWeight: 800,
        textAlign: 'center', margin: '0 0 5px 0',
        lineHeight: 1.2,
      }}>How was your reset?</h1>
      <p style={{
        color: 'var(--pulse-muted)', fontSize: 12,
        textAlign: 'center', margin: '0 0 18px 0',
      }}>
        {daysOfListening} days of sandbox listening
      </p>
    </div>
  );
}


function CoachMark({ onDismiss }) {
  return (
    <div style={{
      margin: '12px 20px 0',
      background: 'var(--pulse-surface, #181818)',
      borderRadius: 10,
      padding: '10px 14px',
      border: '1px solid #333',
      flexShrink: 0,
    }}>
      <p style={{
        color: '#fff', fontSize: 10, lineHeight: 1.4,
        margin: '0 0 3px 0',
      }}>
        Revert removes the playlist with zero profile impact. Keep
        saves these tracks to your library.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--pulse-muted)', fontSize: 10, fontWeight: 600,
          padding: 0, cursor: 'pointer',
        }}
      >Got it</button>
    </div>
  );
}


function ActionButtons({ alreadyDecided, decision, deciding, onKeep, onRevert }) {
  const isKeepBusy = deciding === 'keep';
  const isRevertBusy = deciding === 'revert';
  const anyBusy = deciding !== null;

  return (
    <div style={{
      padding: '0 20px 20px',
      display: 'flex',
      gap: 12,
      flexShrink: 0,
    }}>
      {/* Keep */}
      <button
        type="button"
        onClick={onKeep}
        disabled={alreadyDecided || anyBusy}
        style={{
          flex: 1,
          background: alreadyDecided && decision !== 'keep'
            ? '#2a2a2a'
            : 'var(--pulse-green)',
          color: alreadyDecided && decision !== 'keep' ? '#666' : '#000',
          border: 'none',
          padding: '16px 10px 12px',
          borderRadius: 14,
          cursor: (alreadyDecided || anyBusy) ? 'not-allowed' : 'pointer',
          textAlign: 'center',
          opacity: alreadyDecided && decision !== 'keep' ? 0.55 : 1,
        }}
      >
        <span style={{
          fontSize: 17, fontWeight: 800,
          display: 'block', marginBottom: 3,
        }}>
          {alreadyDecided && decision === 'keep' ? 'Kept' :
           isKeepBusy ? 'Saving\u2026' : 'Keep'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 500,
          opacity: 0.75, display: 'block',
        }}>
          Save to your library
        </span>
      </button>

      {/* Revert */}
      <button
        type="button"
        onClick={onRevert}
        disabled={alreadyDecided || anyBusy}
        style={{
          flex: 1,
          background: alreadyDecided && decision === 'revert' ? '#2a2a2a' : 'transparent',
          color: '#fff',
          border: `1.5px solid ${alreadyDecided && decision === 'revert' ? '#666' : '#444'}`,
          padding: '16px 10px 12px',
          borderRadius: 14,
          cursor: (alreadyDecided || anyBusy) ? 'not-allowed' : 'pointer',
          textAlign: 'center',
          opacity: alreadyDecided && decision !== 'revert' ? 0.55 : 1,
        }}
      >
        <span style={{
          fontSize: 17, fontWeight: 700,
          display: 'block', marginBottom: 3,
        }}>
          {alreadyDecided && decision === 'revert' ? 'Reverted' :
           isRevertBusy ? 'Removing\u2026' : 'Revert'}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--pulse-muted)',
          display: 'block',
        }}>
          Remove the sandbox
        </span>
      </button>
    </div>
  );
}


// ============================================================
// Small utility components
// ============================================================

function CenteredMsg({ text, action }) {
  return (
    <div style={{
      padding: '40px 24px',
      color: 'var(--pulse-muted)',
      fontSize: '0.9rem',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      justifyContent: 'center',
    }}>
      {text}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: 'var(--pulse-green)',
            color: '#000',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >{action.label}</button>
      )}
    </div>
  );
}


function Toast({ text }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#111',
      border: '1px solid #2a2a2a',
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
