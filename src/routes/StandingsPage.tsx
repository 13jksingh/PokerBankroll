import { useData } from '../lib/useData';
import { computeStandings } from '../domain/standings';
import { formatNet, netClass } from '../lib/format';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function StandingsPage() {
  const { data, tableId, loading, error, refresh, fromCache } = useData();

  if (loading && !data) return <p className="muted">Loading standings…</p>;
  if (!data || !tableId) {
    return <p className="muted">Select or create a table to see standings.</p>;
  }

  const allStandings = computeStandings(data.players, data.results, tableId);
  const members = allStandings.filter((s) => s.status === 'member');
  // If nobody has reached member status yet, fall back to everyone so new
  // groups don't see an empty board (guests still appear under Stats).
  const membersOnly = members.length > 0;
  const standings = membersOnly ? members : allStandings;
  const leader = standings[0];
  const rest = standings.slice(1);

  return (
    <section>
      <div className="section-head">
        <h1>Standings</h1>
        <button className="ghost small" onClick={() => void refresh()}>
          ↻ Refresh
        </button>
      </div>

      {fromCache && (
        <p className="banner warn small">Showing saved data — may be stale.</p>
      )}
      {error && !data && <p className="error">{error}</p>}

      {standings.length === 0 ? (
        <div className="empty">
          <p className="empty-emoji">♠</p>
          <p>No players yet.</p>
          <p className="muted">Add your first night to get started.</p>
        </div>
      ) : (
        <>
          {!membersOnly && (
            <p className="hint">
              No members yet (5+ games). Showing everyone for now.
            </p>
          )}

          {leader && (
            <div className="leader-card">
              <span className="leader-label">Current leader</span>
              <span className="leader-name">🥇 {leader.name}</span>
              <span className={`leader-net net ${netClass(leader.cumulativeNet)}`}>
                {formatNet(leader.cumulativeNet)}
              </span>
              <span className="leader-sub">{leader.gamesPlayed} games</span>
            </div>
          )}

          {rest.length > 0 && (
            <>
              <h2 className="standings-subhead">Standings</h2>
              <ul className="standings-list">
                {rest.map((s, i) => {
                  const rank = i + 2;
                  return (
                    <li
                      key={s.playerId}
                      className={`standing-row ${rank <= 3 ? 'podium' : ''}`}
                    >
                      <span className="rank">{MEDALS[rank - 1] ?? rank}</span>
                      <span className="standing-main">
                        <span className="player-name">{s.name}</span>
                        <span className="standing-sub">
                          <span className={`badge ${s.status}`}>{s.status}</span>
                          <span className="muted">{s.gamesPlayed} games</span>
                        </span>
                      </span>
                      <span
                        className={`standing-net net ${netClass(s.cumulativeNet)}`}
                      >
                        {formatNet(s.cumulativeNet)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
