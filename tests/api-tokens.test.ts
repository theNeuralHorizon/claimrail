import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-api-tok-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs, users } = await import('@/lib/db/schema');
const { hashPassword } = await import('@/lib/auth/password');
const { issueApiToken, resolveApiToken, revokeApiToken, API_TOKEN_PREFIX } =
  await import('@/lib/auth/api-tokens');

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

async function seedOrgUser() {
  const orgId = nanoid(16);
  const userId = nanoid(16);
  await db.insert(orgs).values({ id: orgId, name: 'Acme', slug: `acme-${nanoid(6)}` }).run();
  const hash = await hashPassword('ClaimRail!2026-ok');
  await db
    .insert(users)
    .values({ id: userId, email: `${userId}@t.example`, name: 'T', passwordHash: hash })
    .run();
  return { orgId, userId };
}

describe('api tokens', () => {
  it('issues with a prefix and resolves back to the issuing org', async () => {
    const { orgId, userId } = await seedOrgUser();
    const issued = await issueApiToken({
      orgId,
      createdBy: userId,
      name: 'CI',
      scope: 'read',
    });
    expect(issued.rawToken.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(issued.prefix).toBe(issued.rawToken.slice(0, 12));

    const resolved = await resolveApiToken(issued.rawToken);
    expect(resolved?.orgId).toBe(orgId);
    expect(resolved?.scope).toBe('read');
  });

  it('rejects unknown tokens', async () => {
    expect(await resolveApiToken('crt_' + 'x'.repeat(30))).toBeNull();
    expect(await resolveApiToken('nope_' + 'x'.repeat(30))).toBeNull();
  });

  it('revoked tokens fail to resolve', async () => {
    const { orgId, userId } = await seedOrgUser();
    const issued = await issueApiToken({
      orgId,
      createdBy: userId,
      name: 'CI2',
      scope: 'write',
    });
    expect(await resolveApiToken(issued.rawToken)).not.toBeNull();
    expect(await revokeApiToken(orgId, issued.id)).toBe(true);
    expect(await resolveApiToken(issued.rawToken)).toBeNull();
  });

  it('revoke is idempotent (second call returns false)', async () => {
    const { orgId, userId } = await seedOrgUser();
    const issued = await issueApiToken({
      orgId,
      createdBy: userId,
      name: 'x',
      scope: 'read',
    });
    expect(await revokeApiToken(orgId, issued.id)).toBe(true);
    expect(await revokeApiToken(orgId, issued.id)).toBe(false);
  });

  it('cross-tenant revoke is a no-op', async () => {
    const a = await seedOrgUser();
    const b = await seedOrgUser();
    const issued = await issueApiToken({
      orgId: a.orgId,
      createdBy: a.userId,
      name: 'x',
      scope: 'read',
    });
    // B tries to revoke A's token — should fail.
    expect(await revokeApiToken(b.orgId, issued.id)).toBe(false);
    // A's token still works.
    expect(await resolveApiToken(issued.rawToken)).not.toBeNull();
  });
});
