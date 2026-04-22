/**
 * TOTP replay defense.
 *
 * Each successful TOTP verify pins the accepted `step` (the 30s window).
 * Subsequent login attempts within that step (or the drift-adjacent steps)
 * are rejected as replay.
 *
 * Without this, an attacker who shoulder-surfs or phishes a single 6-digit
 * code has up to ~90s to reuse it. With this, the code is good for one
 * successful login only.
 *
 * Storage: (user_id, step) unique index + periodic cleanup. We only care
 * about nonces newer than 3 steps ago, so old rows are pruned.
 */
import { db } from '@/lib/db/client';
import { totpReplayNonces } from '@/lib/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function pinTotpStep(userId: string, step: number): Promise<boolean> {
  try {
    await db
      .insert(totpReplayNonces)
      .values({ id: nanoid(16), userId, step })
      .run();
    // Housekeeping: drop anything older than ±5 steps ago to keep the
    // table small. Doing this inline is cheap because the index is on
    // (user_id, step).
    await db
      .delete(totpReplayNonces)
      .where(
        and(
          eq(totpReplayNonces.userId, userId),
          lt(totpReplayNonces.step, step - 5),
        ),
      )
      .run();
    return true;
  } catch {
    // Unique-constraint violation means this step was already accepted
    // for this user — i.e. the code is being replayed.
    return false;
  }
}

/**
 * Pick the step we should pin for a given TOTP code at a given wall-clock
 * time. Uses the same ±1 drift window as verifyTotp. Returns null if the
 * code doesn't match any acceptable step.
 */
export function stepForCode(
  secretB32: string,
  code: string,
  verifyAtStep: (secret: string, code: string, step: number) => boolean,
  now = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    if (verifyAtStep(secretB32, code, counter + delta)) {
      return counter + delta;
    }
  }
  return null;
}
