import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/useData';
import { api } from '../lib/api';
import { useEditGate } from '../lib/editGate';
import { isPinError } from '../lib/pin';
import { buildBuyInSummaries, computeSettlement } from '../domain/buyins';
import { todayIso, formatNet, netClass } from '../lib/format';
import { formatChips, isWalletTable, walletBalance } from '../domain/wallet';

const DEFAULT_BUYIN = 1000;

export default function LiveNightPage() {
  const { sessionId } = useParams();
  const { data, tableId, refreshWallets, walletLoadedTables } = useData();
  const { unlocked, requireUnlock, lock } = useEditGate();
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const table = data?.tables.find((candidate) => candidate.tableId === tableId);
  const walletEnabled = isWalletTable(table);
  const walletLoaded = Boolean(tableId && walletLoadedTables.has(tableId));

  useEffect(() => {
    if (
      !tableId ||
      !walletEnabled ||
      !unlocked ||
      walletLoaded ||
      loadingWallets
    ) {
      return;
    }
    setLoadingWallets(true);
    void refreshWallets(tableId)
      .catch((caught) => {
        const message =
          caught instanceof Error ? caught.message : 'Failed to load wallets.';
        if (isPinError(message)) lock();
        setWalletError(message);
      })
      .finally(() => setLoadingWallets(false));
  }, [
    tableId,
    walletEnabled,
    unlocked,
    walletLoaded,
    loadingWallets,
    refreshWallets,
    lock,
  ]);

  if (!data || !tableId) {
    return <p className="muted">Select a table first.</p>;
  }

  if (walletEnabled && (!unlocked || !walletLoaded)) {
    return (
      <section>
        <h1>Live night</h1>
        <div className="empty">
          <p className="empty-emoji">🔒</p>
          <p>Unlock organizer access to use player wallets.</p>
          <button
            className="button"
            type="button"
            disabled={loadingWallets}
            onClick={() => void requireUnlock()}
          >
            {loadingWallets ? 'Loading…' : 'Unlock live table'}
          </button>
          {walletError && <p className="error">{walletError}</p>}
        </div>
      </section>
    );
  }

  return sessionId ? (
    <ManageLive key={sessionId} sessionId={sessionId} />
  ) : (
    <StartLive />
  );
}

/* ------------------------------------------------------------------ */
/* Start a new live night                                              */
/* ------------------------------------------------------------------ */

function StartLive() {
  const { data, tableId, refresh, refreshWallets, online } = useData();
  const { requireUnlock, lock } = useEditGate();
  const navigate = useNavigate();

  const players = useMemo(
    () => (data ? data.players.filter((p) => p.tableId === tableId) : []),
    [data, tableId],
  );
  const table = data?.tables.find((candidate) => candidate.tableId === tableId);
  const walletEnabled = isWalletTable(table);
  const defaultBuyIn = table?.defaultBuyIn ?? DEFAULT_BUYIN;

  const [date, setDate] = useState(todayIso());
  const [location, setLocation] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  // playerId -> buy-in amount string
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [newGuest, setNewGuest] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [operationId] = useState(() => crypto.randomUUID());

  const pickedIds = Object.keys(picked);
  const nameOf = (id: string) =>
    players.find((p) => p.playerId === id)?.name ?? id;

  function toggle(playerId: string) {
    setPicked((prev) => {
      const next = { ...prev };
      if (playerId in next) delete next[playerId];
      else next[playerId] = String(defaultBuyIn);
      return next;
    });
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
      setPicked((prev) => ({ ...prev, [playerId]: String(defaultBuyIn) }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add guest.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (pickedIds.length < 2) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      const { sessionId } = await api.startSession({
        operationId,
        tableId: tableId!,
        date,
        location,
        notes: '',
        players: pickedIds.map((id) => ({
          playerId: id,
          amount: Number(picked[id]) || defaultBuyIn,
        })),
      });
      await refresh();
      if (walletEnabled) await refreshWallets(tableId!);
      navigate(`/live/${sessionId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start night.';
      if (isPinError(msg)) lock();
      setErr(msg);
      setBusy(false);
    }
  }

  const insufficientIds = walletEnabled
    ? pickedIds.filter(
        (id) =>
          walletBalance(data!.wallets, tableId!, id) <
          (Number(picked[id]) || 0),
      )
    : [];

  return (
    <section className="add-page">
      <h1>Start live night</h1>
      <p className="hint">
        {walletEnabled
          ? 'Pick who’s in. Starting buy-ins are deducted from player wallets.'
          : 'Pick who’s in, set their starting buy-in, then track re-buys live.'}
      </p>

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
          {showExtra ? 'Hide location' : '+ Location'}
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
        </div>
      )}

      <h2>Who’s playing?</h2>
      <div className="chips">
        {players.map((p) => (
          <button
            key={p.playerId}
            type="button"
            className={`chip ${p.playerId in picked ? 'on' : ''}`}
            onClick={() => toggle(p.playerId)}
          >
            <span>{p.name}</span>
            {walletEnabled && (
              <small>
                {formatChips(
                  walletBalance(data!.wallets, tableId!, p.playerId),
                )}
              </small>
            )}
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

      {pickedIds.length > 0 && (
        <>
          <h2>Starting buy-ins</h2>
          <div className="result-rows">
            {pickedIds.map((id) => (
              <div className="buyin-row" key={id}>
                <span className="result-name">
                  {nameOf(id)}
                  {walletEnabled && (
                    <small className="wallet-inline-balance">
                      Wallet{' '}
                      {formatChips(walletBalance(data!.wallets, tableId!, id))}
                    </small>
                  )}
                </span>
                <input
                  className="net-input"
                  type="number"
                  inputMode="numeric"
                  value={picked[id]}
                  onChange={(e) =>
                    setPicked((prev) => ({ ...prev, [id]: e.target.value }))
                  }
                />
                <button
                  className="ghost small remove"
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`Remove ${nameOf(id)}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {insufficientIds.length > 0 && (
        <div className="session-insufficient">
          <div>
            <b>Insufficient wallet balance</b>
            <span>
              {insufficientIds.map(nameOf).join(', ')} must be topped up before
              starting.
            </span>
          </div>
          <Link className="ghost button small" to="/wallet">
            Open Wallet
          </Link>
        </div>
      )}

      {err && <p className="error">{err}</p>}

      <div className="sticky-actions">
        <button className="ghost" onClick={() => navigate(-1)} type="button">
          Cancel
        </button>
        <button
          className="button primary"
          onClick={start}
          disabled={
            pickedIds.length < 2 ||
            insufficientIds.length > 0 ||
            busy ||
            !online
          }
        >
          {busy ? 'Starting…' : 'Start night'}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Manage / close an in-progress live night                            */
/* ------------------------------------------------------------------ */

function ManageLive({ sessionId }: { sessionId: string }) {
  const { data, tableId, refresh, refreshWallets, online } = useData();
  const { requireUnlock, lock } = useEditGate();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // player currently having a buy-in added (inline form open)
  const [addFor, setAddFor] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState(String(DEFAULT_BUYIN));
  const [addRemark, setAddRemark] = useState('');
  const [addOperationId, setAddOperationId] = useState('');
  const [joinPick, setJoinPick] = useState('');
  const [joinOperationId, setJoinOperationId] = useState(() =>
    crypto.randomUUID(),
  );
  const [cashing, setCashing] = useState(false);
  const [chips, setChips] = useState<Record<string, string>>({});

  const session = data!.sessions.find(
    (s) => s.sessionId === sessionId && s.tableId === tableId,
  );
  const table = data!.tables.find((candidate) => candidate.tableId === tableId);
  const walletEnabled = isWalletTable(table);
  const defaultBuyIn = table?.defaultBuyIn ?? DEFAULT_BUYIN;

  const summaries = useMemo(
    () => buildBuyInSummaries(data!.buyIns, data!.players, sessionId),
    [data, sessionId],
  );

  if (!session) {
    return (
      <section>
        <p className="muted">Live night not found.</p>
        <button className="ghost small" onClick={() => navigate('/history')}>
          Back to history
        </button>
      </section>
    );
  }

  if (session.status === 'closed') {
    navigate(`/history/${sessionId}`, { replace: true });
    return null;
  }

  const totalPot = summaries.reduce((a, s) => a + s.totalBuyIn, 0);
  const inSession = new Set(summaries.map((s) => s.playerId));
  const others = data!.players.filter(
    (p) => p.tableId === tableId && !inSession.has(p.playerId),
  );

  const settlement = computeSettlement(
    summaries,
    Object.fromEntries(
      summaries.map((s) => [s.playerId, Number(chips[s.playerId]) || 0]),
    ),
  );
  const emptyChipIds = summaries.filter(
    (s) => (chips[s.playerId] ?? '').trim() === '',
  );

  function openAdd(playerId: string) {
    setAddFor(playerId);
    setAddAmount(String(defaultBuyIn));
    setAddRemark('');
    setAddOperationId(crypto.randomUUID());
  }

  async function submitBuyIn() {
    if (!addFor) return;
    const amount = Number(addAmount);
    if (!(amount > 0)) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.addBuyIn(
        addOperationId,
        tableId!,
        sessionId,
        addFor,
        amount,
        addRemark.trim(),
      );
      await refresh();
      if (walletEnabled) await refreshWallets(tableId!);
      setAddFor(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add buy-in.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function joinPlayer() {
    if (!joinPick) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.addBuyIn(
        joinOperationId,
        tableId!,
        sessionId,
        joinPick,
        defaultBuyIn,
        '',
      );
      await refresh();
      if (walletEnabled) await refreshWallets(tableId!);
      setJoinPick('');
      setJoinOperationId(crypto.randomUUID());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add player.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  async function removeBuyIn(buyInId: string) {
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteBuyIn(buyInId);
      await refresh();
      if (walletEnabled) await refreshWallets(tableId!);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to remove buy-in.';
      if (isPinError(msg)) lock();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  function autoBalanceChips(playerId: string) {
    const otherChips = summaries
      .filter((s) => s.playerId !== playerId)
      .reduce((a, s) => a + (Number(chips[s.playerId]) || 0), 0);
    const needed = totalPot - otherChips;
    setChips((prev) => ({ ...prev, [playerId]: String(Math.max(0, needed)) }));
  }

  async function closeNight() {
    if (!settlement.balanced) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setErr(null);
    try {
      await api.closeSession({
        tableId: tableId!,
        sessionId,
        results: summaries.map((s) => ({
          playerId: s.playerId,
          chips: Number(chips[s.playerId]) || 0,
        })),
      });
      await refresh();
      if (walletEnabled) await refreshWallets(tableId!);
      navigate(`/history/${sessionId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to close night.';
      if (isPinError(msg)) lock();
      setErr(msg);
      setBusy(false);
    }
  }

  return (
    <section className="live-page">
      <div className="section-head">
        <div>
          <h1>
            <span className="live-dot" /> Live night
          </h1>
          {session.location && <p className="sub">{session.location}</p>}
        </div>
        <button className="ghost small" onClick={() => navigate('/history')}>
          ← Back
        </button>
      </div>

      <div className="session-summary">
        <div className="summary-item">
          <span className="summary-label">Players</span>
          <span className="summary-value">{summaries.length}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">On table</span>
          <span className="summary-value">{totalPot}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Buy-ins</span>
          <span className="summary-value">
            {summaries.reduce((a, s) => a + s.count, 0)}
          </span>
        </div>
      </div>

      {!cashing && (
        <>
          <ul className="buyin-list">
            {summaries.map((s) => (
              <li key={s.playerId} className="buyin-card">
                <div className="buyin-head">
                  <span className="buyin-name">{s.name}</span>
                  <span className="buyin-total">{s.totalBuyIn}</span>
                </div>
                {walletEnabled && (
                  <div className="live-wallet-balance">
                    Wallet available:{' '}
                    <b>
                      {formatChips(
                        walletBalance(data!.wallets, tableId!, s.playerId),
                      )}
                    </b>
                  </div>
                )}
                <div className="buyin-sub">
                  {s.count} buy-in{s.count > 1 ? 's' : ''}
                  {s.entries.map((b) => (
                    <button
                      key={b.buyInId}
                      className="buyin-tag"
                      type="button"
                      title={b.remark || 'Tap to remove this buy-in'}
                      onClick={() => removeBuyIn(b.buyInId)}
                      disabled={busy || !online}
                    >
                      {b.amount}
                      {b.remark ? ` · ${b.remark}` : ''} ✕
                    </button>
                  ))}
                </div>

                {addFor === s.playerId ? (
                  <div className="buyin-add">
                    <input
                      className="net-input"
                      type="number"
                      inputMode="numeric"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      aria-label="Buy-in amount"
                    />
                    <input
                      className="remark-input"
                      value={addRemark}
                      placeholder="Remark (optional)"
                      onChange={(e) => setAddRemark(e.target.value)}
                    />
                    <button
                      className="button small"
                      type="button"
                      onClick={submitBuyIn}
                      disabled={
                        busy ||
                        !online ||
                        (walletEnabled &&
                          (Number(addAmount) || 0) >
                            walletBalance(data!.wallets, tableId!, s.playerId))
                      }
                    >
                      Add
                    </button>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => setAddFor(null)}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="ghost small buyin-more"
                    type="button"
                    onClick={() => openAdd(s.playerId)}
                    disabled={!online}
                  >
                    + Buy-in
                  </button>
                )}
                {walletEnabled &&
                  addFor === s.playerId &&
                  (Number(addAmount) || 0) >
                    walletBalance(data!.wallets, tableId!, s.playerId) && (
                    <p className="error">
                      Insufficient wallet balance.{' '}
                      <Link to="/wallet">Top up in Wallet</Link>
                    </p>
                  )}
              </li>
            ))}
          </ul>

          {others.length > 0 && (
            <div className="inline-form join-row">
              <select
                value={joinPick}
                onChange={(e) => {
                  setJoinPick(e.target.value);
                  setJoinOperationId(crypto.randomUUID());
                }}
                aria-label="Add a player"
              >
                <option value="">+ Add a player…</option>
                {others.map((p) => (
                  <option key={p.playerId} value={p.playerId}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                className="ghost"
                type="button"
                onClick={joinPlayer}
                disabled={
                  !joinPick ||
                  busy ||
                  !online ||
                  (walletEnabled &&
                    walletBalance(data!.wallets, tableId!, joinPick) <
                      defaultBuyIn)
                }
              >
                Join
              </button>
            </div>
          )}

          {walletEnabled &&
            joinPick &&
            walletBalance(data!.wallets, tableId!, joinPick) < defaultBuyIn && (
              <p className="error">
                This player needs a wallet top up before joining.{' '}
                <Link to="/wallet">Open Wallet</Link>
              </p>
            )}

          {err && <p className="error">{err}</p>}

          <div className="sticky-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setChips({});
                setCashing(true);
              }}
              disabled={summaries.length < 2}
            >
              Cash out →
            </button>
          </div>
        </>
      )}

      {cashing && (
        <>
          <h2>Cash out</h2>
          <p className="hint">
            {walletEnabled
              ? `Enter each player’s final chips. Closing credits these chips back to their wallets. Totals must match the ${totalPot} on the table.`
              : `Enter each player’s final chip count. Totals must match the ${totalPot} on the table.`}
          </p>
          <div className="result-rows">
            {summaries.map((s) => {
              const line = settlement.lines.find(
                (l) => l.playerId === s.playerId,
              )!;
              return (
                <div className="cashout-row" key={s.playerId}>
                  <span className="result-name">{s.name}</span>
                  <input
                    className="net-input"
                    type="number"
                    inputMode="numeric"
                    placeholder="chips"
                    value={chips[s.playerId] ?? ''}
                    onChange={(e) =>
                      setChips((prev) => ({
                        ...prev,
                        [s.playerId]: e.target.value,
                      }))
                    }
                  />
                  {emptyChipIds.length === 1 &&
                  emptyChipIds[0].playerId === s.playerId ? (
                    <button
                      className="balance-btn small"
                      type="button"
                      onClick={() => autoBalanceChips(s.playerId)}
                      title="Fill so chips balance"
                    >
                      =
                    </button>
                  ) : (
                    <span className={`net ${netClass(line.net)}`}>
                      {formatNet(line.net)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className={`balance ${settlement.balanced ? 'ok' : 'bad'}`}>
            <span className="balance-label">Chips vs pot</span>
            <span className={`net ${netClass(settlement.imbalance)}`}>
              {formatNet(settlement.imbalance)}
            </span>
            <span className="balance-hint">
              {settlement.balanced
                ? 'Balanced ✓'
                : emptyChipIds.length === 1
                  ? 'Tap = to balance'
                  : `Off by ${formatNet(settlement.imbalance)}`}
            </span>
          </div>

          {err && <p className="error">{err}</p>}

          <div className="sticky-actions">
            <button
              className="ghost"
              type="button"
              onClick={() => setCashing(false)}
            >
              ← Back
            </button>
            <button
              className="button primary"
              type="button"
              onClick={closeNight}
              disabled={!settlement.balanced || busy || !online}
            >
              {busy
                ? 'Closing…'
                : walletEnabled
                  ? 'Buy out & close'
                  : 'Close & save'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
