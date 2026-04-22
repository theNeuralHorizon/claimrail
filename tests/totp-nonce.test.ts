/**
 * TOTP replay defense.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-totp-nonce-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { users } = await import('@/lib/db/schema');
const { hashPassword } = await import('@/lib/auth/password');
const { pinTotpStep, stepForCode } = await import('@/lib/auth/totp-nonce');
const { generateTotpSecret, currentTotp, verifyTotpAtStep } = await import('@/lib/security/crypto');

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

async function makeUser() {
  const id = nanoid(16);
  const hash = await hashPassword('ClaimRail!2026-ok');
  await db
    .insert(users)
    .values({ id, email: `${id}@t.example`, name: 'T', passwordHash: hash })
    .run();
  return id;
}

describe('TOTP replay nonce', () => {
  it('first use pins the step, second use rejects', async () => {
    const uid = await makeUser();
    const step = Math.floor(Date.now() / 1000 / 30);
    expect(await pinTotpStep(uid, step)).toBe(true);
    expect(await pinTotpStep(uid, step)).toBe(false);
  });

  it('stepForCode finds the correct step within drift window', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = currentTotp(secret, now);
    const step = stepForCode(secret, code, verifyTotpAtStep, now);
    expect(step).toBe(Math.floor(now / 1000 / 30));
  });

  it('stepForCode returns null for a bogus code', () => {
    const secret = generateTotpSecret();
    expect(stepForCode(secret, '000000', verifyTotpAtStep)).toBeNull();
    expect(stepForCode(secret, 'abcdef', verifyTotpAtStep)).toBeNull();
  });

  it('two different users can use the same step independently', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const step = Math.floor(Date.now() / 1000 / 30) + 123;
    expect(await pinTotpStep(a, step)).toBe(true);
    expect(await pinTotpStep(b, step)).toBe(true);
  });
});
