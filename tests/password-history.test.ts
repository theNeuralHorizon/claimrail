import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-pwhist-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { users, passwordHistory } = await import('@/lib/db/schema');
const { hashPassword } = await import('@/lib/auth/password');
const { matchesPasswordHistory, pushPasswordHistory, PASSWORD_HISTORY_SIZE } =
  await import('@/lib/auth/password-history');
const { eq } = await import('drizzle-orm');

beforeAll(async () => {
  await migrate();
});
afterAll(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ok */
  }
});

describe('password history', () => {
  it('blocks reuse of the current password', async () => {
    const id = nanoid(16);
    const hash = await hashPassword('ClaimRail!2026-ok');
    await db
      .insert(users)
      .values({ id, email: `${id}@t.example`, name: 'T', passwordHash: hash })
      ;
    expect(await matchesPasswordHistory(id, 'ClaimRail!2026-ok', hash)).toBe(true);
    expect(await matchesPasswordHistory(id, 'DifferentPass!2026', hash)).toBe(false);
  });

  // bcrypt at cost 12 is ~300ms per op × many hashes + compares → generous
  // timeout. The test covers real cryptographic behavior; no mocks.
  it('blocks reuse of the last N passwords', { timeout: 60_000 }, async () => {
    const id = nanoid(16);
    const h0 = await hashPassword('ClaimRail!2026-ok');
    await db
      .insert(users)
      .values({ id, email: `${id}-b@t.example`, name: 'T', passwordHash: h0 })
      ;
    // Rotate through PASSWORD_HISTORY_SIZE + 2 passwords.
    const passwords = [
      'First!Pass-2026',
      'Second!Pass-2026',
      'Third!Pass-2026',
      'Fourth!Pass-2026',
      'Fifth!Pass-2026',
      'Sixth!Pass-2026',
      'Seventh!Pass-2026',
    ];
    let currentHash = h0;
    for (const p of passwords) {
      await pushPasswordHistory(id, currentHash);
      currentHash = await hashPassword(p);
      await db.update(users).set({ passwordHash: currentHash }).where(eq(users.id, id));
    }
    // The most-recent PASSWORD_HISTORY_SIZE passwords should be blocked.
    const recentBlocked = passwords.slice(-PASSWORD_HISTORY_SIZE);
    for (const p of recentBlocked) {
      expect(await matchesPasswordHistory(id, p, currentHash)).toBe(true);
    }
    // The very first password rolled out of the history and should now
    // be reusable again.
    expect(await matchesPasswordHistory(id, passwords[0], currentHash)).toBe(false);
  });

  it('prunes history down to HISTORY_SIZE entries', async () => {
    const id = nanoid(16);
    const h = await hashPassword('ClaimRail!2026-ok');
    await db
      .insert(users)
      .values({ id, email: `${id}-c@t.example`, name: 'T', passwordHash: h })
      ;
    for (let i = 0; i < 12; i += 1) {
      await pushPasswordHistory(id, h);
    }
    const rows = await db
      .select()
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, id))
      ;
    expect(rows.length).toBeLessThanOrEqual(PASSWORD_HISTORY_SIZE);
  });
});
