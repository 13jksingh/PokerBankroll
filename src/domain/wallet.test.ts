import { describe, expect, it } from 'vitest';
import {
  chipsToRupees,
  isWalletTable,
  sortWalletTransactions,
  walletBalance,
} from './wallet';

describe('wallet helpers', () => {
  it('identifies only opted-in wallet tables', () => {
    expect(
      isWalletTable({
        tableId: 't1',
        name: 'Wallet',
        createdAt: '',
        mode: 'wallet',
      }),
    ).toBe(true);
    expect(
      isWalletTable({ tableId: 't2', name: 'Legacy', createdAt: '' }),
    ).toBe(false);
  });

  it('reads scoped balances and converts chips', () => {
    expect(
      walletBalance(
        [{ tableId: 't1', playerId: 'p1', balance: 1250, updatedAt: '' }],
        't1',
        'p1',
      ),
    ).toBe(1250);
    expect(chipsToRupees(1250, 10)).toBe(125);
  });

  it('sorts newest transactions first', () => {
    const base = {
      tableId: 't1',
      playerId: 'p1',
      transactionType: 'top_up' as const,
      chips: 100,
      moneyPaise: 1000,
      sessionId: null,
      buyInId: null,
      remark: '',
    };
    const sorted = sortWalletTransactions([
      { ...base, transactionId: 'old', createdAt: '2026-01-01' },
      { ...base, transactionId: 'new', createdAt: '2026-02-01' },
    ]);
    expect(sorted.map((transaction) => transaction.transactionId)).toEqual([
      'new',
      'old',
    ]);
  });
});
