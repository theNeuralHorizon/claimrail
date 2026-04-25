/**
 * Password history — prevents reuse of the last N passwords.
 *
 * We store only bcrypt hashes (same format as the current password_hash on
 * the user row). On a change/reset, bcrypt-compare the candidate against
 * every history entry. Match → reject.
 *
 * Trade-off: compare is linear in N entries, but N is tiny (5) so it's
 * cheap enough. Real systems sometimes use a bloom filter — overkill here.
 */
import { db } from '@/lib/db/client';
import { passwordHistory } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { verifyPassword } from './password';

const HISTORY_SIZE = 5;

/**
 * True if the candidate password matches any of the last N hashes
 * (including the user's *current* password_hash, which the caller should
 * pass in so we don't accept "same as current" either).
 */
export async function matchesPasswordHistory(
  userId: string,
  candidate: string,
  currentHash: string,
): Promise<boolean> {
  if (await verifyPassword(candidate, currentHash)) return true;
  const rows = await db
    .select({ hash: passwordHistory.passwordHash })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    .orderBy(desc(passwordHistory.createdAt))
    .limit(HISTORY_SIZE)
    ;
  for (const r of rows) {
    if (await verifyPassword(candidate, r.hash)) return true;
  }
  return false;
}

export async function pushPasswordHistory(
  userId: string,
  previousHash: string,
): Promise<void> {
  await db
    .insert(passwordHistory)
    .values({
      id: nanoid(16),
      userId,
      passwordHash: previousHash,
      // Override the seconds-precision DEFAULT so rapid pushes (the
      // password-history test rotates 7 entries inside one bcrypt-bounded
      // window) get strictly increasing values. Postgres has no implicit
      // rowid-style tiebreaker; without ms-precision here the LIMIT-N
      // prune below would have non-deterministic ordering on ties.
      createdAt: Date.now(),
    })
    ;
  // Prune anything past the latest HISTORY_SIZE entries. We do it lazily
  // on write so the table doesn't grow unbounded.
  const keep = await db
    .select({ id: passwordHistory.id })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    .orderBy(desc(passwordHistory.createdAt))
    .limit(HISTORY_SIZE)
    ;
  const keepIds = new Set(keep.map((r) => r.id));
  const all = await db
    .select({ id: passwordHistory.id })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    ;
  for (const row of all) {
    if (!keepIds.has(row.id)) {
      await db.delete(passwordHistory).where(eq(passwordHistory.id, row.id));
    }
  }
}

export { HISTORY_SIZE as PASSWORD_HISTORY_SIZE };
