/**
 * Integration tests for the new auth flows. Uses a throw-away DB so we
 * exercise real drizzle inserts + token consumption + lockout math.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-auth-test-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { users } = await import('@/lib/db/schema');
const { hashPassword } = await import('@/lib/auth/password');
const { issueToken, consumeToken } = await import('@/lib/auth/tokens');
const {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  LOCK_THRESHOLD,
} = await import('@/lib/auth/lockout');
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

async function makeUser(): Promise<string> {
  const id = nanoid(16);
  const hash = await hashPassword('ClaimRail!2026-ok');
  await db
    .insert(users)
    .values({ id, email: `${id}@test.example`, name: 'Test User', passwordHash: hash })
    ;
  return id;
}

describe('verification tokens', () => {
  it('issues → consumes → marks used', async () => {
    const uid = await makeUser();
    const { rawToken } = await issueToken(uid, 'email_verify');
    const consumed = await consumeToken(rawToken, 'email_verify');
    expect(consumed?.userId).toBe(uid);
    // second consumption fails
    const again = await consumeToken(rawToken, 'email_verify');
    expect(again).toBeNull();
  });

  it('rejects a token used for the wrong purpose', async () => {
    const uid = await makeUser();
    const { rawToken } = await issueToken(uid, 'email_verify');
    const res = await consumeToken(rawToken, 'password_reset');
    expect(res).toBeNull();
  });

  it('issuing a new token invalidates the old one', async () => {
    const uid = await makeUser();
    const a = await issueToken(uid, 'password_reset');
    await issueToken(uid, 'password_reset');
    const res = await consumeToken(a.rawToken, 'password_reset');
    expect(res).toBeNull();
  });

  it('rejects unknown tokens', async () => {
    const res = await consumeToken('this-is-not-a-real-token-at-all', 'email_verify');
    expect(res).toBeNull();
  });
});

describe('lockout', () => {
  it('increments on failure and locks after threshold', async () => {
    const uid = await makeUser();
    for (let i = 0; i < LOCK_THRESHOLD; i += 1) {
      await recordFailedLogin(uid);
    }
    const u = await db.select().from(users).where(eq(users.id, uid)).then((r) => r[0]);
    expect(u?.failedLoginCount).toBe(LOCK_THRESHOLD);
    expect(isLocked(u!)).toBe(true);
  });

  it('successful login clears the counter', async () => {
    const uid = await makeUser();
    await recordFailedLogin(uid);
    await recordFailedLogin(uid);
    await recordSuccessfulLogin(uid);
    const u = await db.select().from(users).where(eq(users.id, uid)).then((r) => r[0]);
    expect(u?.failedLoginCount).toBe(0);
    expect(u?.lockedUntil).toBeNull();
  });
});
