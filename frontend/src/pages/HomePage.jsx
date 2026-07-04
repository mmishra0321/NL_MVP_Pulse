/**
 * HomePage - Pulse mobile-first home (screen 1 of 4).
 *
 * Layout matches doc/mockups/screen1-home-nudge.html one-for-one:
 *   [PhoneFrame]
 *   ├── SVG status bar (time + signal/wifi/battery)
 *   ├── Top row: gradient avatar + green notification badge + All/Music/Podcasts pills
 *   ├── Popular albums   (3 persona-themed album tiles, horizontal)
 *   ├── PulseNudgeCard   (compact green-dot PULSE label + title + sub + Try a reset / Not now)
 *   ├── DismissPill      ("Reset available - check back next Monday", after Not now)
 *   ├── Made For You     (Discover Weekly-style tile)
 *   ├── Popular radio    (2 radio tiles)
 *   ├── Coach mark       ("Pulse notices when you get stuck..."), dismissible, localStorage-backed
 *   └── Bottom nav (SVG icons: Home Search Library Premium Create)
 *
 * First-load flow:
 *   1. Fresh browser -> usePersona() returns { personaKey: null }
 *   2. PersonaPickerModal opens over a dimmed PhoneFrame
 *   3. User picks a card -> setPersona(key), modal dismisses
 *   4. HomePage renders that persona's home end-to-end
 *
 * Every content field (albums, radios, avatar gradient, notification count,
 * stuck-value label in the nudge title) is looked up from PERSONA_CONTENT
 * so the whole scene switches when a persona is picked.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import usePersona from '../hooks/usePersona.js';
import PhoneFrame from '../components/PhoneFrame.jsx';
import PersonaPickerModal from '../components/PersonaPickerModal.jsx';
import PersonaBadge from '../components/PersonaBadge.jsx';
import SpotifyBottomNav from '../components/SpotifyBottomNav.jsx';
import SavedSandboxCard from '../components/SavedSandboxCard.jsx';
import { useSavedSandbox, useSandboxDecision } from '../context/SavedSandboxContext.jsx';


// ============================================================
// Persona-specific home content
// ============================================================
//
// Each persona's home mirrors what a real Spotify user would see given
// their listening pattern. Aanya + Karthik get themed albums and radios
// that echo the pattern their nudge is calling out. Riya gets an
// intentionally diverse mix so it's visibly clear she has NOT collapsed
// on any one axis.
//
// `stuckValue` is used to hydrate the Pulse card title with a specific
// noun ("Telugu", "dream pop", ...) rather than the generic scope name.
// Falls back to the raw scope string if no mapping exists.
const PERSONA_CONTENT = {
  'demo-aanya-002': {
    avatarInitial: 'A',
    avatarGradient: 'linear-gradient(135deg,#ec4899,#8b5cf6)',
    notificationCount: 2,
    stuckValue: {
      genre: 'dream pop',
      language: 'English indie',
      era: 'the 2020s',
      mood: 'melancholic',
    },
    popularAlbums: [
      { title: 'Blue Rev',       artist: 'Alvvays',       sym: 'B', grad: 'linear-gradient(135deg,#4a1a5a,#c026d3)' },
      { title: "Preacher's",     artist: 'Ethel Cain',    sym: 'P', grad: 'linear-gradient(135deg,#5c1a2a,#dc2626)' },
      { title: 'Time Skiffs',    artist: 'Animal Coll.',  sym: 'T', grad: 'linear-gradient(135deg,#0f3460,#5c1a8a)' },
    ],
    discover: { title: 'Discover Weekly', sub: 'Hidden gems and deep cuts', grad: 'linear-gradient(135deg,#0f3460,#5c1a8a)' },
    radioTiles: [
      { grad: 'linear-gradient(135deg,#5a2d82,#9b4dca)' },
      { grad: 'linear-gradient(135deg,#1e3a5c,#4a90d9)' },
    ],
  },
  'demo-karthik-001': {
    avatarInitial: 'K',
    avatarGradient: 'linear-gradient(135deg,#ff6b35,#e8a020)',
    notificationCount: 3,
    stuckValue: {
      language: 'Telugu',
      genre: 'Telugu film music',
      era: 'the 2020s',
      mood: 'romantic',
    },
    popularAlbums: [
      { title: 'Aashiqui 2', artist: 'Mithoon',      sym: 'A', grad: 'linear-gradient(135deg,#8B0000,#cc3300)' },
      { title: 'Sanam Teri', artist: 'Himesh R.',    sym: 'S', grad: 'linear-gradient(135deg,#1a3a6b,#2d6abf)' },
      { title: 'Finding You', artist: 'Kushagra',    sym: 'F', grad: 'linear-gradient(135deg,#2d4a1e,#4a8a2e)' },
    ],
    discover: { title: 'Discover Weekly', sub: 'Hidden gems and deep cuts', grad: 'linear-gradient(135deg,#0f3460,#5c1a8a)' },
    radioTiles: [
      { grad: 'linear-gradient(135deg,#5a2d82,#9b4dca)' },
      { grad: 'linear-gradient(135deg,#8B4513,#cd853f)' },
    ],
  },
  'demo-riya-003': {
    avatarInitial: 'R',
    avatarGradient: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
    notificationCount: 5,
    stuckValue: {},
    popularAlbums: [
      { title: 'Short n\u2019 Sweet', artist: 'S. Carpenter', sym: 'S', grad: 'linear-gradient(135deg,#ec4899,#f472b6)' },
      { title: 'Cowboy Carter',       artist: 'Beyonce',       sym: 'C', grad: 'linear-gradient(135deg,#7c3aed,#facc15)' },
      { title: 'GNX',                  artist: 'K. Dot',        sym: 'G', grad: 'linear-gradient(135deg,#111827,#374151)' },
    ],
    discover: { title: 'Discover Weekly', sub: 'A mix of new tracks based on today\u2019s vibes', grad: 'linear-gradient(135deg,#059669,#3b82f6)' },
    radioTiles: [
      { grad: 'linear-gradient(135deg,#059669,#3b82f6)' },
      { grad: 'linear-gradient(135deg,#f97316,#facc15)' },
    ],
  },
};

const DEFAULT_CONTENT = {
  avatarInitial: '?',
  avatarGradient: 'linear-gradient(135deg,#535353,#232323)',
  notificationCount: 0,
  stuckValue: {},
  popularAlbums: [],
  discover: { title: 'Discover Weekly', sub: 'Hidden gems for you', grad: 'linear-gradient(135deg,#0f3460,#5c1a8a)' },
  radioTiles: [],
};

// One place to remember whether the coach mark has been dismissed on this
// browser. Persists across page reloads so it does not annoy the reviewer.
const COACH_STORAGE_KEY = 'pulse.coach.home.dismissed';


// ============================================================
// Page root
// ============================================================

export default function HomePage() {
  const { personaKey, personaId, setPersona, clearPersona } = usePersona();
  const [users, setUsers] = useState([]);
  const [nudge, setNudge] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listUsers()
      .then((u) => setUsers(Array.isArray(u) ? u : []))
      .catch(() => setUsers([]));
  }, []);

  const refreshNudge = useCallback(async (uid) => {
    if (!uid) { setNudge(null); return; }
    setError(null);
    try {
      const n = await api.getLatestNudge(uid).catch(() => null);
      setNudge(n);
    } catch (e) {
      setError(e.message || String(e));
    }
  }, []);

  useEffect(() => { refreshNudge(personaId); }, [personaId, refreshNudge]);

  const activeUser = users.find((u) => u.id === personaId) || null;
  const content = personaId ? (PERSONA_CONTENT[personaId] || DEFAULT_CONTENT) : DEFAULT_CONTENT;
  const displayName = activeUser?.display_name || 'there';

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '32px 16px 48px',
      position: 'relative',
    }}>
      {personaKey && (
        <PersonaBadge
          displayName={displayName}
          avatarInitial={content.avatarInitial}
          onChange={clearPersona}
        />
      )}

      <PhoneFrame
        dimmed={!personaKey}
        bottomBar={personaKey ? <SpotifyBottomNav active="home" /> : null}
      >
        {personaKey && (
          <MobileHome
            content={content}
            nudge={nudge}
            personaId={personaId}
            onNudgeChange={() => refreshNudge(personaId)}
            error={error}
          />
        )}
      </PhoneFrame>

      <PersonaPickerModal show={!personaKey} onPick={setPersona} />

      {personaKey && (
        <Link
          to="/engine"
          style={{
            position: 'fixed',
            bottom: 12,
            left: 12,
            fontSize: '0.7rem',
            color: '#6b7280',
            textDecoration: 'none',
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px dashed #2a2a2a',
          }}
          title="Backend diagnostics (dashboard, run history)"
        >
          Engine diagnostics {'\u2192'}
        </Link>
      )}
    </div>
  );
}


// ============================================================
// MobileHome - everything inside the PhoneFrame
// ============================================================

function MobileHome({ content, nudge, personaId, onNudgeChange, error }) {
  const navigate = useNavigate();
  const { savedSandbox, keptPlaylist } = useSavedSandbox();
  const [locallyDismissed, setLocallyDismissed] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(() => {
    try { return localStorage.getItem(COACH_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [toast, setToast] = useState(null); // { kind: 'info' | 'error', text }

  // Reset the local dismiss when persona or nudge id changes.
  useEffect(() => { setLocallyDismissed(false); }, [personaId, nudge?.id]);

  const persistCoachDismiss = () => {
    setCoachDismissed(true);
    try { localStorage.setItem(COACH_STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  const showToast = (kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2800);
  };

  // Keep + Discard round-trip is shared with LibraryPage via the
  // `useSandboxDecision` hook; both surfaces mutate the same
  // context slot so a decision made on either page instantly
  // clears the SavedSandboxCard on the other.
  const { decide: runDecision, busy: decideBusy } = useSandboxDecision({
    onSuccess: (decision) => showToast(
      'info',
      decision === 'keep'
        ? 'Kept \u2014 added to your library and pinned to Home.'
        : 'Sandbox discarded \u2014 nothing changed in your profile.',
    ),
    onError: (e) => showToast(
      'error',
      `Could not save decision: ${e?.message || 'network error'}`,
    ),
  });

  // The "Pulse notices when you get stuck..." coach mark and the
  // Try-a-reset nudge card are both suppressed once a sandbox is
  // either saved-with-decision-pending OR already-kept. Rationale:
  //   - savedSandbox: a reset is in flight; another CTA would compete
  //   - keptPlaylist: the user just kept a sandbox this session, so
  //     pushing another "Try a reset" immediately reads as spammy.
  // The nudge slot is instead filled by CheckYourLibraryNudge (saved
  // state) or KeptInLibraryNudge (kept state) below, so the row is
  // never empty. Everything resets on hard-refresh via
  // SavedSandboxContext being memory-only.
  const hasSavedSandbox = !!savedSandbox;
  const hasKeptPlaylist = !!keptPlaylist;
  const suppressPulseCard = hasSavedSandbox || hasKeptPlaylist;
  const showPulseCard = !!nudge
    && nudge.status === 'pending'
    && !locallyDismissed
    && !suppressPulseCard;
  const showDismissPill = !!nudge
    && nudge.status === 'pending'
    && locallyDismissed
    && !suppressPulseCard;

  return (
    <div>
      <TopRow
        avatarInitial={content.avatarInitial}
        avatarGradient={content.avatarGradient}
        notificationCount={content.notificationCount}
      />

      {/* SavedSandboxCard sits above Popular Albums when a save is
          in effect - matches the mental model that a saved playlist
          is the most-recent-library-add, so it belongs near the top. */}
      {savedSandbox && (
        <SavedSandboxCard
          savedSandbox={savedSandbox}
          busy={decideBusy}
          onOpen={() => navigate(
            `/sandbox/${encodeURIComponent(savedSandbox.sessionId)}/outcome`,
          )}
          onKeep={() => runDecision('keep')}
          onDiscard={() => runDecision('revert')}
        />
      )}

      <PopularAlbums albums={content.popularAlbums} />

      {showPulseCard && (
        <PulseNudgeCard
          nudge={nudge}
          personaId={personaId}
          stuckValue={content.stuckValue}
          onOpenReset={onNudgeChange}
          onDismiss={() => setLocallyDismissed(true)}
        />
      )}

      {/* When a sandbox is saved-but-not-yet-kept, the "Try a reset"
          nudge is intentionally suppressed (pointing at a fresh reset
          would be noise while one is already in flight). We slot a
          calmer "Check your library" nudge in its place so the row
          is not empty and the reviewer knows exactly where to go
          next. This nudge stays until the page is refreshed - matches
          the session-local wipe contract of SavedSandboxContext. */}
      {savedSandbox && !keptPlaylist && (
        <CheckYourLibraryNudge onOpen={() => navigate('/library')} />
      )}

      {/* Post-Keep state: the sandbox is now a permanent library
          entry. We DO NOT want the "Try a reset" nudge to reappear
          this session (would read as spam right after a decision),
          so we render a small confirmation nudge in the same slot
          instead. Refreshing the browser wipes keptPlaylist and
          restores the normal Try-a-reset nudge - repeatable demo. */}
      {keptPlaylist && (
        <KeptInLibraryNudge onOpen={() => navigate('/library')} />
      )}

      {showDismissPill && (
        <DismissPill onClose={() => { /* already hidden - noop */ }} />
      )}

      {error && (
        <div style={{
          margin: '10px 18px 0',
          padding: '10px 12px',
          background: '#2a1212',
          border: '1px solid #5a2020',
          borderRadius: 8,
          color: '#fecaca',
          fontSize: '0.78rem',
        }}>{error}</div>
      )}

      {/* "Your Pulse Reset" surfaces above Made For You once the
          user has hit Keep on the SavedSandboxCard. Tapping the
          tile deep-links into the Library tab where the same
          playlist is pinned. */}
      {keptPlaylist && (
        <YourPulseResetSection
          keptPlaylist={keptPlaylist}
          onOpen={() => navigate('/library')}
        />
      )}

      <MadeForYou discover={content.discover} />

      <PopularRadio tiles={content.radioTiles} />

      {!coachDismissed && !hasSavedSandbox && !keptPlaylist && (
        <CoachMark onDismiss={persistCoachDismiss} />
      )}

      {toast && <HomeToast kind={toast.kind} text={toast.text} />}
    </div>
  );
}


// ============================================================
// Your Pulse Reset - persistent kept-playlist tile
// ============================================================
//
// Rendered on Home once the user hits Keep on the SavedSandboxCard.
// Matches the Made For You section's visual language so it feels
// native to the Spotify home screen, but adds a blinking green dot
// on the artwork so a reviewer can spot the new library entry at a
// glance. Tap -> /library.

const KEPT_SCOPE_GRADIENT = {
  language: 'linear-gradient(135deg, #f97316 0%, #facc15 55%, #9f1239 100%)',
  genre:    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 55%, #1e40af 100%)',
  era:      'linear-gradient(135deg, #0891b2 0%, #06b6d4 55%, #0d9488 100%)',
  mood:     'linear-gradient(135deg, #059669 0%, #3b82f6 55%, #7c3aed 100%)',
  default:  'linear-gradient(135deg, #1DB954 0%, #0f5c2e 100%)',
};


function YourPulseResetSection({ keptPlaylist, onOpen }) {
  const scope = keptPlaylist.scopeDimensions?.[0] || 'default';
  const gradient = KEPT_SCOPE_GRADIENT[scope] || KEPT_SCOPE_GRADIENT.default;
  return (
    <div style={{ padding: '18px 18px 0' }}>
      <p style={{
        color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px 0',
      }}>Your Pulse Reset</p>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open Your Pulse Reset in Library"
        style={{
          display: 'block',
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 110, height: 110, borderRadius: 6,
          background: gradient,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
          position: 'relative',
        }}>
          <span style={{
            color: '#fff', fontSize: 15, fontWeight: 800,
            letterSpacing: '-0.02em',
          }}>Pulse</span>
          <span style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: 8, fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>reset {'\u00B7'} kept</span>
          {/* Blinking green dot in the top-right corner of the
              artwork - subtle "new item in library" affordance. */}
          <span
            className="pulse-tile-dot"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 8, right: 8,
              width: 10, height: 10,
              borderRadius: '50%',
              background: 'var(--pulse-green)',
              boxShadow: '0 0 6px rgba(29,185,84,0.9)',
            }}
          />
        </div>
        <p style={{
          color: '#fff', fontSize: 12, fontWeight: 600,
          margin: '6px 0 0 0', width: 110,
        }}>Your Pulse Reset</p>
        <p style={{
          color: 'var(--pulse-muted)', fontSize: 10,
          margin: '2px 0 0 0', lineHeight: 1.3, width: 110,
        }}>
          {keptPlaylist.trackCount || 0} tracks {'\u00B7'} kept in library
        </p>
      </button>
    </div>
  );
}


// A minimal toast pinned to the bottom of the phone content area.
// Kept local to the home page - other pages ship their own.
function HomeToast({ kind, text }) {
  const bg = kind === 'error' ? '#7f1d1d' : '#111';
  const border = kind === 'error' ? '#dc2626' : '#2a2a2a';
  return (
    <div style={{
      position: 'absolute',
      bottom: 12,
      left: 12, right: 12,
      background: bg,
      border: `1px solid ${border}`,
      color: '#fff',
      padding: '10px 14px',
      borderRadius: 10,
      fontSize: '0.8rem',
      fontWeight: 600,
      zIndex: 30,
      boxShadow: '0 10px 22px rgba(0,0,0,0.55)',
    }}>{text}</div>
  );
}


// ============================================================
// Top row: avatar with notification badge + All/Music/Podcasts pills
// ============================================================

function TopRow({ avatarInitial, avatarGradient, notificationCount }) {
  return (
    <div style={{
      padding: '12px 18px 8px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: avatarGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700,
        }}>{avatarInitial}</div>
        {notificationCount > 0 && (
          <div style={{
            position: 'absolute',
            top: -4, right: -4,
            background: 'var(--pulse-green)',
            borderRadius: '50%',
            width: 17, height: 17,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#000', fontSize: 9, fontWeight: 800,
            border: '2px solid #000',
          }}>{notificationCount}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Pill label="All" active />
        <Pill label="Music" />
        <Pill label="Podcasts" />
      </div>
    </div>
  );
}

function Pill({ label, active = false }) {
  return (
    <span style={{
      padding: '6px 14px',
      borderRadius: 20,
      fontSize: 13,
      fontWeight: active ? 700 : 600,
      background: active ? 'var(--pulse-green)' : '#2A2A2A',
      color: active ? '#000' : '#fff',
    }}>{label}</span>
  );
}


// ============================================================
// Popular albums (horizontal scroll)
// ============================================================

function PopularAlbums({ albums }) {
  if (!albums || albums.length === 0) return null;
  return (
    <div style={{ padding: '6px 18px 0' }}>
      <p style={{
        color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px 0',
      }}>Popular albums</p>
      <div style={{
        display: 'flex', gap: 12,
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}>
        {albums.map((a, i) => (
          <div key={i} style={{ flexShrink: 0, width: 105 }}>
            <div style={{
              width: 105, height: 105, borderRadius: 6,
              background: a.grad,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
            }}>
              <span style={{
                color: 'rgba(255,255,255,0.14)',
                fontSize: 30, fontWeight: 900,
                fontFamily: 'Georgia, serif',
              }}>{a.sym}</span>
            </div>
            <p style={{
              color: '#fff', fontSize: 12, fontWeight: 700,
              margin: '6px 0 2px 0', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{a.title}</p>
            <p style={{
              color: 'var(--pulse-muted)', fontSize: 11, margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{a.artist}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// Pulse nudge card (compact, matches mockup)
// ============================================================

function PulseNudgeCard({ nudge, personaId, stuckValue, onOpenReset, onDismiss }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const pct = Math.round((nudge.overall_stuck_score || 0) * 100);
  const scope = nudge.suggested_scope;
  const stuckLabel = (stuckValue && stuckValue[scope]) || scope;

  const handleAccept = async () => {
    setBusy('accept');
    try {
      // Do NOT flip nudge.status here - the card would vanish on refresh.
      // The nudge stays `pending` through the sandbox; the P4 outcome
      // page will mark it accepted / dismissed on Keep or Revert.
      const session = await api.createResetSession({
        userId: personaId,
        scopeDimensions: [scope],
        freeTextIntent: null,
      });
      onOpenReset && onOpenReset();
      navigate(`/sandbox/${encodeURIComponent(session.id)}`);
    } catch (e) {
      setBusy(null);
      console.error('Reset creation failed', e);
      alert(`Could not start reset: ${e?.message || 'network error'}`);
    }
  };

  return (
    <div style={{
      margin: '14px 18px 0',
      background: '#181818',
      borderRadius: 12,
      padding: 16,
      borderLeft: '3px solid #444',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--pulse-green)',
        }} />
        <span style={{
          color: 'var(--pulse-green)',
          fontSize: 10, fontWeight: 800,
          letterSpacing: '1.2px',
        }}>PULSE</span>
      </div>
      <p style={{
        color: '#fff', fontSize: 15, fontWeight: 700,
        margin: '0 0 5px 0', lineHeight: 1.3,
      }}>
        {pct}% of your plays have been {stuckLabel} for 3 weeks.
      </p>
      <p style={{
        color: 'var(--pulse-muted)', fontSize: 13,
        margin: '0 0 12px 0', lineHeight: 1.4,
      }}>
        Want a small reset outside your library?
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy !== null}
          style={{
            background: 'var(--pulse-green)',
            color: '#000',
            border: 'none',
            padding: '9px 18px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {busy === 'accept' ? 'Opening\u2026' : 'Try a reset'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            color: 'var(--pulse-muted)',
            fontSize: 13,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}


// ============================================================
// Dismiss pill (after Not now)
// ============================================================

function DismissPill() {
  return (
    <div style={{
      margin: '8px 18px 0',
      background: '#1a1a1a',
      borderRadius: 20,
      padding: '7px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{
        color: '#777', fontSize: 11,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#555', display: 'inline-block',
        }} />
        Reset available {'\u00b7'} check back next Monday
      </span>
      <span style={{ color: '#555', fontSize: 11 }}>{'\u00d7'}</span>
    </div>
  );
}


// ============================================================
// CheckYourLibraryNudge - replaces the "Try a reset" PulseNudgeCard
// once a sandbox has been saved. Same slot, calmer copy, and a
// single CTA that deep-links to the Library tab where Keep /
// Discard also lives. Sits until the session-local savedSandbox
// state is wiped (page refresh).
// ============================================================

function CheckYourLibraryNudge({ onOpen }) {
  return (
    <div style={{
      margin: '14px 18px 0',
      background: '#181818',
      borderRadius: 12,
      padding: 14,
      borderLeft: '3px solid #1ed760',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#1ed760', display: 'inline-block',
          boxShadow: '0 0 6px rgba(30,215,96,0.7)',
        }} />
        <span style={{
          color: '#1ed760', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.14em',
        }}>PULSE {'\u00b7'} SAVED</span>
      </div>

      <div>
        <p style={{
          color: '#fff', fontSize: 15, fontWeight: 700,
          margin: '0 0 3px 0', lineHeight: 1.3,
        }}>
          Check your library
        </p>
        <p style={{
          color: '#b3b3b3', fontSize: 12, margin: 0, lineHeight: 1.4,
        }}>
          Your Pulse sandbox is saved. Open Library any time in the
          next 10 days to keep it or discard it.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            background: '#1ed760',
            color: '#000',
            border: 'none',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: 'pointer',
          }}
        >
          Open library
        </button>
      </div>
    </div>
  );
}


// ============================================================
// KeptInLibraryNudge - the third state of the Home nudge slot,
// shown after the user has hit Keep on the SavedSandboxCard. Uses
// the same card frame as CheckYourLibraryNudge but with a
// checkmark motif and "In your library" copy so it reads as an
// outcome, not a prompt. Also gates out the "Try a reset" nudge
// for the rest of this session - refreshing wipes keptPlaylist
// and the try-a-reset flow becomes available again.
// ============================================================

function KeptInLibraryNudge({ onOpen }) {
  return (
    <div style={{
      margin: '14px 18px 0',
      background: '#181818',
      borderRadius: 12,
      padding: 14,
      borderLeft: '3px solid #1ed760',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {/* Small green checkmark badge in place of the "saved" dot -
            signals "this is a settled outcome" rather than "action
            still pending". */}
        <span style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#1ed760',
          display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 6px rgba(30,215,96,0.5)',
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
               stroke="#000" strokeWidth="4" strokeLinecap="round"
               strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span style={{
          color: '#1ed760', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.14em',
        }}>PULSE {'\u00b7'} KEPT</span>
      </div>

      <div>
        <p style={{
          color: '#fff', fontSize: 15, fontWeight: 700,
          margin: '0 0 3px 0', lineHeight: 1.3,
        }}>
          Playlist added to your library
        </p>
        <p style={{
          color: '#b3b3b3', fontSize: 12, margin: 0, lineHeight: 1.4,
        }}>
          Nice one. Your Pulse reset now lives in your Library {'\u2014'}
          Pulse will surface a fresh nudge on your next Monday check-in.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            background: '#1ed760',
            color: '#000',
            border: 'none',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: 'pointer',
          }}
        >
          Open in library
        </button>
      </div>
    </div>
  );
}


// ============================================================
// Made For You (Discover Weekly single-tile)
// ============================================================

function MadeForYou({ discover }) {
  return (
    <div style={{ padding: '18px 18px 0' }}>
      <p style={{
        color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px 0',
      }}>Made For You</p>
      <div>
        <div style={{
          width: 110, height: 110, borderRadius: 6,
          background: discover.grad,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 2,
          boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
        }}>
          <span style={{
            color: '#fff', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.5px',
          }}>DISCOVER</span>
          <span style={{
            color: '#fff', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.5px',
          }}>WEEKLY</span>
        </div>
        <p style={{
          color: 'var(--pulse-muted)', fontSize: 10,
          margin: '6px 0 0 0', lineHeight: 1.3, width: 110,
        }}>{discover.sub}</p>
      </div>
    </div>
  );
}


// ============================================================
// Popular radio (2 tiles)
// ============================================================

function PopularRadio({ tiles }) {
  if (!tiles || tiles.length === 0) return null;
  return (
    <div style={{ padding: '18px 18px 0' }}>
      <p style={{
        color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 12px 0',
      }}>Popular radio</p>
      <div style={{ display: 'flex', gap: 12 }}>
        {tiles.map((t, i) => (
          <div key={i} style={{
            width: 110, height: 74, borderRadius: 6,
            background: t.grad,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            padding: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}>
            <span style={{
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontSize: 8, fontWeight: 700,
              padding: '2px 5px',
              borderRadius: 3,
            }}>RADIO</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// Coach mark (arrow points to bottom-nav Home)
// ============================================================

function CoachMark({ onDismiss }) {
  return (
    <div style={{
      margin: '18px 12px 0',
      background: '#181818',
      borderRadius: 10,
      padding: '11px 14px',
      border: '1px solid #333',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        top: -7, left: 44,
        width: 12, height: 12,
        background: '#181818',
        borderTop: '1px solid #333',
        borderLeft: '1px solid #333',
        transform: 'rotate(45deg)',
      }} />
      <p style={{
        color: '#fff', fontSize: 10,
        lineHeight: 1.5, margin: '0 0 4px 0',
      }}>
        <span style={{ color: 'var(--pulse-green)', fontWeight: 700 }}>Pulse</span>{' '}
        notices when you get stuck on one thing for 3 weeks. It never
        touches your existing library.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--pulse-muted)',
          fontSize: 10, fontWeight: 600,
          padding: 0, cursor: 'pointer',
        }}
      >
        Got it
      </button>
    </div>
  );
}


