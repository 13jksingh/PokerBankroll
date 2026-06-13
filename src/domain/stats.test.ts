import { describe, expect, it } from 'vitest';
import type { Player, Result, Session } from './types';
import { buildSessionMatrix, computePlayerStats } from './stats';

const players: Player[] = [
  { tableId: 't1', playerId: 'p1', name: 'Ann', status: 'guest', createdAt: '2024-01-01' },
  { tableId: 't1', playerId: 'p2', name: 'Bob', status: 'guest', createdAt: '2024-01-01' },
  { tableId: 't2', playerId: 'p9', name: 'Other', status: 'guest', createdAt: '2024-01-01' },
];

const sessions: Session[] = [
  { tableId: 't1', sessionId: 's1', date: '2024-01-10', location: '', notes: '', createdAt: '2024-01-10T00:00:00Z' },
  { tableId: 't1', sessionId: 's2', date: '2024-01-20', location: '', notes: '', createdAt: '2024-01-20T00:00:00Z' },
  { tableId: 't2', sessionId: 's9', date: '2024-01-15', location: '', notes: '', createdAt: '2024-01-15T00:00:00Z' },
];

const results: Result[] = [
  { tableId: 't1', sessionId: 's1', playerId: 'p1', net: 100 },
  { tableId: 't1', sessionId: 's1', playerId: 'p2', net: -100 },
  { tableId: 't1', sessionId: 's2', playerId: 'p1', net: -40 },
  { tableId: 't1', sessionId: 's2', playerId: 'p2', net: 40 },
  { tableId: 't2', sessionId: 's9', playerId: 'p9', net: 0 },
];

describe('buildSessionMatrix', () => {
  it('orders columns most-recent first', () => {
    const m = buildSessionMatrix(players, sessions, results, 't1');
    expect(m.columns.map((c) => c.sessionId)).toEqual(['s2', 's1']);
  });

  it('fills cells per player aligned with columns and computes totals', () => {
    const m = buildSessionMatrix(players, sessions, results, 't1');
    const ann = m.rows.find((r) => r.playerId === 'p1')!;
    // columns are [s2, s1] => [-40, 100]
    expect(ann.cells).toEqual([-40, 100]);
    expect(ann.total).toBe(60);
    expect(ann.gamesPlayed).toBe(2);
  });

  it('uses null for sessions a player did not play', () => {
    const sparse: Result[] = [{ tableId: 't1', sessionId: 's1', playerId: 'p1', net: 100 }];
    const m = buildSessionMatrix(players, sessions, sparse, 't1');
    const bob = m.rows.find((r) => r.playerId === 'p2')!;
    expect(bob.cells).toEqual([null, null]);
    expect(bob.gamesPlayed).toBe(0);
    expect(bob.total).toBe(0);
  });

  it('only includes the requested table', () => {
    const m = buildSessionMatrix(players, sessions, results, 't1');
    expect(m.rows.map((r) => r.playerId).sort()).toEqual(['p1', 'p2']);
  });
});

describe('computePlayerStats', () => {
  it('computes totals, averages and extremes per player', () => {
    const stats = computePlayerStats(players, results, 't1');
    const ann = stats.find((s) => s.playerId === 'p1')!;
    expect(ann.gamesPlayed).toBe(2);
    expect(ann.totalNet).toBe(60);
    expect(ann.avgNet).toBe(30);
    expect(ann.biggestWin).toBe(100);
    expect(ann.biggestLoss).toBe(-40);
    expect(ann.profitableNights).toBe(1);
  });

  it('handles players with no games', () => {
    const stats = computePlayerStats(players, [], 't1');
    const ann = stats.find((s) => s.playerId === 'p1')!;
    expect(ann.gamesPlayed).toBe(0);
    expect(ann.totalNet).toBe(0);
    expect(ann.avgNet).toBe(0);
    expect(ann.biggestWin).toBe(0);
    expect(ann.biggestLoss).toBe(0);
  });

  it('sorts by total net descending', () => {
    const stats = computePlayerStats(players, results, 't1');
    expect(stats.map((s) => s.playerId)).toEqual(['p1', 'p2']);
  });
});
