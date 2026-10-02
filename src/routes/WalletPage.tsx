import { useEffect, useMemo, useState } from 'react';
import { useData } from '../lib/useData';
import { api } from '../lib/api';
import { useEditGate } from '../lib/editGate';
import { isPinError } from '../lib/pin';
import {
  chipsToRupees,
  formatChips,
  formatRupees,
  isWalletTable,
  sortWalletTransactions,
  WALLET_TRANSACTION_LABELS,
  walletBalance,
} from '../domain/wallet';

type WalletAction = 'topup' | 'cashout';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function WalletPage() {
  const { data, tableId, refresh, refreshWallets, walletLoadedTables, online } =
    useData();
  const { requireUnlock, lock, unlocked } = useEditGate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<WalletAction | null>(null);
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [actionOperationId, setActionOperationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table = data?.tables.find((candidate) => candidate.tableId === tableId);
  const players = useMemo(
    () =>
      data?.players
        .filter((player) => player.tableId === tableId)
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [data, tableId],
  );

  const walletLoaded = Boolean(tableId && walletLoadedTables.has(tableId));
  useEffect(() => {
    if (
      !tableId ||
      !isWalletTable(table) ||
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
        setError(message);
      })
      .finally(() => setLoadingWallets(false));
  }, [
    tableId,
    table,
    unlocked,
    walletLoaded,
    loadingWallets,
    refreshWallets,
    lock,
  ]);

  if (!data || !tableId || !table) {
    return <p className="muted">Select a table first.</p>;
  }

  if (!isWalletTable(table)) {
    return (
      <section className="wallet-page">
        <h1>Player wallets</h1>
        <div className="empty">
          <p className="empty-emoji">💰</p>
          <p>Wallets are not enabled for this table.</p>
          <p className="muted">
            Existing tables keep legacy scoring. Create a Real-money wallet
            table to use top ups, wallet buy-ins, buy outs and cash outs.
          </p>
        </div>
      </section>
    );
  }

  if (!unlocked || !walletLoaded) {
    return (
      <section className="wallet-page">
        <h1>Player wallets</h1>
        <div className="empty">
          <p className="empty-emoji">🔒</p>
          <p>Organizer access is required.</p>
          <p className="muted">
            Wallet balances, cash amounts and transaction remarks are private.
          </p>
          <button
            className="button"
            type="button"
            disabled={loadingWallets}
            onClick={() => void requireUnlock()}
          >
            {loadingWallets ? 'Loading…' : 'Unlock wallets'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </section>
    );
  }

  const chipsPerRupee = table.chipsPerRupee!;
  const selectedPlayer =
    players.find((player) => player.playerId === selectedId) ?? players[0];
  const effectiveSelectedId = selectedPlayer?.playerId ?? null;
  const selectedBalance = effectiveSelectedId
    ? walletBalance(data.wallets, tableId, effectiveSelectedId)
    : 0;
  const totalChips = data.wallets
    .filter((wallet) => wallet.tableId === tableId)
    .reduce((sum, wallet) => sum + wallet.balance, 0);
  const transactions = effectiveSelectedId
    ? sortWalletTransactions(
        data.walletTransactions.filter(
          (transaction) =>
            transaction.tableId === tableId &&
            transaction.playerId === effectiveSelectedId,
        ),
      )
    : [];

  const numericAmount = Number(amount);
  const actionChips =
    action === 'topup'
      ? Number.isFinite(numericAmount)
        ? (numericAmount * 100 * chipsPerRupee) / 100
        : 0
      : numericAmount;
  const validTopUp =
    action === 'topup' &&
    numericAmount > 0 &&
    Number.isInteger(numericAmount * 100) &&
    Number.isInteger(actionChips);
  const validCashOut =
    action === 'cashout' &&
    Number.isSafeInteger(actionChips) &&
    actionChips > 0 &&
    actionChips <= selectedBalance &&
    Number.isInteger((actionChips * 100) / chipsPerRupee);
  const canConfirm =
    Boolean(effectiveSelectedId) && (validTopUp || validCashOut);

  function openAction(
    nextAction: WalletAction,
    playerId = effectiveSelectedId,
  ) {
    if (!playerId) return;
    setSelectedId(playerId);
    setAction(nextAction);
    setAmount('');
    setRemark('');
    setActionOperationId(crypto.randomUUID());
    setError(null);
  }

  async function confirmAction() {
    if (!effectiveSelectedId || !action || !canConfirm) return;
    if (!(await requireUnlock())) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'topup') {
        await api.topUpWallet(
          actionOperationId,
          tableId!,
          effectiveSelectedId,
          Math.round(numericAmount * 100),
          remark.trim(),
        );
      } else {
        await api.cashOutWallet(
          actionOperationId,
          tableId!,
          effectiveSelectedId,
          actionChips,
          remark.trim(),
        );
      }
      await refresh();
      await refreshWallets(tableId!);
      setAction(null);
      setAmount('');
      setRemark('');
      setActionOperationId('');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Wallet action failed.';
      if (isPinError(message)) lock();
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wallet-page">
      <div className="section-head wallet-title-row">
        <div>
          <div className="wallet-eyebrow">Organizer view</div>
          <h1>Player wallets</h1>
        </div>
        <span className="preview-badge">Live ledger</span>
      </div>

      <div className="wallet-hero">
        <span className="wallet-hero-label">Total player balance</span>
        <strong>{formatChips(totalChips)} chips</strong>
        <span>
          {formatRupees(chipsToRupees(totalChips, chipsPerRupee))} across{' '}
          {players.length} players
        </span>
        <div className="wallet-rate">
          <span>Rate</span>
          <b>{formatChips(chipsPerRupee)} chips = ₹1</b>
          <span className="wallet-rate-separator">•</span>
          <span>Default buy-in</span>
          <b>{formatChips(table.defaultBuyIn!)}</b>
        </div>
      </div>

      <div className="organizer-reserve">
        <span className="organizer-reserve-icon">₹</span>
        <span className="organizer-reserve-main">
          <span>Organizer cash reserve</span>
          <strong>
            {formatRupees(chipsToRupees(totalChips, chipsPerRupee))}
          </strong>
          <small>
            Keep at least this amount available to pay every wallet back.
          </small>
        </span>
        <span className="reserve-status">Required reserve</span>
      </div>

      <div className="wallet-quick-actions">
        <button
          type="button"
          onClick={() => openAction('topup')}
          disabled={!selectedPlayer || !online}
        >
          <span className="wallet-action-icon">＋</span>
          Top up
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => openAction('cashout')}
          disabled={!selectedPlayer || !online}
        >
          <span className="wallet-action-icon">₹</span>
          Cash out
        </button>
      </div>

      <div className="wallet-list-heading">
        <h2>Players</h2>
        <span>Tap to view activity</span>
      </div>

      <div className="wallet-player-list">
        {players.map((player) => {
          const balance = walletBalance(data.wallets, tableId, player.playerId);
          return (
            <button
              type="button"
              key={player.playerId}
              className={`wallet-player-card ${
                player.playerId === effectiveSelectedId ? 'selected' : ''
              }`}
              onClick={() => {
                setSelectedId(player.playerId);
                setAction(null);
                setError(null);
              }}
            >
              <span className="wallet-avatar">{initials(player.name)}</span>
              <span className="wallet-player-main">
                <b>{player.name}</b>
                <span>
                  {formatRupees(chipsToRupees(balance, chipsPerRupee))}
                </span>
              </span>
              <span className="wallet-player-balance">
                <b>{formatChips(balance)}</b>
                <span>chips</span>
              </span>
              <span className="wallet-chevron">›</span>
            </button>
          );
        })}
        {players.length === 0 && (
          <p className="muted">
            Add players from Stats to create their wallets.
          </p>
        )}
      </div>

      {action && selectedPlayer && (
        <div className="wallet-action-card">
          <div className="wallet-action-head">
            <div>
              <span>
                {action === 'topup' ? 'Top up wallet' : 'Cash out wallet'}
              </span>
              <h2>{selectedPlayer.name}</h2>
            </div>
            <button
              type="button"
              className="ghost small wallet-close"
              onClick={() => setAction(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <label className="wallet-amount-field">
            <span>
              {action === 'topup' ? 'Cash received' : 'Chips to cash out'}
            </span>
            <div className="wallet-amount-input">
              <span>{action === 'topup' ? '₹' : '♠'}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step={action === 'topup' ? '0.01' : '1'}
                autoFocus
                placeholder={action === 'topup' ? '100' : '1000'}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </label>

          <label className="wallet-remark-field">
            <span>Remark (optional)</span>
            <input
              value={remark}
              placeholder="e.g. UPI received"
              onChange={(event) => setRemark(event.target.value)}
            />
          </label>

          <div className="wallet-conversion-preview">
            <span>
              {actionChips > 0
                ? action === 'topup'
                  ? `${formatChips(actionChips)} chips will be added`
                  : `${formatRupees(
                      chipsToRupees(actionChips, chipsPerRupee),
                    )} payout`
                : 'Enter an amount to preview'}
            </span>
            <b>
              New balance:{' '}
              {formatChips(
                selectedBalance +
                  (action === 'topup' ? actionChips : -actionChips),
              )}
            </b>
          </div>

          {action === 'cashout' && actionChips > selectedBalance && (
            <p className="error">
              Cash out exceeds the available wallet balance.
            </p>
          )}
          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="button primary wallet-confirm"
            disabled={!canConfirm || busy || !online}
            onClick={confirmAction}
          >
            {busy
              ? 'Saving…'
              : action === 'topup'
                ? 'Confirm top up'
                : 'Confirm cash paid'}
          </button>
        </div>
      )}

      {selectedPlayer && (
        <div className="wallet-activity">
          <div className="wallet-list-heading">
            <div>
              <h2>{selectedPlayer.name}</h2>
              <span>Wallet activity</span>
            </div>
            <span className="wallet-current-balance">
              {formatChips(selectedBalance)} chips
            </span>
          </div>

          <div className="wallet-ledger">
            {transactions.map((transaction) => (
              <div
                className="wallet-ledger-row"
                key={transaction.transactionId}
              >
                <span
                  className={`wallet-ledger-icon ${
                    transaction.chips >= 0 ? 'credit' : 'debit'
                  }`}
                >
                  {transaction.chips >= 0 ? '↓' : '↑'}
                </span>
                <span className="wallet-ledger-main">
                  <b>
                    {WALLET_TRANSACTION_LABELS[transaction.transactionType]}
                  </b>
                  <span>
                    {new Date(transaction.createdAt).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {transaction.moneyPaise != null
                      ? ` · ${formatRupees(transaction.moneyPaise / 100)}`
                      : ''}
                    {transaction.remark ? ` · ${transaction.remark}` : ''}
                  </span>
                </span>
                <span
                  className={`wallet-ledger-amount ${
                    transaction.chips >= 0 ? 'credit' : 'debit'
                  }`}
                >
                  {transaction.chips > 0 ? '+' : ''}
                  {formatChips(transaction.chips)}
                </span>
              </div>
            ))}
            {transactions.length === 0 && (
              <p className="wallet-empty-ledger">No wallet activity yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
