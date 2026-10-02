import type {
  Table,
  Wallet,
  WalletTransaction,
  WalletTransactionType,
} from './types';

export function isWalletTable(table: Table | undefined): boolean {
  return table?.mode === 'wallet';
}

export function walletBalance(
  wallets: Wallet[],
  tableId: string,
  playerId: string,
): number {
  return (
    wallets.find(
      (wallet) => wallet.tableId === tableId && wallet.playerId === playerId,
    )?.balance ?? 0
  );
}

export function chipsToRupees(chips: number, chipsPerRupee: number): number {
  return chips / chipsPerRupee;
}

export function formatChips(chips: number): string {
  return new Intl.NumberFormat('en-IN').format(chips);
}

export function formatRupees(rupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
  }).format(rupees);
}

export const WALLET_TRANSACTION_LABELS: Record<WalletTransactionType, string> =
  {
    top_up: 'Top up',
    cash_out: 'Cash out',
    buy_in: 'Buy-in',
    buy_in_adjustment: 'Buy-in corrected',
    buy_in_reversal: 'Buy-in removed',
    buy_out: 'Buy out',
    buy_out_reversal: 'Buy out reversed',
    session_reversal: 'Session reversed',
  };

export function sortWalletTransactions(
  transactions: WalletTransaction[],
): WalletTransaction[] {
  return [...transactions].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}
