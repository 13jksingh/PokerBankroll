import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../lib/useData';
import { api } from '../lib/api';
import { useEditGate } from '../lib/editGate';
import { isPinError } from '../lib/pin';
import { validateSession } from '../domain/validation';
import { buildSessionDetails } from '../domain/standings';
import { todayIso, formatNet, netClass } from '../lib/format';
import type { NewResultInput } from '../domain/types';

export default function AddSessionPage() {
  const { data, tableId, refresh, online } = useData();
  const { requireUnlock, lock } = useEditGate();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');

  const players = useMemo(
    () => (data ? data.players.filter((p) => p.tableId === tableId) : []),
    [data, tableId],
  );

  const editing = useMemo(() => {
    if (!editId || !data || !tableId) return null;
    return (
      buildSessionDetails(
        data.players,
        data.sessions,
        data.results,
        tableId,
      ).find((s) => s.sessionId === editId) ?? null
    );
  }, [editId, data, tableId]);

  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [location, setLocation] = useState(editing?.location ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [showExtra, setShowExtra] = useState(
    Boolean(editing?.location || editing?.notes),
  );
  // playerId -> net string ('' means selected but no amount yet)
  const [nets, setNets] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    editing?.entries.forEach((e) => {
      init[e.playerId] = String(e.net);
    });
    return init;
  });
  const [newGuest, setNewGuest] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data || !tableId) {
    return <p className="muted">Select a table first.</p>;
  }

  const selectedIds = Object.keys(nets);
  const parsedResults: NewResultInput[] = selectedIds.map((playerId) => ({
    playerId,
    net: Number(nets[playerId]),
  }));
  const validation = validateSession(parsedResults);
  const sum = selectedIds.reduce((a, id) => {
    const n = Number(nets[id]);
    return a + (Number.isNaN(n) ? 0 : n);
  }, 0);
  const emptyIds = selectedIds.filter((id) => nets[id].trim() === '');

  function toggle(playerId: string) {
    setNets((prev) => {
      const next = { ...prev };
      if (playerId in next) {
        delete next[playerId];
      } else {
        next[playerId] = '';
      }
      return next;
    });
  }

  function setNet(playerId: string, value: string) {
    setNets((prev) => ({ ...prev, [playerId]: value }));
  }

  /** Fill the single remaining empty player so the night balances to zero. */
  function autoBalance(playerId: string) {
    const others = selectedIds
      .filter((id) => id !== playerId)
      .reduce((a, id) => a + (Number(nets[id]) || 0), 0);
    const needed = -others;
    setNet(
      playerId,
      Number.isInteger(needed) ? String(needed) : needed.toFixed(2),
    );
  }

  async function addGuest() {
    const name = newGuest.trim();
    if (!name) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      const { playerId } = await api.addPlayer(tableId!, name);
      await refresh();
      setNewGuest('');
      setNets((prev) => ({ ...prev, [playerId]: '' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add guest.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!validation.ok) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      if (editing) {
        await api.editSession(tableId!, editing.sessionId, {
          date,
          location,
          notes,
          results: parsedResults,
        });
      } else {
        await api.addSession({
          tableId: tableId!,
          date,
          location,
          notes,
          results: parsedResults,
        });
      }
      await refresh();
      navigate('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save session.';
      if (isPinError(msg)) lock();
      setErr(msg);
      setBusy(false);
    }
  }

  const nameOf = (id: string) =>
    players.find((p) => p.playerId === id)?.name ?? id;

  return (
    <section className="add-page">
      <h1>{editing ? 'Edit night' : 'New night'}</h1>

      <div className="date-row">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
        <button
          className="ghost small"
          onClick={() => setShowExtra((v) => !v)}
          type="button"
        >
          {showExtra ? 'Hide details' : '+ Location / notes'}
        </button>
      </div>

      {showExtra && (
        <div className="form-grid">
          <label className="full">
            <span>Location</span>
            <input
              value={location}
              placeholder="e.g. Sam's place"
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label className="full">
            <span>Notes</span>
            <input
              value={notes}
              placeholder="Anything memorable"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
      )}

      <h2>Who played?</h2>
      <p className="hint">Tap players to add them, then enter each result.</p>
      <div className="chips">
        {players.map((p) => (
          <button
            key={p.playerId}
            type="button"
            className={`chip ${p.playerId in nets ? 'on' : ''}`}
            onClick={() => toggle(p.playerId)}
          >
            {p.name}
          </button>
        ))}
        {players.length === 0 && (
          <span className="muted">No players yet — add a guest below.</span>
        )}
      </div>

      <div className="inline-form add-guest">
        <input
          value={newGuest}
          placeholder="New guest name"
          onChange={(e) => setNewGuest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addGuest();
          }}
        />
        <button
          className="ghost"
          onClick={addGuest}
          disabled={busy || !online}
          type="button"
        >
          Add
        </button>
      </div>

      {selectedIds.length > 0 && (
        <>
          <h2>Results</h2>
          <div className="result-rows">
            {selectedIds.map((id) => (
              <div className="result-row" key={id}>
                <span className="result-name">{nameOf(id)}</span>
                <input
                  className="net-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={nets[id]}
                  onChange={(e) => setNet(id, e.target.value)}
                />
                {emptyIds.length === 1 && emptyIds[0] === id ? (
                  <button
                    className="balance-btn small"
                    type="button"
                    onClick={() => autoBalance(id)}
                    title="Fill so the night balances"
                  >
                    =
                  </button>
                ) : (
                  <button
                    className="ghost small remove"
                    type="button"
                    onClick={() => toggle(id)}
                    aria-label={`Remove ${nameOf(id)}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {selectedIds.length > 0 && (
        <div className={`balance ${validation.ok ? 'ok' : 'bad'}`}>
          <span className="balance-label">Balance</span>
          <span className={`net ${netClass(sum)}`}>{formatNet(sum)}</span>
          <span className="balance-hint">
            {validation.ok
              ? 'Balanced ✓'
              : selectedIds.length < 2
                ? 'Add another player'
                : emptyIds.length === 1
                  ? 'Tap = to balance'
                  : 'Must total zero'}
          </span>
        </div>
      )}

      {err && <p className="error">{err}</p>}

      <div className="sticky-actions">
        <button className="ghost" onClick={() => navigate(-1)} type="button">
          Cancel
        </button>
        <button
          className="button primary"
          onClick={save}
          disabled={!validation.ok || busy || !online}
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Save night'}
        </button>
      </div>
    </section>
  );
}
