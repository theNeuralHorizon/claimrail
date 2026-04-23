import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-recovery-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs, vendors, claims } = await import('@/lib/db/schema');
const { getMonthlyRecovery } = await import('@/lib/queries');

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

describe('getMonthlyRecovery', () => {
  it('buckets filed + recovered by period, pads zeros for empty months', async () => {
    const orgId = nanoid(16);
    const vendorId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'A', slug: `a-${nanoid(6)}` }).run();
    await db
      .insert(vendors)
      .values({
        id: vendorId,
        orgId,
        name: 'V',
        monitorUrl: 'https://example.com',
        monthlySpendCents: 100_000,
      })
      .run();

    // Pick three recent periods to load.
    const now = new Date();
    const mkPeriod = (offsetMonths: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonths, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const periodA = mkPeriod(0); // this month
    const periodB = mkPeriod(1); // last month
    // No data for mkPeriod(2) — must still show up with zeros.

    // One filed claim in periodA.
    await db
      .insert(claims)
      .values({
        id: nanoid(16),
        vendorId,
        period: periodA,
        measuredUptimePct: 99.0,
        threshold: 99.9,
        creditPct: 10,
        spendCents: 100_000,
        estimatedCreditCents: 10_000,
        status: 'filed',
        emailSubject: 's',
        emailBody: 'b',
        evidenceJson: '{}',
      })
      .run();

    // One recovered claim in periodB with actual money in.
    await db
      .insert(claims)
      .values({
        id: nanoid(16),
        vendorId,
        period: periodB,
        measuredUptimePct: 98.0,
        threshold: 99.9,
        creditPct: 25,
        spendCents: 100_000,
        estimatedCreditCents: 25_000,
        recoveredCents: 20_000,
        status: 'recovered',
        emailSubject: 's',
        emailBody: 'b',
        evidenceJson: '{}',
      })
      .run();

    // Draft-only claim in periodB — should NOT count toward filed.
    // Use a second vendor because (vendor_id, period) is unique.
    const vendor2Id = nanoid(16);
    await db
      .insert(vendors)
      .values({
        id: vendor2Id,
        orgId,
        name: 'V2',
        monitorUrl: 'https://example.com/2',
        monthlySpendCents: 50_000,
      })
      .run();
    await db
      .insert(claims)
      .values({
        id: nanoid(16),
        vendorId: vendor2Id,
        period: periodB,
        measuredUptimePct: 99.5,
        threshold: 99.9,
        creditPct: 10,
        spendCents: 50_000,
        estimatedCreditCents: 10_000,
        status: 'drafted',
        emailSubject: 's',
        emailBody: 'b',
        evidenceJson: '{}',
      })
      .run();

    const result = await getMonthlyRecovery(orgId, 6);
    expect(result).toHaveLength(6);
    const byPeriod = Object.fromEntries(result.map((r) => [r.period, r]));
    expect(byPeriod[periodA].filedCents).toBe(10_000);
    expect(byPeriod[periodA].recoveredCents).toBe(0);
    // periodB has one "recovered" claim — filed includes the recovered claim
    // too, because "filed" counts everything that was actually sent.
    expect(byPeriod[periodB].recoveredCents).toBe(20_000);
    expect(byPeriod[periodB].filedCents).toBeGreaterThanOrEqual(25_000);
  });

  it('returns all zeros for an org with no claims', async () => {
    const orgId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'Empty', slug: `empty-${nanoid(6)}` }).run();
    const result = await getMonthlyRecovery(orgId, 4);
    expect(result).toHaveLength(4);
    for (const r of result) {
      expect(r.filedCents).toBe(0);
      expect(r.recoveredCents).toBe(0);
      expect(r.count).toBe(0);
    }
  });
});
