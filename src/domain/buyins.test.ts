import { describe, expect, it } from 'vitest';
import { buildBuyInSummaries, computeSettlement } from './buyins';
import type { BuyIn, Player } from './types';

function player(playerId: string, name: string): Player {
  return { tableId: 't1', playerId, name, status: 'guest', createdAt: '' };
}

function buyIn(
  playerId: string,
  amount: number,
  createdAt: string,
  remark = '',
  sessionId = 's1',
): BuyIn {
  return {
    tableId: 't1',
    sessionId,
    playerId,
    buyInId: `${playerId}-${createdAt}`,
    amount,
    remark,
    createdAt,
  };
}

const players = [player('p1', 'Ann'), player('p2', 'Bob'), player('p3', 'Cy')];

describe('buildBuyInSummaries', () => {
  it('rolls up count and total per player for the session', () => {
    const buyIns = [
      buyIn('p1', 1000, '2026-01-01T20:00:00Z'),
      buyIn('p1', 1000, '2026-01-01T21:00:00Z', '2nd'),
      buyIn('p2', 1000, '2026-01-01T20:05:00Z'),
    ];
    const s = buildBuyInSummaries(buyIns, players, 's1');
    const ann = s.find((x) => x.playerId === 'p1')!;
    expect(ann.count).toBe(2);
    expect(ann.totalBuyIn).toBe(2000);
    expect(s.find((x) => x.playerId === 'p2')!.totalBuyIn).toBe(1000);
  });

  it('ignores buy-ins from other sessions', () => {
    const buyIns = [
      buyIn('p1', 1000, '2026-01-01T20:00:00Z'),
      buyIn('p2', 1000, '2026-01-01T20:00:00Z', '', 's2'),
    ];
    const s = buildBuyInSummaries(buyIns, players, 's1');
    expect(s).toHaveLength(1);
    expect(s[0].playerId).toBe('p1');
  });

  it('orders players by first buy-in time (join order)', () => {
    const buyIns = [
      buyIn('p2', 1000, '2026-01-01T20:00:00Z'),
      buyIn('p1', 1000, '2026-01-01T20:10:00Z'),
      buyIn('p3', 1000, '2026-01-01T20:20:00Z'),
    ];
    const s = buildBuyInSummaries(buyIns, players, 's1');
    expect(s.map((x) => x.playerId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('sorts each player entries chronologically', () => {
    const buyIns = [
      buyIn('p1', 1000, '2026-01-01T21:00:00Z', 'late'),
      buyIn('p1', 1000, '2026-01-01T20:00:00Z', 'early'),
    ];
    const s = buildBuyInSummaries(buyIns, players, 's1');
    expect(s[0].entries.map((e) => e.remark)).toEqual(['early', 'late']);
  });
});

describe('computeSettlement', () => {
  const summaries = buildBuyInSummaries(
    [
      buyIn('p1', 1000, '2026-01-01T20:00:00Z'),
      buyIn('p1', 1000, '2026-01-01T21:00:00Z'),
      buyIn('p2', 1000, '2026-01-01T20:05:00Z'),
    ],
    players,
    's1',
  );

  it('computes net = chips − total buy-in per player', () => {
    const s = computeSettlement(summaries, { p1: 2500, p2: 500 });
    const p1 = s.lines.find((l) => l.playerId === 'p1')!;
    expect(p1.net).toBe(500); // 2500 − 2000
    expect(s.lines.find((l) => l.playerId === 'p2')!.net).toBe(-500);
  });

  it('is balanced when total chips equal total buy-ins', () => {
    const s = computeSettlement(summaries, { p1: 2500, p2: 500 });
    expect(s.totalBuyIn).toBe(3000);
    expect(s.totalChips).toBe(3000);
    expect(s.imbalance).toBe(0);
    expect(s.balanced).toBe(true);
  });

  it('flags imbalance when chip counts do not add up', () => {
    const s = computeSettlement(summaries, { p1: 2500, p2: 400 });
    expect(s.imbalance).toBe(-100);
    expect(s.balanced).toBe(false);
  });

  it('treats missing chip counts as zero', () => {
    const s = computeSettlement(summaries, { p1: 3000 });
    expect(s.lines.find((l) => l.playerId === 'p2')!.chips).toBe(0);
    expect(s.lines.find((l) => l.playerId === 'p2')!.net).toBe(-1000);
  });
});
