/**
 * Integration test for the probe reconciler. Uses a throw-away in-memory DB
 * file so we can exercise real drizzle inserts + reconcileIncidents end-to-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-test-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-long-enough-for-hs256-sign-ok';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { vendors, probes, orgs, incidents } = await import('@/lib/db/schema');
const { reconcileIncidents } = await import('@/lib/probes/engine');
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

describe('reconcileIncidents', () => {
  it('creates incident rows from a stream of down probes', async () => {
    const orgId = nanoid(16);
    const vendorId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'T', slug: `t-${nanoid(6)}` }).run();
    await db
      .insert(vendors)
      .values({ id: vendorId, orgId, name: 'V', monitorUrl: 'https://x', monthlySpendCents: 10000 })
      .run();

    const now = Math.floor(Date.now() / 1000);
    // Insert 5 consecutive down probes within last hour
    for (let i = 0; i < 5; i++) {
      await db
        .insert(probes)
        .values({
          id: nanoid(16),
          vendorId,
          checkedAt: now - i * 60,
          status: 'down',
          httpStatus: 503,
          latencyMs: null,
          errorMessage: 'boom',
        })
        .run();
    }
    // Plus an up probe just after
    await db
      .insert(probes)
      .values({
        id: nanoid(16),
        vendorId,
        checkedAt: now + 60,
        status: 'up',
        httpStatus: 200,
        latencyMs: 150,
        errorMessage: null,
      })
      .run();

    const newCount = await reconcileIncidents(vendorId);
    expect(newCount).toBe(1);

    const rows = await db.select().from(incidents).where(eq(incidents.vendorId, vendorId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('auto');
    expect(rows[0].durationSeconds).toBeGreaterThan(0);
  });

  it('is idempotent — running twice does not duplicate', async () => {
    const orgId = nanoid(16);
    const vendorId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'T2', slug: `t2-${nanoid(6)}` }).run();
    await db
      .insert(vendors)
      .values({ id: vendorId, orgId, name: 'V2', monitorUrl: 'https://x', monthlySpendCents: 1 })
      .run();
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 3; i++) {
      await db
        .insert(probes)
        .values({
          id: nanoid(16),
          vendorId,
          checkedAt: now - i * 60,
          status: 'down',
          httpStatus: 503,
          latencyMs: null,
          errorMessage: null,
        })
        .run();
    }

    await reconcileIncidents(vendorId);
    await reconcileIncidents(vendorId);
    const rows = await db.select().from(incidents).where(eq(incidents.vendorId, vendorId)).all();
    expect(rows).toHaveLength(1);
  });
});
