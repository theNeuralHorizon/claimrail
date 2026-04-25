import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-invite-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs, users, memberships } = await import('@/lib/db/schema');
const { hashPassword } = await import('@/lib/auth/password');
const {
  issueInvitation,
  resolveInvitation,
  consumeInvitation,
  revokeInvitation,
  tryAttachExistingUser,
} = await import('@/lib/auth/invitations');
const { eq, and } = await import('drizzle-orm');

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

async function seedOrgOwner() {
  const orgId = nanoid(16);
  const ownerId = nanoid(16);
  await db.insert(orgs).values({ id: orgId, name: 'Acme', slug: `acme-${nanoid(6)}` });
  const hash = await hashPassword('ClaimRail!2026-ok');
  await db
    .insert(users)
    .values({ id: ownerId, email: `owner-${ownerId}@t.example`, name: 'Owner', passwordHash: hash })
    ;
  await db
    .insert(memberships)
    .values({ id: nanoid(16), userId: ownerId, orgId, role: 'owner' })
    ;
  return { orgId, ownerId };
}

describe('invitations', () => {
  it('issues + resolves', async () => {
    const { orgId, ownerId } = await seedOrgOwner();
    const issued = await issueInvitation({
      orgId,
      email: 'teammate@t.example',
      role: 'member',
      invitedBy: ownerId,
    });
    expect(issued.rawToken.length).toBeGreaterThan(30);
    const resolved = await resolveInvitation(issued.rawToken);
    expect(resolved?.orgId).toBe(orgId);
    expect(resolved?.email).toBe('teammate@t.example');
    expect(resolved?.role).toBe('member');
  });

  it('returns null after consume', async () => {
    const { orgId, ownerId } = await seedOrgOwner();
    const issued = await issueInvitation({
      orgId,
      email: 'foo@t.example',
      role: 'member',
      invitedBy: ownerId,
    });
    expect(await consumeInvitation(issued.id)).toBe(true);
    // Second consume returns false (already accepted).
    expect(await consumeInvitation(issued.id)).toBe(false);
    expect(await resolveInvitation(issued.rawToken)).toBeNull();
  });

  it('revoke blocks resolution', async () => {
    const { orgId, ownerId } = await seedOrgOwner();
    const issued = await issueInvitation({
      orgId,
      email: 'foo@t.example',
      role: 'member',
      invitedBy: ownerId,
    });
    expect(await revokeInvitation(orgId, issued.id)).toBe(true);
    expect(await resolveInvitation(issued.rawToken)).toBeNull();
  });

  it('revoke is idempotent + cross-tenant safe', async () => {
    const a = await seedOrgOwner();
    const b = await seedOrgOwner();
    const issued = await issueInvitation({
      orgId: a.orgId,
      email: 'x@t.example',
      role: 'member',
      invitedBy: a.ownerId,
    });
    // B can't revoke A's invite.
    expect(await revokeInvitation(b.orgId, issued.id)).toBe(false);
    expect(await revokeInvitation(a.orgId, issued.id)).toBe(true);
    // Second revoke is a no-op.
    expect(await revokeInvitation(a.orgId, issued.id)).toBe(false);
  });

  it('tryAttachExistingUser adds membership when user exists', async () => {
    const { orgId, ownerId } = await seedOrgOwner();
    const inviteeId = nanoid(16);
    // Lower-case because nanoid's alphabet is mixed-case and we store
    // invitation emails lower-cased — otherwise the lookup misses.
    const email = `invitee-${inviteeId}@t.example`.toLowerCase();
    const hash = await hashPassword('ClaimRail!2026-ok');
    await db
      .insert(users)
      .values({ id: inviteeId, email, name: 'Invitee', passwordHash: hash })
      ;
    const issued = await issueInvitation({ orgId, email, role: 'admin', invitedBy: ownerId });
    const resolved = await resolveInvitation(issued.rawToken);
    expect(resolved).not.toBeNull();
    const result = await tryAttachExistingUser(resolved!);
    expect(result.attached).toBe(true);
    const mem = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, inviteeId), eq(memberships.orgId, orgId)))
      .then((r) => r[0]);
    expect(mem?.role).toBe('admin');
    // Invite is consumed.
    expect(await resolveInvitation(issued.rawToken)).toBeNull();
  });

  it('tryAttachExistingUser returns attached:false when user does not exist', async () => {
    const { orgId, ownerId } = await seedOrgOwner();
    const issued = await issueInvitation({
      orgId,
      email: 'ghost@t.example',
      role: 'member',
      invitedBy: ownerId,
    });
    const resolved = await resolveInvitation(issued.rawToken);
    const result = await tryAttachExistingUser(resolved!);
    expect(result.attached).toBe(false);
    // Invite is NOT consumed — the caller will complete signup first.
    expect(await resolveInvitation(issued.rawToken)).not.toBeNull();
  });
});
