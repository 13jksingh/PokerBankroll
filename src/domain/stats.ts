import type { Player, PlayerStatus, Result, Session } from './types';
import { statusForGamesPlayed } from './standings';

function forTable<T extends { tableId: string }>(rows: T[], tableId: string): T[] {
  return rows.filter((r) => r.tableId === tableId);
}

export interface MatrixColumn {
  sessionId: string;
  date: string;
}

export interface MatrixRow {
  playerId: string;
  name: string;
  status: PlayerStatus;
  gamesPlayed: number;
  total: number;
  /** Net per column (aligned with `columns`); null if the player didn't play. */
  cells: Array<number | null>;
}

export interface SessionMatrix {
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

/**
 * Build a players × sessions grid for a table.
 * Columns are sessions ordered most-recent first.
 * Rows are players ordered by total net (descending), each with a net per
 * session (null when they did not play) and a running total.
 */
export function buildSessionMatrix(
  players: Player[],
  sessions: Session[],
  results: Result[],
  tableId: string,
): SessionMatrix {
  const tablePlayers = forTable(players, tableId);
  const tableResults = forTable(results, tableId);

  const orderedSessions = forTable(sessions, tableId).slice().sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() ||
      b.createdAt.localeCompare(a.createdAt),
  );

  const columns: MatrixColumn[] = orderedSessions.map((s) => ({
    sessionId: s.sessionId,
    date: s.date,
  }));
  const colIndex = new Map(columns.map((c, i) => [c.sessionId, i]));

  const netBySessionByPlayer = new Map<string, Map<string, number>>();
  for (const r of tableResults) {
    if (!colIndex.has(r.sessionId)) continue;
    let byPlayer = netBySessionByPlayer.get(r.playerId);
    if (!byPlayer) {
      byPlayer = new Map();
      netBySessionByPlayer.set(r.playerId, byPlayer);
    }
    byPlayer.set(r.sessionId, (byPlayer.get(r.sessionId) ?? 0) + r.net);
  }

  const rows: MatrixRow[] = tablePlayers.map((p) => {
    const byPlayer = netBySessionByPlayer.get(p.playerId);
    const cells: Array<number | null> = columns.map((c) =>
      byPlayer?.has(c.sessionId) ? byPlayer.get(c.sessionId)! : null,
    );
    let total = 0;
    let gamesPlayed = 0;
    for (const cell of cells) {
      if (cell !== null) {
        total += cell;
        gamesPlayed += 1;
      }
    }
    return {
      playerId: p.playerId,
      name: p.name,
      status: statusForGamesPlayed(gamesPlayed),
      gamesPlayed,
      total,
      cells,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { columns, rows };
}

export interface PlayerStats {
  playerId: string;
  name: string;
  status: PlayerStatus;
  gamesPlayed: number;
  totalNet: number;
  avgNet: number;
  biggestWin: number;
  biggestLoss: number;
  profitableNights: number;
}

/**
 * Per-player summary stats for a table, including guests.
 * Sorted by total net (descending).
 */
export function computePlayerStats(
  players: Player[],
  results: Result[],
  tableId: string,
): PlayerStats[] {
  const tablePlayers = forTable(players, tableId);
  const tableResults = forTable(results, tableId);

  // Aggregate net per session per player (a player has at most one net/session).
  const netBySessionByPlayer = new Map<string, Map<string, number>>();
  for (const r of tableResults) {
    let byPlayer = netBySessionByPlayer.get(r.playerId);
    if (!byPlayer) {
      byPlayer = new Map();
      netBySessionByPlayer.set(r.playerId, byPlayer);
    }
    byPlayer.set(r.sessionId, (byPlayer.get(r.sessionId) ?? 0) + r.net);
  }

  const stats: PlayerStats[] = tablePlayers.map((p) => {
    const nets = [...(netBySessionByPlayer.get(p.playerId)?.values() ?? [])];
    const gamesPlayed = nets.length;
    const totalNet = nets.reduce((sum, n) => sum + n, 0);
    const biggestWin = nets.length ? Math.max(0, ...nets) : 0;
    const biggestLoss = nets.length ? Math.min(0, ...nets) : 0;
    const profitableNights = nets.filter((n) => n > 0).length;
    return {
      playerId: p.playerId,
      name: p.name,
      status: statusForGamesPlayed(gamesPlayed),
      gamesPlayed,
      totalNet,
      avgNet: gamesPlayed ? totalNet / gamesPlayed : 0,
      biggestWin,
      biggestLoss,
      profitableNights,
    };
  });

  stats.sort((a, b) => b.totalNet - a.totalNet || a.name.localeCompare(b.name));
  return stats;
}
