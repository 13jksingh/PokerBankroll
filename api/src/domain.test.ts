import { describe, expect, it } from 'vitest';
import {
  assertZeroSum,
  buyInDocumentId,
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

  it('rejects an unbalanced session', () => {
    expect(() =>
      assertZeroSum([
        { playerId: 'p1', net: 100 },
        { playerId: 'p2', net: -90 },
      ]),
    ).toThrow('off by 10.00');
  });
});
