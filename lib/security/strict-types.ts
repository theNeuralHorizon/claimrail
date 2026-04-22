/**
 * Strict Zod schemas + arithmetic validators for numbers that end up in
 * money / percentage calculations.
 *
 * Why: the core SLA engine multiplies spend × credit% to compute dollar
 * amounts. A `NaN`, `Infinity`, or negative slipped through at the API
 * boundary would propagate silently through `Math.round(a * b / 100)`
 * and produce garbage rows in the DB. Every money/percentage field on
 * every write path must pass through here.
 */

import { z } from 'zod';

// Keep us well below Number.MAX_SAFE_INTEGER (2^53-1). $1 trillion in
// cents is 10^14 which still fits; the cap below is ~$100 trillion.
const MAX_CENTS = 10_000_000_000_000;

export const moneyCents = z
  .number()
  .int('Must be a whole number of cents')
  .finite('Must be a finite number')
  .min(0, 'Must be zero or positive')
  .max(MAX_CENTS, `Must be ≤ ${MAX_CENTS}`);

export const percentage = z
  .number()
  .finite('Must be finite')
  .min(0, 'Must be ≥ 0')
  .max(100, 'Must be ≤ 100');

/**
 * Uptime threshold — identical to percentage but with a sane lower bound
 * so nobody configures a 0.001% SLA by accident.
 */
export const uptimeThresholdPct = z
  .number()
  .finite()
  .min(50, 'Threshold must be realistic (≥50%)')
  .max(100, 'Threshold ≤ 100%');

export const creditPct = z
  .number()
  .finite()
  .gt(0, 'Credit % must be > 0')
  .max(100, 'Credit % ≤ 100');

/**
 * Defensive arithmetic — the SLA engine calls these to force early errors
 * instead of producing silent NaN in downstream DB rows.
 */
export function assertFiniteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} is not finite`);
  }
  if (value < 0) {
    throw new Error(`${name} is negative`);
  }
  return value;
}
