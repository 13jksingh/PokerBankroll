import { describe, it, expect } from 'vitest';
import {
  checkZeroSum,
  validateSession,
  ZERO_SUM_EPSILON,
} from './validation';

describe('checkZeroSum', () => {
  it('passes when nets sum to exactly zero', () => {
    const r = checkZeroSum([{ net: 100 }, { net: -60 }, { net: -40 }]);
    expect(r.ok).toBe(true);
    expect(r.sum).toBe(0);
    expect(r.difference).toBe(0);
  });

  it('passes within the default epsilon tolerance', () => {
    const r = checkZeroSum([{ net: 0.005 }, { net: 0 }]);
    expect(r.ok).toBe(true);
    expect(r.difference).toBeLessThanOrEqual(ZERO_SUM_EPSILON);
  });

  it('fails when nets do not balance', () => {
    const r = checkZeroSum([{ net: 100 }, { net: -50 }]);
    expect(r.ok).toBe(false);
    expect(r.sum).toBe(50);
    expect(r.difference).toBe(50);
  });

  it('treats non-numeric nets as zero contribution', () => {
    const r = checkZeroSum([{ net: 10 }, { net: -10 }, { net: NaN }]);
    expect(r.ok).toBe(true);
  });
});

describe('validateSession', () => {
  it('accepts a balanced two-player session', () => {
    const v = validateSession([
      { playerId: 'a', net: 25 },
      { playerId: 'b', net: -25 },
    ]);
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it('rejects a session with fewer than two players', () => {
    const v = validateSession([{ playerId: 'a', net: 0 }]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/at least two/i);
  });

  it('rejects duplicate players', () => {
    const v = validateSession([
      { playerId: 'a', net: 10 },
      { playerId: 'a', net: -10 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/more than once/i);
  });

  it('rejects an unbalanced session and reports the difference', () => {
    const v = validateSession([
      { playerId: 'a', net: 30 },
      { playerId: 'b', net: -20 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/balance to zero/i);
    expect(v.errors.join(' ')).toMatch(/10\.00/);
  });
});
