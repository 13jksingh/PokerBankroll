import { useData } from '../lib/useData';
import { buildSessionMatrix, computePlayerStats } from '../domain/stats';
import { formatDate, formatNet, netClass } from '../lib/format';

export default function StatsPage() {
  const { data, tableId, loading } = useData();

  if (loading && !data) return <p className="muted">Loading stats…</p>;
  if (!data || !tableId) {
    return <p className="muted">Select a table to see stats.</p>;
  }

  const matrix = buildSessionMatrix(
    data.players,
    data.sessions,
    data.results,
    tableId,
  );
  const stats = computePlayerStats(data.players, data.results, tableId);
  const hasData = matrix.columns.length > 0 && matrix.rows.length > 0;

  return (
    <section>
      <div className="section-head">
        <h1>Stats</h1>
      </div>

      {!hasData ? (
        <div className="empty">
          <p className="empty-emoji">📊</p>
          <p>No stats yet.</p>
          <p className="muted">Add a night to start building stats.</p>
        </div>
      ) : (
        <>
          <h2 className="stats-subhead">Session grid</h2>
          <p className="hint">Each player’s net for every night. Scroll sideways →</p>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="matrix-corner">Player</th>
                  {matrix.columns.map((c) => (
                    <th key={c.sessionId} className="matrix-date">
                      {formatDate(c.date)}
                    </th>
                  ))}
                  <th className="matrix-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.playerId}>
                    <th className="matrix-player" scope="row">
                      <span className="matrix-name">{row.name}</span>
                      <span className={`badge ${row.status}`}>{row.status}</span>
                    </th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={matrix.columns[i].sessionId}
                        className={cell === null ? 'matrix-cell no-play' : 'matrix-cell'}
                      >
                        {cell === null ? (
                          <span className="matrix-dash">·</span>
                        ) : (
                          <span className={`net ${netClass(cell)}`}>
                            {formatNet(cell)}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="matrix-cell matrix-total">
                      <span className={`net ${netClass(row.total)}`}>
                        {formatNet(row.total)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="stats-subhead">Player breakdown</h2>
          <p className="hint">Everyone who has played — members and guests.</p>
          <ul className="stats-list">
            {stats.map((s) => (
              <li key={s.playerId} className="stats-card">
                <div className="stats-card-head">
                  <div className="stats-id">
                    <span className="stats-name">{s.name}</span>
                    <span className={`badge ${s.status}`}>{s.status}</span>
                  </div>
                  <span className={`stats-total net ${netClass(s.totalNet)}`}>
                    {formatNet(s.totalNet)}
                  </span>
                </div>
                <p className="stats-meta">
                  {s.gamesPlayed} {s.gamesPlayed === 1 ? 'game' : 'games'} ·{' '}
                  {s.profitableNights}/{s.gamesPlayed} profitable
                </p>
                <div className="stats-grid">
                  <div className="stat">
                    <span className="stat-label">Avg</span>
                    <span className={`stat-value net ${netClass(s.avgNet)}`}>
                      {formatNet(s.avgNet)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Best</span>
                    <span className={`stat-value net ${netClass(s.biggestWin)}`}>
                      {formatNet(s.biggestWin)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Worst</span>
                    <span className={`stat-value net ${netClass(s.biggestLoss)}`}>
                      {formatNet(s.biggestLoss)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
