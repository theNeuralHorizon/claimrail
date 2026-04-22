/**
 * Seed script — creates a realistic demo tenant so `/dashboard` is populated
 * on first boot. Run with `npm run db:seed` (idempotent: clears then recreates).
 */
import { db, libsql } from './client';
import { migrate } from './migrate';
import {
  orgs,
  users,
  memberships,
  vendors,
  slaTerms,
  probes,
  incidents,
  claims,
} from './schema';
import { hashPassword } from '@/lib/auth/password';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { consolidateIncidents, currentPeriod, computeUptimeReport, detectBreach } from '@/lib/sla/engine';
import { generateClaim } from '@/lib/claims/generator';

interface VendorSeed {
  name: string;
  monitorUrl: string;
  monthlySpendCents: number;
  contactEmail: string;
  notes: string;
  tiers: Array<{ uptimeThresholdPct: number; creditPct: number; sourceExcerpt: string }>;
  simulatedOutages: Array<[number, number]>;
}

const VENDOR_SEEDS: VendorSeed[] = [
  {
    name: 'Relayloop (email API)',
    monitorUrl: 'https://status.relayloop.dev/',
    monthlySpendCents: 28_000_00,
    contactEmail: 'support@relayloop.dev',
    notes: 'Transactional email provider. Signed 2024 MSA, 3-tier SLA.',
    tiers: [
      { uptimeThresholdPct: 99.9, creditPct: 10, sourceExcerpt: "If the monthly uptime percentage falls below 99.9%, customer is entitled to a service credit equal to 10% of that month's fees." },
      { uptimeThresholdPct: 99.0, creditPct: 25, sourceExcerpt: 'If the monthly uptime percentage falls below 99.0%, customer is entitled to a 25% service credit.' },
      { uptimeThresholdPct: 95.0, creditPct: 50, sourceExcerpt: "Below 95% monthly uptime, the credit is 50% of that month's fees." },
    ],
    simulatedOutages: [[5, 47], [12, 18], [22, 124], [35, 8]],
  },
  {
    name: 'Glyphstream CDN',
    monitorUrl: 'https://status.glyphstream.net/',
    monthlySpendCents: 45_000_00,
    contactEmail: 'sla-claims@glyphstream.net',
    notes: 'Global CDN + image optimization. Strict 99.95% SLA.',
    tiers: [
      { uptimeThresholdPct: 99.95, creditPct: 10, sourceExcerpt: 'Service credit of 10% if monthly availability is below 99.95%.' },
      { uptimeThresholdPct: 99.5, creditPct: 25, sourceExcerpt: 'Below 99.5% monthly availability, service credit of 25%.' },
    ],
    simulatedOutages: [[3, 22], [8, 9], [17, 41]],
  },
  {
    name: 'Hearthline CRM',
    monitorUrl: 'https://status.hearthline.app/',
    monthlySpendCents: 12_400_00,
    contactEmail: 'billing@hearthline.app',
    notes: 'CRM. Monthly flat fee.',
    tiers: [
      { uptimeThresholdPct: 99.9, creditPct: 15, sourceExcerpt: '< 99.9% monthly uptime → 15% credit.' },
    ],
    simulatedOutages: [[11, 7]],
  },
  {
    name: 'Paxman Payments',
    monitorUrl: 'https://status.paxman.io/',
    monthlySpendCents: 88_000_00,
    contactEmail: 'trust@paxman.io',
    notes: 'Payment processing. Mission critical.',
    tiers: [
      { uptimeThresholdPct: 99.99, creditPct: 10, sourceExcerpt: 'If availability is below 99.99%, 10% service credit.' },
      { uptimeThresholdPct: 99.9, creditPct: 25, sourceExcerpt: 'If availability is below 99.9%, 25% service credit.' },
      { uptimeThresholdPct: 99.0, creditPct: 50, sourceExcerpt: 'If availability is below 99.0%, 50% service credit.' },
    ],
    simulatedOutages: [[2, 4], [6, 11], [19, 3]],
  },
  {
    name: 'Sidecar Analytics',
    monitorUrl: 'https://status.sidecar.dev/',
    monthlySpendCents: 6_200_00,
    contactEmail: 'support@sidecar.dev',
    notes: 'Product analytics.',
    tiers: [
      { uptimeThresholdPct: 99.5, creditPct: 10, sourceExcerpt: 'Below 99.5% monthly uptime, 10% service credit applies.' },
    ],
    simulatedOutages: [[14, 55]],
  },
  {
    name: 'Vellum Search',
    monitorUrl: 'https://status.vellum.cloud/',
    monthlySpendCents: 19_500_00,
    contactEmail: 'support@vellum.cloud',
    notes: 'Hosted vector search.',
    tiers: [
      { uptimeThresholdPct: 99.9, creditPct: 10, sourceExcerpt: "If the service's uptime falls below 99.9% in any month, 10% credit." },
      { uptimeThresholdPct: 99.0, creditPct: 30, sourceExcerpt: 'Uptime below 99.0% entitles customer to a 30% credit.' },
    ],
    simulatedOutages: [[9, 19]],
  },
];

async function main() {
  await migrate();
  const now = Math.floor(Date.now() / 1000);
  const demoEmail = 'demo@claimrail.io';

  const existingUser = await db.select().from(users).where(eq(users.email, demoEmail)).get();
  if (existingUser) {
    const memberOrgs = await db
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(eq(memberships.userId, existingUser.id))
      .all();
    for (const { orgId } of memberOrgs) {
      await db.delete(orgs).where(eq(orgs.id, orgId)).run();
    }
    await db.delete(users).where(eq(users.id, existingUser.id)).run();
  }

  const orgId = nanoid(16);
  const userId = nanoid(16);
  const passwordHash = await hashPassword('DemoRail!2026');

  await db.insert(orgs).values({ id: orgId, name: 'Acme Industries', slug: 'acme', plan: 'pro' }).run();
  await db.insert(users).values({ id: userId, email: demoEmail, name: 'Avery Kim', passwordHash }).run();
  await db.insert(memberships).values({ id: nanoid(16), userId, orgId, role: 'owner' }).run();

  for (const seed of VENDOR_SEEDS) {
    const vendorId = nanoid(16);
    await db
      .insert(vendors)
      .values({
        id: vendorId,
        orgId,
        name: seed.name,
        monitorUrl: seed.monitorUrl,
        monthlySpendCents: seed.monthlySpendCents,
        contactEmail: seed.contactEmail,
        notes: seed.notes,
      })
      .run();

    let tierRank = 1;
    for (const t of seed.tiers) {
      await db
        .insert(slaTerms)
        .values({
          id: nanoid(16),
          vendorId,
          uptimeThresholdPct: t.uptimeThresholdPct,
          creditPct: t.creditPct,
          tierRank: tierRank++,
          sourceExcerpt: t.sourceExcerpt,
        })
        .run();
    }

    const INTERVAL = 15 * 60;
    const DAYS = 45;
    const totalProbes = Math.floor((DAYS * 24 * 60 * 60) / INTERVAL);
    const outageWindows = seed.simulatedOutages.map(
      ([daysAgoStart, durMin]) => {
        const start = now - daysAgoStart * 86400;
        const end = start + durMin * 60;
        return [start, end] as const;
      },
    );

    const probeRows: Array<typeof probes.$inferInsert> = [];
    for (let i = 0; i < totalProbes; i++) {
      const checkedAt = now - i * INTERVAL;
      const inOutage = outageWindows.some(([s, e]) => checkedAt >= s && checkedAt <= e);
      if (inOutage) {
        probeRows.push({
          id: nanoid(16),
          vendorId,
          checkedAt,
          status: 'down',
          httpStatus: 503,
          latencyMs: null,
          errorMessage: 'HTTP 503 · service unavailable',
        });
      } else {
        const jitter = Math.random();
        if (jitter < 0.01) {
          probeRows.push({
            id: nanoid(16),
            vendorId,
            checkedAt,
            status: 'degraded',
            httpStatus: 200,
            latencyMs: 4200 + Math.floor(Math.random() * 1500),
            errorMessage: 'slow response',
          });
        } else {
          probeRows.push({
            id: nanoid(16),
            vendorId,
            checkedAt,
            status: 'up',
            httpStatus: 200,
            latencyMs: 120 + Math.floor(Math.random() * 280),
            errorMessage: null,
          });
        }
      }
    }
    const CHUNK = 200;
    for (let i = 0; i < probeRows.length; i += CHUNK) {
      await db.insert(probes).values(probeRows.slice(i, i + CHUNK)).run();
    }

    const consolidated = consolidateIncidents(
      probeRows.map((p) => ({ checkedAt: p.checkedAt!, status: p.status! })),
      { mergeGapSeconds: 30 * 60 },
    );
    for (const inc of consolidated) {
      await db
        .insert(incidents)
        .values({
          id: nanoid(16),
          vendorId,
          startedAt: inc.startedAt,
          endedAt: inc.endedAt,
          durationSeconds: inc.durationSeconds,
          severity: inc.severity,
          summary: `Auto-detected outage · ${inc.probeCount} failed probes · ${inc.severity.toUpperCase()}`,
          source: 'auto',
          isResolved: inc.endedAt != null,
        })
        .run();
    }

    const period = currentPeriod();
    const priorPeriod = (() => {
      const d = new Date();
      d.setUTCMonth(d.getUTCMonth() - 1);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();

    for (const p of [priorPeriod, period]) {
      const incidentRows = await db
        .select()
        .from(incidents)
        .where(eq(incidents.vendorId, vendorId))
        .all();
      const report = computeUptimeReport(
        p,
        incidentRows.map((i) => ({
          id: i.id,
          startedAt: i.startedAt,
          endedAt: i.endedAt ?? null,
          durationSeconds: i.durationSeconds ?? null,
          severity: i.severity,
          summary: i.summary,
        })),
      );
      const breach = detectBreach(
        report.uptimePct,
        seed.tiers.map((t) => ({
          uptimeThresholdPct: t.uptimeThresholdPct,
          creditPct: t.creditPct,
          tierRank: 1,
        })),
        seed.monthlySpendCents,
      );
      if (breach.hasBreach) {
        const generated = generateClaim({
          vendor: {
            name: seed.name,
            contactEmail: seed.contactEmail,
            monthlySpendCents: seed.monthlySpendCents,
          },
          period: p,
          uptime: report,
          breach,
          customer: {
            orgName: 'Acme Industries',
            userName: 'Avery Kim',
            userEmail: demoEmail,
          },
          sourceExcerpt: seed.tiers.find(
            (t) => t.uptimeThresholdPct === breach.threshold,
          )?.sourceExcerpt,
        });
        await db
          .insert(claims)
          .values({
            id: nanoid(16),
            vendorId,
            period: p,
            measuredUptimePct: report.uptimePct,
            threshold: breach.threshold ?? 0,
            creditPct: breach.creditPct,
            spendCents: seed.monthlySpendCents,
            estimatedCreditCents: breach.estimatedCreditCents,
            status: p === priorPeriod ? 'filed' : 'drafted',
            filedAt: p === priorPeriod ? now - 4 * 86400 : null,
            emailSubject: generated.subject,
            emailBody: generated.body,
            evidenceJson: JSON.stringify(generated.evidence),
          })
          .run();
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n✓ Seed complete');
  // eslint-disable-next-line no-console
  console.log('  Login with: demo@claimrail.io / DemoRail!2026\n');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => libsql.close());
