import type { NewResultInput } from './types';

/** Default tolerance for the zero-sum invariant (currency rounding slack). */
export const ZERO_SUM_EPSILON = 0.01;

export interface ZeroSumResult {
  ok: boolean;
  /** sum of all nets; should be ~0 */
  sum: number;
  /** how far off zero the sum is (absolute) */
  difference: number;
}

/**
 * Validate that a set of per-player net results sums to ~zero.
 * Buy-ins are returned to the bank, so the table is a closed system:
 * one player's win is another's loss.
 */
export function checkZeroSum(
  results: Array<Pick<NewResultInput, 'net'>>,
  epsilon: number = ZERO_SUM_EPSILON,
): ZeroSumResult {
  const sum = results.reduce((acc, r) => acc + (Number(r.net) || 0), 0);
  const difference = Math.abs(sum);
  return { ok: difference <= epsilon, sum, difference };
}

export interface SessionValidation extends ZeroSumResult {
  ok: boolean;
  errors: string[];
}

/** Full validation for a session before it is saved. */
export function validateSession(
  results: NewResultInput[],
  epsilon: number = ZERO_SUM_EPSILON,
): SessionValidation {
  const errors: string[] = [];

  if (results.length < 2) {
    errors.push('A session needs at least two players.');
  }

  const ids = results.map((r) => r.playerId);
  if (new Set(ids).size !== ids.length) {
    errors.push('A player appears more than once in this session.');
  }

  if (results.some((r) => Number.isNaN(Number(r.net)))) {
    errors.push('Every player must have a numeric result.');
  }

  const zero = checkZeroSum(results, epsilon);
  if (!zero.ok) {
    errors.push(
      `Results must balance to zero. They are off by ${zero.sum.toFixed(2)}.`,
    );
  }

  return { ...zero, ok: errors.length === 0, errors };
}
