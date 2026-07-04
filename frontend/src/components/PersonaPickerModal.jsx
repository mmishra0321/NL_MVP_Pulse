/**
 * PersonaPickerModal - the first-load persona chooser.
 *
 * Rendered OUTSIDE the PhoneFrame; this is a demo-only meta-UI, not part
 * of the Spotify experience. Shown when no persona has been picked yet;
 * dismissed by selecting one of the three cards. No close button - the
 * choice is required. See doc/architecture.md §5.5 for the full spec.
 *
 * Data source: GET /users, which returns the enriched roster with plan,
 * tenure_months, eligible_for_pulse, signature_quote, why_ineligible,
 * etc. (populated from backend/mock_data/mock_users.json).
 *
 * Layout notes (post-2026-07-04 refinement):
 *   - Overlay uses `align-items:flex-start` (not center) so tall modals
 *     scroll from the top rather than clipping their header.
 *   - Cards render a subtle green LEFT-accent stripe on eligible
 *     personas instead of a full-perimeter green border - the sheet
 *     feels less noisy with two eligible cards side by side.
 *   - Portrait photos come from randomuser.me/api/portraits (free CDN,
 *     deterministic URLs). Failure falls back to the initial-circle so
 *     the picker still works offline.
 *   - A small Spotify wordmark sits at the top of the modal so the
 *     picker reads as a Spotify-context demo, not a bespoke Pulse
 *     popover.
 */
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import SharedSpotifyWordmark from './SpotifyWordmark.jsx';

const KEY_FOR_ID = {
  'demo-aanya-002': 'aanya',
  'demo-karthik-001': 'karthik',
  'demo-riya-003': 'riya',
};

// Curated professional headshots keyed by persona ID. randomuser.me
// serves the same portrait for each URL so the demo is deterministic.
// Picked to match rough demographic (age / gender) of each persona.
const PORTRAIT_FOR_ID = {
  'demo-aanya-002':  'https://randomuser.me/api/portraits/women/44.jpg',
  'demo-karthik-001':'https://randomuser.me/api/portraits/men/52.jpg',
  'demo-riya-003':   'https://randomuser.me/api/portraits/women/68.jpg',
};


export default function PersonaPickerModal({ show, onPick }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.listUsers()
      .then((u) => {
        if (cancelled) return;
        setUsers(Array.isArray(u) ? u : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load personas');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [show]);

  if (!show) return null;

  const ordered = [...users].sort((a, b) => {
    if (a.eligible_for_pulse === b.eligible_for_pulse) {
      return (a.display_name || '').localeCompare(b.display_name || '');
    }
    return a.eligible_for_pulse ? -1 : 1;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pulse-picker-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--picker-overlay)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '2.5rem 1rem 3rem',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'var(--picker-card-max-w)',
          background: '#121212',
          borderRadius: 16,
          padding: '1.5rem 1.35rem 1.35rem',
          border: '1px solid #232323',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Spotify wordmark row - establishes the "this is a Spotify
            surface" context before Pulse-brand copy takes over.
            Uses the shared SpotifyWordmark component so the mark
            matches the one PhoneFrame ships at the top of every
            in-app screen. */}
        <div style={{ marginBottom: 14 }}>
          <SharedSpotifyWordmark size={20} />
        </div>

        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.62rem',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--pulse-green)',
            marginBottom: 6,
          }}
        >
          Pulse {'\u00b7'} demo chooser
        </div>
        <h2
          id="pulse-picker-title"
          style={{
            color: '#fff',
            fontSize: '1.25rem',
            fontWeight: 700,
            margin: '0 0 6px 0',
            lineHeight: 1.25,
          }}
        >
          Choose a demo persona
        </h2>
        <p
          style={{
            color: 'var(--pulse-muted)',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            margin: '0 0 1.1rem 0',
          }}
        >
          Pulse is a mobile prototype. Pick a persona to see how it
          behaves for that user.
        </p>

        {loading && (
          <div style={{ color: 'var(--pulse-muted)', fontSize: '0.9rem', padding: '1rem 0' }}>
            Loading personas{'\u2026'}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '0.75rem 0.85rem',
              background: '#2a1212',
              border: '1px solid #5a2020',
              borderRadius: 8,
              color: '#fecaca',
              fontSize: '0.85rem',
              marginBottom: 12,
            }}
          >
            Backend unavailable {'\u2014'} {error}. Start the FastAPI backend and refresh.
          </div>
        )}

        {!loading && !error && ordered.length === 0 && (
          <div style={{ color: 'var(--pulse-muted)', fontSize: '0.87rem' }}>
            No personas seeded yet. Run{' '}
            <code style={{ color: '#fff' }}>POST /jobs/run-detection</code>{' '}
            to seed the demo users, then refresh this page.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ordered.map((u) => (
            <PersonaCard
              key={u.id}
              user={u}
              onPick={() => {
                const key = KEY_FOR_ID[u.id];
                if (key && onPick) onPick(key);
              }}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: '0.7rem',
            color: 'var(--pulse-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          You can change this any time from the badge in the top-right.
        </div>
      </div>
    </div>
  );
}


// ============================================================
// PersonaCard
// ============================================================

function PersonaCard({ user, onPick }) {
  const eligible = !!user.eligible_for_pulse;
  const plan = (user.plan || 'free').toString().toLowerCase();
  const isPremium = plan === 'premium';
  const portraitUrl = PORTRAIT_FOR_ID[user.id];

  // Trim the why-line to one crisp sentence for eligible personas
  // (the fixture quotes can be quite long) and to the first
  // half-sentence for ineligible personas.
  const whyLine = eligible
    ? shortenQuote(user.signature_quote)
    : shortenReason(user.why_ineligible);

  // Compact demographic line: age + location. Role deliberately
  // dropped to reduce clutter - it lives in the persona doc if
  // reviewers want the full profile.
  const demographicLine = [
    user.age ? `${user.age}` : null,
    user.location,
  ].filter(Boolean).join(' \u00b7 ');

  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: '#1a1a1a',
        // Subtle left-accent stripe for eligibility instead of a
        // bright full-perimeter border - two eligible cards no
        // longer scream at the reviewer.
        border: '1px solid #262626',
        borderLeft: `3px solid ${eligible ? 'var(--pulse-green)' : '#3a3a3a'}`,
        borderRadius: 10,
        padding: '0.75rem 0.9rem',
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#212121')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#1a1a1a')}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Avatar
          portraitUrl={portraitUrl}
          initial={user.avatar_initial || (user.display_name || '?').charAt(0)}
          eligible={eligible}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: name + plan pill + eligibility mini-tag */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{
              color: '#fff', fontWeight: 600, fontSize: '0.98rem',
            }}>
              {user.display_name || user.id}
            </span>
            <PlanPill isPremium={isPremium} />
            {!eligible && (
              <span style={{
                fontSize: '0.62rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--pulse-muted)',
              }}>
                {'\uD83D\uDD07'} pulse stays silent
              </span>
            )}
          </div>
          {/* Row 2: age · location (single line, tight) */}
          {demographicLine && (
            <div style={{
              color: 'var(--pulse-muted)', fontSize: '0.75rem',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {demographicLine}
            </div>
          )}
          {/* Row 3: single-line why (quote or ineligibility reason,
              truncated with ellipsis so it never wraps > 2 lines) */}
          {whyLine && (
            <div style={{
              marginTop: 6,
              fontSize: '0.78rem',
              lineHeight: 1.42,
              color: eligible ? '#d1d5db' : 'var(--pulse-muted)',
              fontStyle: eligible ? 'italic' : 'normal',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {eligible ? `\u201C${whyLine}\u201D` : whyLine}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}


// ============================================================
// Avatar - portrait with initial fallback
// ============================================================

function Avatar({ portraitUrl, initial, eligible }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = portraitUrl && !imgFailed;

  const commonStyle = {
    width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
    overflow: 'hidden', display: 'flex', alignItems: 'center',
    justifyContent: 'center',
  };

  if (showImage) {
    return (
      <div style={{
        ...commonStyle,
        border: `2px solid ${eligible ? 'rgba(29,185,84,0.55)' : '#3a3a3a'}`,
      }}>
        <img
          src={portraitUrl}
          alt=""
          onError={() => setImgFailed(true)}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  // Fallback: initial-in-circle. Same size, same border treatment
  // so the layout doesn't shift when a portrait fails to load.
  return (
    <div style={{
      ...commonStyle,
      background: eligible
        ? 'rgba(29,185,84,0.18)'
        : 'rgba(179,179,179,0.15)',
      color: eligible ? 'var(--pulse-green)' : 'var(--pulse-muted)',
      fontSize: '1.05rem', fontWeight: 700,
      border: `2px solid ${eligible ? 'rgba(29,185,84,0.55)' : '#3a3a3a'}`,
    }}>
      {initial}
    </div>
  );
}


function PlanPill({ isPremium }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 999,
        fontSize: '0.62rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        background: isPremium ? 'var(--plan-pill-premium-bg)' : 'var(--plan-pill-free-bg)',
        color: isPremium ? 'var(--plan-pill-premium-fg)' : 'var(--plan-pill-free-fg)',
      }}
    >
      {isPremium ? 'Premium' : 'Free'}
    </span>
  );
}


// ============================================================
// Copy shorteners
// ============================================================

function shortenQuote(quote) {
  if (!quote) return null;
  const trimmed = quote.trim();
  // Cap at ~110 chars so the card never grows a third line.
  if (trimmed.length <= 110) return trimmed;
  return trimmed.slice(0, 107).trimEnd() + '\u2026';
}

function shortenReason(reason) {
  if (!reason) return 'Not in the Pulse target segment.';
  // The mock_users.json "why_ineligible" strings are long paragraphs.
  // Take the first sentence up to the first period + space.
  const firstSentence = reason.split(/\.\s+/)[0];
  const withDot = firstSentence.endsWith('.') ? firstSentence : firstSentence + '.';
  return withDot;
}
