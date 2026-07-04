/**
 * DiversityScoreCard - the "measured before/after" card on screen 4.
 *
 * Shows the collapsed dimension's diversity score before the sandbox
 * started vs after (mock mode: fixture-authored; real mode P6: computed
 * from WeeklySnapshot deltas). This is the number that makes the
 * Keep/Revert decision evidenced rather than vibes-based.
 *
 * Data source: ResetOutcomeDetailOut. The card auto-picks the right
 * pair of before/after fields based on `collapsed_dimension`:
 *   - "language" -> before_language_pct / after_language_pct
 *   - "genre"    -> before_genre_pct / after_genre_pct
 *   - future "era" / "mood" scopes will need their own field pairs on
 *     the outcome payload (the Pydantic model already reserves the
 *     dimension-specific fields as Optional).
 *
 * Matches doc/mockups/screen4-keep-or-revert.html lines 62-67.
 */


const DIMENSION_LABEL = {
  language: 'Language',
  genre: 'Genre',
  era: 'Era',
  mood: 'Mood',
};


export default function DiversityScoreCard({ outcome }) {
  const dim = outcome.collapsed_dimension || 'language';
  const label = DIMENSION_LABEL[dim] || dim;

  // Pick the right field pair for this dimension. Language + genre
  // are wired; era + mood fall through to `null` if the fixture
  // has not authored them.
  const before =
    dim === 'language' ? outcome.before_language_pct :
    dim === 'genre'    ? outcome.before_genre_pct :
    null;
  const after =
    dim === 'language' ? outcome.after_language_pct :
    dim === 'genre'    ? outcome.after_genre_pct :
    null;

  // If we cannot resolve numbers for this dimension, render a graceful
  // fallback instead of a broken chart.
  if (before == null || after == null) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>{label} diversity score</span>
          <span style={tagStyle}>Higher is better</span>
        </div>
        <p style={{
          color: 'var(--pulse-muted)', fontSize: 12, margin: 0,
          lineHeight: 1.4,
        }}>
          Diversity numbers for this dimension are not authored yet.
        </p>
      </div>
    );
  }

  const beforePct = Math.round(before * 100);
  const afterPct = Math.round(after * 100);
  const delta = outcome.diversity_delta_pts ?? (afterPct - beforePct);

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>{label} diversity score</span>
        <span style={tagStyle}>Higher is better</span>
      </div>

      <ScoreRow
        label="Before"
        pct={beforePct}
        color="#BA7517"
      />
      <ScoreRow
        label="After"
        pct={afterPct}
        color="var(--pulse-green)"
      />

      <div style={{
        background: '#1a3a1a',
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="var(--pulse-green)" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
        <span style={{
          color: 'var(--pulse-green)', fontSize: 12, fontWeight: 600,
        }}>
          Diversity up {delta} points after this reset
        </span>
      </div>
    </div>
  );
}


function ScoreRow({ label, pct, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: 10, marginBottom: 8,
    }}>
      <span style={{
        color: 'var(--pulse-muted)', fontSize: 11,
        width: 38, flexShrink: 0,
      }}>{label}</span>
      <div style={{
        flex: 1, height: 7,
        background: '#2A2A2A',
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          height: 7,
          width: `${pct}%`,
          background: color,
          borderRadius: 4,
          transition: 'width 320ms ease-out',
        }} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 700,
        width: 34, textAlign: 'right',
        color,
      }}>{pct}%</span>
    </div>
  );
}


// ============================================================
// Shared inline styles
// ============================================================

const cardStyle = {
  margin: '12px 20px 0',
  background: 'var(--pulse-surface, #181818)',
  borderRadius: 12,
  padding: 14,
  flexShrink: 0,
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
};

const titleStyle = {
  color: '#fff', fontSize: 13, fontWeight: 700,
};

const tagStyle = {
  background: '#2A2A2A',
  color: 'var(--pulse-muted)',
  fontSize: 10,
  padding: '3px 8px',
  borderRadius: 10,
};
