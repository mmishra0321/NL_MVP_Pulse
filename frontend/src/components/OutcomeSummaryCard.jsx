/**
 * OutcomeSummaryCard - the "what you actually did with the sandbox" card.
 *
 * Three stat rows, each a small green-tinted icon puck + a title +
 * a supporting sub-line:
 *   1. Tracks played  (N of M tracks played / You gave most a real listen)
 *   2. Repeat plays   (K tracks became repeat plays / joined by comma)
 *   3. Artist search  (Artist in your search history / caught your ear)
 *
 * Data source: ResetOutcomeDetailOut from
 * GET /reset/sessions/{id}/outcome (mock-mode: mock_outcomes.json;
 * real-mode P6: sandbox_play_events + top-artists deltas).
 *
 * Design intent: the whole point of screen 4 is EVIDENCE. Every number
 * here has to survive the reviewer's "how do you know?" question.
 * Mock mode is authored so it does; real mode wires the same shape.
 */


export default function OutcomeSummaryCard({ outcome }) {
  const played = outcome.tracks_played_count?.played ?? 0;
  const total = outcome.tracks_played_count?.total ?? 0;
  const repeats = Array.isArray(outcome.repeat_plays) ? outcome.repeat_plays : [];
  const searchHits = Array.isArray(outcome.artist_search_hits) ? outcome.artist_search_hits : [];

  // Repeat-plays sub-line: comma-joined titles, truncated to 3 for
  // narrow-screen safety. If there are more, tack on "+N more".
  const repeatTitles = repeats.slice(0, 3).map((r) => r.title).join(', ');
  const repeatOverflow = repeats.length > 3 ? ` +${repeats.length - 3} more` : '';
  const repeatSub = repeats.length === 0
    ? 'No track crossed into repeat listening'
    : `${repeatTitles}${repeatOverflow}`;

  // Search-hits sub-line: one line, first hit's artist. If zero hits,
  // hide the whole row rather than showing a hollow stat.
  const searchTitle = searchHits.length > 0
    ? `${searchHits[0].artist} in your search history`
    : null;
  const searchSub = 'Looks like someone caught your ear';

  const rows = [
    {
      title: `${played} of ${total} tracks played`,
      sub: 'You gave most a real listen',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="var(--pulse-green)" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
    {
      title: `${repeats.length} track${repeats.length === 1 ? '' : 's'} became repeat plays`,
      sub: repeatSub,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="var(--pulse-green)" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      ),
    },
  ];

  if (searchTitle) {
    rows.push({
      title: searchTitle,
      sub: searchSub,
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="var(--pulse-green)" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    });
  }

  return (
    <div style={{
      margin: '0 20px',
      background: 'var(--pulse-surface, #181818)',
      borderRadius: 12,
      padding: 16,
      flexShrink: 0,
    }}>
      {rows.map((row, i) => (
        <StatRow
          key={i}
          title={row.title}
          sub={row.sub}
          icon={row.icon}
          isFirst={i === 0}
        />
      ))}
    </div>
  );
}


function StatRow({ title, sub, icon, isFirst }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      // Divider between rows only (matches mockup's `.stat-row + .stat-row`).
      paddingTop: isFirst ? 0 : 12,
      marginTop: isFirst ? 0 : 12,
      borderTop: isFirst ? 'none' : '0.5px solid #2A2A2A',
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: '#1a3a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{
          color: '#fff', fontSize: 13, fontWeight: 600,
          margin: '0 0 2px 0',
        }}>{title}</p>
        <p style={{
          color: 'var(--pulse-muted)', fontSize: 11, margin: 0,
          lineHeight: 1.4,
        }}>{sub}</p>
      </div>
    </div>
  );
}
