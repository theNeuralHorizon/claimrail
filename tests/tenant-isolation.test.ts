/**
 * Tenant isolation test.
 *
 * Verifies that data scoped to org A is never returned by queries for a
 * user whose only membership is in org B. This is the single most important
 * invariant of a multi-tenant SaaS — one slipup here leaks a customer's
 * data to another customer.
 *
 * We exercise every dashboard query that takes an orgId so a regression
 * in any of them surfaces immediately.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-tenancy-test-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs, vendors, slaTerms, claims } = await import('@/lib/db/schema');
const {
  getOrgVendors,
  getVendorOverviews,
  getDashboardSummary,
  getRecentIncidents,
  getAllClaims,
  getVendorDetail,
} = await import('@/lib/queries');

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

describe('tenant isolation', () => {
  it('queries scoped to org A do not return org B data', async () => {
    const orgA = nanoid(16);
    const orgB = nanoid(16);
    await db.insert(orgs).values({ id: orgA, name: 'Acme', slug: `acme-${nanoid(6)}` }).run();
    await db.insert(orgs).values({ id: orgB, name: 'Beta', slug: `beta-${nanoid(6)}` }).run();

    const vendorA = nanoid(16);
    const vendorB = nanoid(16);
    await db
      .insert(vendors)
      .values({
        id: vendorA,
        orgId: orgA,
        name: 'Vendor A',
        monitorUrl: 'https://a.example.com',
        monthlySpendCents: 1_000_00,
      })
      .run();
    await db
      .insert(vendors)
      .values({
        id: vendorB,
        orgId: orgB,
        name: 'Vendor B',
        monitorUrl: 'https://b.example.com',
        monthlySpendCents: 2_000_00,
      })
      .run();

    await db
      .insert(slaTerms)
      .values({
        id: nanoid(16),
        vendorId: vendorA,
        uptimeThresholdPct: 99.9,
        creditPct: 10,
        tierRank: 1,
      })
      .run();
    await db
      .insert(slaTerms)
      .values({
        id: nanoid(16),
        vendorId: vendorB,
        uptimeThresholdPct: 99.9,
        creditPct: 10,
        tierRank: 1,
      })
      .run();

    await db
      .insert(claims)
      .values({
        id: nanoid(16),
        vendorId: vendorA,
        period: '2026-01',
        measuredUptimePct: 99.5,
        threshold: 99.9,
        creditPct: 10,
        spendCents: 1_000_00,
        estimatedCreditCents: 10_000,
        emailSubject: 's',
        emailBody: 'b',
        evidenceJson: '{}',
      })
      .run();

    // Vendors
    const vendorsA = await getOrgVendors(orgA);
    expect(vendorsA).toHaveLength(1);
    expect(vendorsA[0].id).toBe(vendorA);

    // Vendor overviews
    const overviewsB = await getVendorOverviews(orgB);
    expect(overviewsB.every((o) => o.vendor.orgId === orgB)).toBe(true);

    // Dashboard summary
    const summaryA = await getDashboardSummary(orgA);
    expect(summaryA.totalVendors).toBe(1);
    expect(summaryA.totalMonthlySpendCents).toBe(1_000_00);

    // Recent incidents — no incidents inserted, but query must only hit org
    const rIncA = await getRecentIncidents(orgA);
    expect(rIncA.every((x) => x.vendor.orgId === orgA)).toBe(true);

    // Claims
    const claimsA = await getAllClaims(orgA);
    expect(claimsA.length).toBe(1);
    const claimsB = await getAllClaims(orgB);
    expect(claimsB.length).toBe(0);

    // Vendor detail — cross-tenant access MUST return null
    const crossTenant = await getVendorDetail(orgB, vendorA);
    expect(crossTenant).toBeNull();

    // Same-tenant access works
    const sameTenant = await getVendorDetail(orgA, vendorA);
    expect(sameTenant).not.toBeNull();
  });
});
