/**
 * Per-account lockout — complements the per-IP + per-email rate limit.
 *
 * Difference from rate limit: rate limit blocks the *requester*, lockout
 * blocks the *account*. A rotating botnet can defeat rate-limit (each IP
 * tries once), but lockout stops them at the target because they all hit
 * the same account.
 *
 * Policy:
 *   - Every failed password attempt increments `failed_login_count`.
 *   - Hitting LOCK_THRESHOLD locks the account for LOCK_MINUTES.
 *   - Each additional failure *during* lockout extends it exponentially
 *     (capped). Counter is not cleared until a successful login.
 *   - Successful login zeroes the counter and clears locked_until.
 *
 * We intentionally return the *same* generic error whether the reason is
 * wrong password or locked account — no enumeration benefit for the attacker.
 */
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const LOCK_THRESHOLD = 5;
const BASE_LOCK_SECONDS = 60 * 5; // 5 min
const MAX_LOCK_SECONDS = 60 * 60; // 1 h

export function isLocked(user: {
  lockedUntil: number | null;
}): boolean {
  const now = Math.floor(Date.now() / 1000);
  return user.lockedUntil != null && user.lockedUntil > now;
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Read current count to decide on lock.
  const u = await db
    .select({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil })
    .from(users)
    .where(eq(users.id, userId))
    .then((r) => r[0]);
  if (!u) return;
  const nextCount = (u.failedLoginCount ?? 0) + 1;
  let lockedUntil: number | null = u.lockedUntil ?? null;
  if (nextCount >= LOCK_THRESHOLD) {
    // Exponential backoff per additional failure past threshold.
    const extra = nextCount - LOCK_THRESHOLD;
    const seconds = Math.min(BASE_LOCK_SECONDS * 2 ** extra, MAX_LOCK_SECONDS);
    lockedUntil = now + seconds;
  }
  await db
    .update(users)
    .set({ failedLoginCount: nextCount, lockedUntil })
    .where(eq(users.id, userId))
    ;
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, userId))
    ;
}

export { LOCK_THRESHOLD, BASE_LOCK_SECONDS, MAX_LOCK_SECONDS };
