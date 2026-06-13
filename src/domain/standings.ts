import type {
  Bootstrap,
  Player,
  PlayerStatus,
  Result,
  Session,
  SessionDetail,
  Standing,
} from './types';

/** A guest becomes a member after playing this many sessions. */
export const MEMBER_PROMOTION_THRESHOLD = 5;

export function statusForGamesPlayed(gamesPlayed: number): PlayerStatus {
  return gamesPlayed >= MEMBER_PROMOTION_THRESHOLD ? 'member' : 'guest';
}

function forTable<T extends { tableId: string }>(rows: T[], tableId: string): T[] {
  return rows.filter((r) => r.tableId === tableId);
}

/**
 * Compute standings for a single table.
 * - cumulativeNet: sum of a player's nets across all that table's sessions
 * - gamesPlayed: number of distinct sessions the player appears in
 * - status: derived from gamesPlayed (>= threshold => member)
 * Sorted by cumulativeNet descending.
 */
export function computeStandings(
  players: Player[],
  results: Result[],
  tableId: string,
): Standing[] {
  const tablePlayers = forTable(players, tableId);
  const tableResults = forTable(results, tableId);

  const netByPlayer = new Map<string, number>();
  const sessionsByPlayer = new Map<string, Set<string>>();

  for (const r of tableResults) {
    netByPlayer.set(r.playerId, (netByPlayer.get(r.playerId) ?? 0) + r.net);
    if (!sessionsByPlayer.has(r.playerId)) {
      sessionsByPlayer.set(r.playerId, new Set());
    }
    sessionsByPlayer.get(r.playerId)!.add(r.sessionId);
  }

  const standings: Standing[] = tablePlayers.map((p) => {
    const gamesPlayed = sessionsByPlayer.get(p.playerId)?.size ?? 0;
    return {
      playerId: p.playerId,
      name: p.name,
      status: statusForGamesPlayed(gamesPlayed),
      gamesPlayed,
      cumulativeNet: netByPlayer.get(p.playerId) ?? 0,
    };
  });

  standings.sort(
    (a, b) =>
      b.cumulativeNet - a.cumulativeNet || a.name.localeCompare(b.name),
  );
  return standings;
}

/** Build session detail rows (most recent first) for a table. */
export function buildSessionDetails(
  players: Player[],
  sessions: Session[],
  results: Result[],
  tableId: string,
): SessionDetail[] {
  const nameById = new Map(
    forTable(players, tableId).map((p) => [p.playerId, p.name]),
  );
  const resultsBySession = new Map<string, Result[]>();
  for (const r of forTable(results, tableId)) {
    if (!resultsBySession.has(r.sessionId)) {
      resultsBySession.set(r.sessionId, []);
    }
    resultsBySession.get(r.sessionId)!.push(r);
  }

  const details = forTable(sessions, tableId).map((s) => {
    const entries = (resultsBySession.get(s.sessionId) ?? []).map((r) => ({
      playerId: r.playerId,
      name: nameById.get(r.playerId) ?? r.playerId,
      net: r.net,
    }));
    entries.sort((a, b) => b.net - a.net);
    return { ...s, entries, playerCount: entries.length };
  });

  details.sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() ||
      b.createdAt.localeCompare(a.createdAt),
  );
  return details;
}

/** Number of distinct sessions a player has played in a table. */
export function gamesPlayedFor(
  results: Result[],
  tableId: string,
  playerId: string,
): number {
  const sessions = new Set(
    forTable(results, tableId)
      .filter((r) => r.playerId === playerId)
      .map((r) => r.sessionId),
  );
  return sessions.size;
}

/** Convenience: derive standings + session details from a bootstrap payload. */
export function deriveTableView(data: Bootstrap, tableId: string) {
  return {
    standings: computeStandings(data.players, data.results, tableId),
    sessions: buildSessionDetails(
      data.players,
      data.sessions,
      data.results,
      tableId,
    ),
  };
}
