import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/useData';
import { buildSessionDetails } from '../domain/standings';
import { api } from '../lib/api';
import { useEditGate } from '../lib/editGate';
import { isPinError } from '../lib/pin';
import {
  formatDate,
  formatNet,
  netClass,
  sessionToWhatsApp,
} from '../lib/format';

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const { data, tableId, refresh, online } = useData();
  const { requireUnlock, lock } = useEditGate();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const ranked = [...session.entries].sort((a, b) => b.net - a.net);
  const pot = ranked.filter((e) => e.net > 0).reduce((a, e) => a + e.net, 0);

  async function remove() {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteSession(tableId!, session!.sessionId);
      await refresh();
      navigate('/history');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete.';
      if (isPinError(msg)) lock();
      setErr(msg);
      setBusy(false);
    }
  }

  async function copyResults() {
    const text = sessionToWhatsApp(
      session!.date,
      session!.entries,
      session!.location || undefined,
    );
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="session-detail">
      <div className="section-head">
        <div>
          <h1>{formatDate(session.date)}</h1>
          {session.location && <p className="sub">{session.location}</p>}
        </div>
        <Link className="ghost small" to="/history">
          ← Back
        </Link>
      </div>

      {session.notes && <p className="notes">{session.notes}</p>}

      <div className="session-summary">
        <div className="summary-item">
          <span className="summary-label">Players</span>
          <span className="summary-value">{ranked.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Pot</span>
          <span className="summary-value">{formatNet(pot)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Top</span>
          <span className="summary-value">{ranked[0]?.name ?? '—'}</span>
        </div>
      </div>

      <ul className="result-list">
        {ranked.map((e, i) => (
          <li
            key={e.playerId}
            className={`result-item ${i === 0 && e.net > 0 ? 'winner' : ''}`}
          >
            <span className="result-rank">{i + 1}</span>
            <span className="result-player">
              {e.name}
              {i === 0 && e.net > 0 && <span className="crown"> 🏆</span>}
            </span>
            <span className={`result-net net ${netClass(e.net)}`}>
              {formatNet(e.net)}
            </span>
          </li>
        ))}
      </ul>

      <button className="button copy-btn" type="button" onClick={copyResults}>
        {copied ? '✓ Copied!' : '📋 Copy for WhatsApp'}
      </button>

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
