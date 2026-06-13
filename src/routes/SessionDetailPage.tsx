import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/useData';
import { buildSessionDetails } from '../domain/standings';
import { api } from '../lib/api';
import { formatDate, formatNet, netClass } from '../lib/format';

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const { data, tableId, refresh, online } = useData();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data || !tableId) return <p className="muted">Loading…</p>;

  const sessions = buildSessionDetails(
    data.players,
    data.sessions,
    data.results,
    tableId,
  );
  const session = sessions.find((s) => s.sessionId === sessionId);

  if (!session) {
    return (
      <section>
        <p className="muted">Session not found.</p>
        <Link to="/history">Back to history</Link>
      </section>
    );
  }

  async function remove() {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteSession(tableId!, session!.sessionId);
      await refresh();
      navigate('/history');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete.');
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h1>{formatDate(session.date)}</h1>
        <Link className="ghost small" to="/history">
          ← Back
        </Link>
      </div>

      {session.location && <p className="sub">{session.location}</p>}
      {session.notes && <p className="notes">{session.notes}</p>}

      <table className="standings">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">Net</th>
          </tr>
        </thead>
        <tbody>
          {session.entries.map((e) => (
            <tr key={e.playerId}>
              <td>{e.name}</td>
              <td className={`num net ${netClass(e.net)}`}>
                {formatNet(e.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row-actions">
        <Link className="button small" to={`/add?edit=${session.sessionId}`}>
          Edit
        </Link>
        <button
          className="danger small"
          onClick={remove}
          disabled={busy || !online}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
