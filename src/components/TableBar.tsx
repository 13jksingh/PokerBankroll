import { useState } from 'react';
import { useData } from '../lib/useData';
import { api } from '../lib/api';

export default function TableBar() {
  const { data, tableId, setTableId, refresh, online } = useData();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!data) return null;
  const tables = data.tables;

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { tableId: newId } = await api.createTable(name.trim());
      await refresh();
      setTableId(newId);
      setName('');
      setCreating(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create table.');
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
        <div className="inline-form">
          <input
            value={name}
            placeholder="New table name"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button onClick={create} disabled={busy || !online}>
            {busy ? '…' : 'Create'}
          </button>
          <button className="ghost" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="ghost small"
          onClick={() => setCreating(true)}
          disabled={!online}
        >
          + New table
        </button>
      )}
      {err && <span className="error">{err}</span>}
    </div>
  );
}
