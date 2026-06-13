import { useState } from 'react';
import { useData } from '../lib/useData';
import { api } from '../lib/api';
import { useEditGate } from '../lib/editGate';
import { isPinError } from '../lib/pin';
import { computeStandings } from '../domain/standings';

export default function PlayersPage() {
  const { data, tableId, refresh, online } = useData();
  const { requireUnlock, lock } = useEditGate();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  if (!data || !tableId) {
    return <p className="muted">Select a table first.</p>;
  }

  const standings = computeStandings(data.players, data.results, tableId);

  async function addGuest() {
    const name = newName.trim();
    if (!name) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.addPlayer(tableId!, name);
      await refresh();
      setNewName('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add player.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(playerId: string) {
    const name = editName.trim();
    if (!name) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.renamePlayer(tableId!, playerId, name);
      await refresh();
      setEditingId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to rename.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Players</h1>

      <div className="inline-form">
        <input
          value={newName}
          placeholder="New guest name"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button onClick={addGuest} disabled={busy || !online}>
          Add guest
        </button>
      </div>
      {err && <p className="error">{err}</p>}

      {standings.length === 0 ? (
        <p className="muted">No players yet.</p>
      ) : (
        <ul className="player-list">
          {standings.map((p) => (
            <li key={p.playerId} className="player-item">
              {editingId === p.playerId ? (
                <div className="inline-form grow">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                  <button
                    onClick={() => saveRename(p.playerId)}
                    disabled={busy || !online}
                  >
                    Save
                  </button>
                  <button className="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <span className="player-name">{p.name}</span>
                  <span className={`badge ${p.status}`}>{p.status}</span>
                  <span className="muted">{p.gamesPlayed} games</span>
                  <button
                    className="ghost small"
                    onClick={() => {
                      setEditingId(p.playerId);
                      setEditName(p.name);
                    }}
                    disabled={!online}
                  >
                    Rename
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
