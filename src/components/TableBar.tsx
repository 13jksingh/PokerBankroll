import { useState } from 'react';
import { useData } from '../lib/useData';
import { api } from '../lib/api';
import { useEditGate } from '../lib/editGate';
import { isPinError } from '../lib/pin';

export default function TableBar() {
  const { data, tableId, setTableId, refresh, online } = useData();
  const { requireUnlock, lock } = useEditGate();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [mode, setMode] = useState<'legacy' | 'wallet'>('legacy');
  const [chipsPerRupee, setChipsPerRupee] = useState('10');
  const [defaultBuyIn, setDefaultBuyIn] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;
  const tables = data.tables;

  async function create() {
    if (!name.trim()) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      const { tableId: newId } = await api.createTable({
        name: name.trim(),
        mode,
        ...(mode === 'wallet'
          ? {
              chipsPerRupee: Number(chipsPerRupee),
              defaultBuyIn: Number(defaultBuyIn),
            }
          : {}),
      });
      await refresh();
      setTableId(newId);
      setName('');
      setMode('legacy');
      setCreating(false);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to create table.';
      if (isPinError(message)) lock();
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function removeTable() {
    const table = tables.find((candidate) => candidate.tableId === tableId);
    if (!table || deleteConfirmation !== table.name) return;
    if (
      !confirm(
        `Permanently delete "${table.name}" and all of its players, sessions and wallet history?`,
      )
    ) {
      return;
    }
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteTable(table.tableId, deleteConfirmation);
      const nextTable = tables.find(
        (candidate) => candidate.tableId !== table.tableId,
      );
      setTableId(nextTable?.tableId ?? '');
      await refresh();
      setDeleteConfirmation('');
      setDeleting(false);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to delete table.';
      if (isPinError(message)) lock();
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tablebar">
      {tables.length > 0 ? (
        <label className="table-select">
          <span>Table</span>
          <select
            value={tableId ?? ''}
            onChange={(e) => setTableId(e.target.value)}
          >
            {tables.map((t) => (
              <option key={t.tableId} value={t.tableId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="muted">No tables yet — create one to start.</span>
      )}

      {creating ? (
        <div className="table-create-form">
          <input
            value={name}
            placeholder="New table name"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <select
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as 'legacy' | 'wallet')
            }
            aria-label="Table type"
          >
            <option value="legacy">Legacy scoring</option>
            <option value="wallet">Real-money wallet</option>
          </select>
          {mode === 'wallet' && (
            <div className="table-wallet-settings">
              <label>
                <span>Chips per ₹1</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={chipsPerRupee}
                  onChange={(event) => setChipsPerRupee(event.target.value)}
                />
              </label>
              <label>
                <span>Default buy-in</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={defaultBuyIn}
                  onChange={(event) => setDefaultBuyIn(event.target.value)}
                />
              </label>
            </div>
          )}
          <div className="table-create-actions">
            <button
              onClick={create}
              disabled={
                busy ||
                !online ||
                (mode === 'wallet' &&
                  (!(Number(chipsPerRupee) > 0) || !(Number(defaultBuyIn) > 0)))
              }
            >
              {busy ? '…' : 'Create'}
            </button>
            <button className="ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : deleting ? (
        <div className="table-delete-form">
          <p>
            Type{' '}
            <b>
              {tables.find((candidate) => candidate.tableId === tableId)?.name}
            </b>{' '}
            to delete this table.
          </p>
          <input
            value={deleteConfirmation}
            placeholder="Table name"
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            autoFocus
          />
          <div className="table-create-actions">
            <button
              className="danger"
              type="button"
              onClick={removeTable}
              disabled={
                busy ||
                !online ||
                deleteConfirmation !==
                  tables.find((candidate) => candidate.tableId === tableId)
                    ?.name
              }
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setDeleting(false);
                setDeleteConfirmation('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="tablebar-actions">
          <button
            className="ghost small"
            onClick={() => setCreating(true)}
            disabled={!online}
          >
            + New table
          </button>
          {tables.length > 0 && (
            <button
              className="ghost small table-delete-button"
              onClick={() => setDeleting(true)}
              disabled={!online}
              title="Delete selected table"
              aria-label="Delete selected table"
            >
              🗑
            </button>
          )}
        </div>
      )}
      {err && <span className="error">{err}</span>}
    </div>
  );
}
