import { describe, expect, it } from 'vitest';
import {
  assertZeroSum,
  buyInDocumentId,
  chipsToMoneyPaise,
  commandDocumentId,
  moneyPaiseToChips,
  playerDocumentId,
  resultDocumentId,
  sessionDocumentId,
  tableDocumentId,
} from './domain.js';

describe('document ids', () => {
  it('creates deterministic ids within a table partition', () => {
    expect(tableDocumentId('t1')).toBe('table:t1');
    expect(playerDocumentId('p1')).toBe('player:p1');
    expect(sessionDocumentId('s1')).toBe('session:s1');
    expect(resultDocumentId('s1', 'p1')).toBe('result:s1:p1');
    expect(buyInDocumentId('b1')).toBe('buyIn:b1');
    expect(commandDocumentId('op1')).toBe('command:op1');
  });
});

describe('assertZeroSum', () => {
  it('accepts balanced results', () => {
    expect(() =>
      assertZeroSum([
        { playerId: 'p1', net: 100 },
        { playerId: 'p2', net: -100 },
      ]),
    ).not.toThrow();
  });

  describe('wallet conversion', () => {
    it('converts paise and chips exactly at the table rate', () => {
      expect(moneyPaiseToChips(10_000, 10)).toBe(1000);
      expect(chipsToMoneyPaise(1000, 10)).toBe(10_000);
    });

    it('rejects fractional chips or paise', () => {
      expect(() => moneyPaiseToChips(1, 3)).toThrow('whole number of chips');
      expect(() => chipsToMoneyPaise(1, 3)).toThrow('exact cash value');
    });

    it('rejects zero and non-integer amounts', () => {
      expect(() => moneyPaiseToChips(0, 10)).toThrow('positive whole number');
      expect(() => chipsToMoneyPaise(1.5, 10)).toThrow('positive whole number');
    });
  });

  it('rejects an unbalanced session', () => {
    expect(() =>
      assertZeroSum([
        { playerId: 'p1', net: 100 },
        { playerId: 'p2', net: -90 },
      ]),
    ).toThrow('off by 10.00');
  });
});
