/**
 * IDOR fuzz: build two orgs, each with its own vendors + claims, then try
 * every cross-tenant access path. Every one must return null / empty.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-idor-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs, vendors, slaTerms, claims, incidents, probes } = await import('@/lib/db/schema');
const { getVendorDetail, getAllClaims, getOrgVendors, getVendorOverviews } = await import('@/lib/queries');

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

async function seedOrg(slugPrefix: string): Promise<{ orgId: string; vendorId: string; claimId: string }> {
  const orgId = nanoid(16);
  const vendorId = nanoid(16);
  const claimId = nanoid(16);
  await db.insert(orgs).values({ id: orgId, name: slugPrefix, slug: `${slugPrefix}-${nanoid(6)}` }).run();
  await db
    .insert(vendors)
    .values({
      id: vendorId,
      orgId,
      name: `${slugPrefix} vendor`,
      monitorUrl: 'https://example.com',
      monthlySpendCents: 10_000,
    })
    .run();
  await db
    .insert(slaTerms)
    .values({ id: nanoid(16), vendorId, uptimeThresholdPct: 99.9, creditPct: 10, tierRank: 1 })
    .run();
  await db
    .insert(incidents)
    .values({
      id: nanoid(16),
      vendorId,
      startedAt: Math.floor(Date.now() / 1000) - 3600,
      endedAt: Math.floor(Date.now() / 1000) - 1800,
      durationSeconds: 1800,
      severity: 'major',
      source: 'auto',
      summary: 'test',
    })
    .run();
  await db
    .insert(probes)
    .values({
      id: nanoid(16),
      vendorId,
      checkedAt: Math.floor(Date.now() / 1000),
      status: 'up',
      httpStatus: 200,
      latencyMs: 100,
    })
    .run();
  await db
    .insert(claims)
    .values({
      id: claimId,
      vendorId,
      period: '2026-03',
      measuredUptimePct: 99.5,
      threshold: 99.9,
      creditPct: 10,
      spendCents: 10_000,
      estimatedCreditCents: 1_000,
      emailSubject: 's',
      emailBody: 'b',
      evidenceJson: '{}',
    })
    .run();
  return { orgId, vendorId, claimId };
}

describe('IDOR fuzz across orgs', () => {
  it('A cannot read B vendor detail, claims, or overviews', async () => {
    const A = await seedOrg('alpha');
    const B = await seedOrg('beta');

    // Cross-tenant vendor detail
    expect(await getVendorDetail(A.orgId, B.vendorId)).toBeNull();
    expect(await getVendorDetail(B.orgId, A.vendorId)).toBeNull();

    // Cross-tenant vendor listing
    const listA = await getOrgVendors(A.orgId);
    expect(listA.some((v) => v.id === B.vendorId)).toBe(false);

    // Cross-tenant claims
    const claimsA = await getAllClaims(A.orgId);
    expect(claimsA.some((c) => c.claim.id === B.claimId)).toBe(false);

    // Cross-tenant overviews
    const overviewsA = await getVendorOverviews(A.orgId);
    expect(overviewsA.every((o) => o.vendor.orgId === A.orgId)).toBe(true);
  });

  it('IDs from another tenant cannot be substituted with same-shape structure', async () => {
    const A = await seedOrg('gamma');
    const B = await seedOrg('delta');

    // Same-shape ID (16 chars) but from the other tenant.
    expect(await getVendorDetail(A.orgId, B.vendorId)).toBeNull();

    // Totally fake but well-shaped ID.
    expect(await getVendorDetail(A.orgId, nanoid(16))).toBeNull();
  });
});
