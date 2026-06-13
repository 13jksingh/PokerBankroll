import { describe, it, expect } from 'vitest';
import {
  computeStandings,
  buildSessionDetails,
  statusForGamesPlayed,
  gamesPlayedFor,
  MEMBER_PROMOTION_THRESHOLD,
} from './standings';
import type { Player, Result, Session } from './types';

const T = 't_1';
const OTHER = 't_2';

function player(playerId: string, name: string, tableId = T): Player {
  return { tableId, playerId, name, status: 'guest', createdAt: '2026-01-01' };
}

function session(sessionId: string, date: string, tableId = T): Session {
  return {
    tableId,
    sessionId,
    date,
    location: '',
    notes: '',
    createdAt: date,
  };
}

function result(
  sessionId: string,
  playerId: string,
  net: number,
  tableId = T,
): Result {
  return { tableId, sessionId, playerId, net };
}

describe('statusForGamesPlayed', () => {
  it('is guest below the threshold', () => {
    expect(statusForGamesPlayed(MEMBER_PROMOTION_THRESHOLD - 1)).toBe('guest');
  });
  it('is member at or above the threshold', () => {
    expect(statusForGamesPlayed(MEMBER_PROMOTION_THRESHOLD)).toBe('member');
    expect(statusForGamesPlayed(MEMBER_PROMOTION_THRESHOLD + 3)).toBe('member');
  });
});

describe('computeStandings', () => {
  const players = [player('a', 'Ann'), player('b', 'Bob'), player('c', 'Cy')];
  const results = [
    result('s1', 'a', 100),
    result('s1', 'b', -100),
    result('s2', 'a', -40),
    result('s2', 'c', 40),
  ];

  it('sums cumulative net and counts distinct sessions', () => {
    const s = computeStandings(players, results, T);
    const ann = s.find((x) => x.playerId === 'a')!;
    expect(ann.cumulativeNet).toBe(60);
    expect(ann.gamesPlayed).toBe(2);
  });

  it('sorts by cumulative net descending', () => {
    const s = computeStandings(players, results, T);
    expect(s.map((x) => x.playerId)).toEqual(['a', 'c', 'b']);
  });

  it('promotes a guest to member at 5 games', () => {
    const ps = [player('a', 'Ann')];
    const rs: Result[] = [];
    for (let i = 1; i <= MEMBER_PROMOTION_THRESHOLD; i++) {
      rs.push(result(`s${i}`, 'a', 0));
    }
    const s = computeStandings(ps, rs, T);
    expect(s[0].gamesPlayed).toBe(MEMBER_PROMOTION_THRESHOLD);
    expect(s[0].status).toBe('member');
  });

  it('ignores rows from other tables', () => {
    const mixed = [...results, result('x', 'a', 999, OTHER)];
    const s = computeStandings(players, mixed, T);
    expect(s.find((x) => x.playerId === 'a')!.cumulativeNet).toBe(60);
  });

  it('includes players with no results at zero', () => {
    const s = computeStandings([player('z', 'Zed')], [], T);
    expect(s[0]).toMatchObject({ cumulativeNet: 0, gamesPlayed: 0, status: 'guest' });
  });
});

describe('buildSessionDetails', () => {
  const players = [player('a', 'Ann'), player('b', 'Bob')];
  const sessions = [session('s1', '2026-01-05'), session('s2', '2026-02-10')];
  const results = [
    result('s1', 'a', 50),
    result('s1', 'b', -50),
    result('s2', 'a', -20),
    result('s2', 'b', 20),
  ];

  it('returns sessions most recent first with joined names', () => {
    const d = buildSessionDetails(players, sessions, results, T);
    expect(d.map((x) => x.sessionId)).toEqual(['s2', 's1']);
    expect(d[0].entries[0].name).toBeDefined();
    expect(d[0].playerCount).toBe(2);
  });

  it('sorts entries by net descending', () => {
    const d = buildSessionDetails(players, sessions, results, T);
    const s1 = d.find((x) => x.sessionId === 's1')!;
    expect(s1.entries[0].net).toBeGreaterThan(s1.entries[1].net);
  });
});

describe('gamesPlayedFor', () => {
  it('counts distinct sessions for a player in a table', () => {
    const results = [
      result('s1', 'a', 10),
      result('s2', 'a', -10),
      result('s1', 'a', 0), // duplicate session should not double count
    ];
    expect(gamesPlayedFor(results, T, 'a')).toBe(2);
  });
});
