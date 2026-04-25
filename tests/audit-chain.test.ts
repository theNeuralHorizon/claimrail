import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-audit-test-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-long-enough-for-hs256-sign-ok';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs, auditEvents } = await import('@/lib/db/schema');
const { appendAuditEvent, verifyAuditChain } = await import('@/lib/audit/chain');
const { eq } = await import('drizzle-orm');

beforeAll(async () => {
  await migrate();
});
afterAll(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch { /* ok */ }
});

describe('audit chain', () => {
  it('chains events and verifies intact', async () => {
    const orgId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'A', slug: `a-${nanoid(6)}` });
    for (let i = 0; i < 5; i += 1) {
      await appendAuditEvent({
        orgId,
        actorId: 'user-1',
        action: 'test.event',
        resource: 'widget',
        resourceId: `widget-${i}`,
        metadata: { index: i },
      });
    }
    const r = await verifyAuditChain(orgId);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(5);
  });

  it('detects tampered metadata', async () => {
    const orgId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'B', slug: `b-${nanoid(6)}` });
    for (let i = 0; i < 3; i += 1) {
      await appendAuditEvent({
        orgId,
        actorId: 'user-1',
        action: 'test.event',
        resource: 'widget',
        resourceId: `widget-${i}`,
        metadata: { index: i },
      });
    }
    // Tamper: mutate the middle row's metadata so its recorded row_hash is
    // now wrong.
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId));
    const victim = rows[1];
    await db
      .update(auditEvents)
      .set({ metadataJson: JSON.stringify({ index: 999 }) })
      .where(eq(auditEvents.id, victim.id))
      ;

    const r = await verifyAuditChain(orgId);
    expect(r.ok).toBe(false);
    expect(r.brokenAtIndex).toBe(1);
  });

  it('detects a deleted middle row', async () => {
    const orgId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'C', slug: `c-${nanoid(6)}` });
    for (let i = 0; i < 3; i += 1) {
      await appendAuditEvent({
        orgId,
        actorId: 'user-1',
        action: 'test.event',
        resource: 'widget',
        resourceId: `w-${i}`,
      });
    }
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId));
    await db.delete(auditEvents).where(eq(auditEvents.id, rows[1].id));

    const r = await verifyAuditChain(orgId);
    expect(r.ok).toBe(false);
  });
});
