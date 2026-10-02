import { Link } from 'react-router-dom';
import { useData } from '../lib/useData';
import { buildSessionDetails } from '../domain/standings';
import { formatDate, formatNet, netClass } from '../lib/format';
import { isWalletTable } from '../domain/wallet';

export default function HistoryPage() {
  const { data, tableId, loading } = useData();

  if (loading && !data) return <p className="muted">Loading history…</p>;
  if (!data || !tableId) {
    return <p className="muted">Select a table to see its history.</p>;
  }

  const sessions = buildSessionDetails(
    data.players,
    data.sessions,
    data.results,
    tableId,
  );
  const table = data.tables.find((candidate) => candidate.tableId === tableId);

  return (
    <section>
      <div className="section-head">
        <h1>History</h1>
        <Link
          className="button small"
          to={isWalletTable(table) ? '/live' : '/add'}
        >
          {isWalletTable(table) ? 'Start live' : '+ Add night'}
        </Link>
      </div>

      {sessions.length === 0 ? (
        <p className="muted">No sessions recorded yet.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => {
            const top = s.entries[0];
            const live = s.status === 'open';
            return (
              <li key={s.sessionId}>
                <Link
                  to={live ? `/live/${s.sessionId}` : `/history/${s.sessionId}`}
                  className="session-row"
                >
                  <div className="session-main">
                    <span className="session-date">{formatDate(s.date)}</span>
                    {s.location && (
                      <span className="session-loc">{s.location}</span>
                    )}
                  </div>
                  <div className="session-meta">
                    {live ? (
                      <span className="live-badge">
                        <span className="live-dot" /> LIVE
                      </span>
                    ) : (
                      <>
                        <span className="muted">{s.playerCount} players</span>
                        {top && (
                          <span className={`net ${netClass(top.net)}`}>
                            {top.name} {formatNet(top.net)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
