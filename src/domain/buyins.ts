import type {
  BuyIn,
  Player,
  PlayerBuyInSummary,
  SettlementLine,
} from './types';

const EPSILON = 0.01;

/**
 * Roll up a live session's buy-ins per player, ordered by when each player
 * first bought in (join order). Only buy-ins for the given session are used.
 */
export function buildBuyInSummaries(
  buyIns: BuyIn[],
  players: Player[],
  sessionId: string,
): PlayerBuyInSummary[] {
  const nameOf = new Map(players.map((p) => [p.playerId, p.name]));
  const byPlayer = new Map<string, BuyIn[]>();
  const firstSeen = new Map<string, string>();

  for (const b of buyIns) {
    if (b.sessionId !== sessionId) continue;
    if (!byPlayer.has(b.playerId)) byPlayer.set(b.playerId, []);
    byPlayer.get(b.playerId)!.push(b);
    const prev = firstSeen.get(b.playerId);
    if (prev === undefined || b.createdAt < prev) {
      firstSeen.set(b.playerId, b.createdAt);
    }
  }

  const summaries: PlayerBuyInSummary[] = [];
  for (const [playerId, entries] of byPlayer) {
    const sorted = [...entries].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
    summaries.push({
      playerId,
      name: nameOf.get(playerId) ?? playerId,
      count: sorted.length,
      totalBuyIn: sorted.reduce((a, b) => a + b.amount, 0),
      entries: sorted,
    });
  }

  summaries.sort((a, b) => {
    const fa = firstSeen.get(a.playerId) ?? '';
    const fb = firstSeen.get(b.playerId) ?? '';
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
  return summaries;
}

export interface Settlement {
  lines: SettlementLine[];
  totalBuyIn: number;
  totalChips: number;
  /** totalChips − totalBuyIn. Zero when the night balances. */
  imbalance: number;
  balanced: boolean;
}

/**
 * Compute each player's net (chips − their total buy-in) at close-out.
 * `chipsByPlayer` maps playerId → final chip count (missing = 0).
 */
export function computeSettlement(
  summaries: PlayerBuyInSummary[],
  chipsByPlayer: Record<string, number>,
): Settlement {
  const lines: SettlementLine[] = summaries.map((s) => {
    const chips = Number(chipsByPlayer[s.playerId]) || 0;
    return {
      playerId: s.playerId,
      chips,
      totalBuyIn: s.totalBuyIn,
      net: chips - s.totalBuyIn,
    };
  });
  const totalBuyIn = lines.reduce((a, l) => a + l.totalBuyIn, 0);
  const totalChips = lines.reduce((a, l) => a + l.chips, 0);
  const imbalance = totalChips - totalBuyIn;
  return {
    lines,
    totalBuyIn,
    totalChips,
    imbalance,
    balanced: Math.abs(imbalance) <= EPSILON,
  };
}
