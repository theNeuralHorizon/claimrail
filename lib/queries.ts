/**
 * Dashboard queries — pre-aggregated read models for server components.
 * All queries MUST accept orgId and filter by it; this is the tenancy boundary.
 */
import { db } from '@/lib/db/client';
import {
  vendors,
  slaTerms,
  incidents,
  claims,
  probes,
} from '@/lib/db/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import {
  computeUptimeReport,
  currentPeriod,
  detectBreach,
  type Incident,
  previousPeriod,
} from '@/lib/sla/engine';

export interface VendorOverview {
  vendor: typeof vendors.$inferSelect;
  tiers: Array<typeof slaTerms.$inferSelect>;
  latestProbeStatus: 'up' | 'degraded' | 'down' | 'unknown';
  uptimePct: number;
  downtimeSeconds: number;
  incidentCount: number;
  breach: ReturnType<typeof detectBreach>;
  period: string;
}

async function loadTiers(vendorId: string) {
  return db
    .select()
    .from(slaTerms)
    .where(eq(slaTerms.vendorId, vendorId))
    .all();
}

async function loadIncidents(vendorId: string, sinceSeconds?: number) {
  const rows = sinceSeconds
    ? await db
        .select()
        .from(incidents)
        .where(and(eq(incidents.vendorId, vendorId), gte(incidents.startedAt, sinceSeconds)))
        .orderBy(desc(incidents.startedAt))
        .all()
    : await db
        .select()
        .from(incidents)
        .where(eq(incidents.vendorId, vendorId))
        .orderBy(desc(incidents.startedAt))
        .all();
  return rows.map((i) => ({
    id: i.id,
    startedAt: i.startedAt,
    endedAt: i.endedAt ?? null,
    durationSeconds: i.durationSeconds ?? null,
    severity: i.severity,
    summary: i.summary,
  })) as Incident[];
}

async function latestProbeStatus(vendorId: string): Promise<'up' | 'degraded' | 'down' | 'unknown'> {
  const row = await db
    .select({ status: probes.status })
    .from(probes)
    .where(eq(probes.vendorId, vendorId))
    .orderBy(desc(probes.checkedAt))
    .limit(1)
    .get();
  return (row?.status as 'up' | 'degraded' | 'down') ?? 'unknown';
}

export async function getOrgVendors(orgId: string) {
  return db
    .select()
    .from(vendors)
    .where(eq(vendors.orgId, orgId))
    .orderBy(vendors.name)
    .all();
}

export async function getVendorOverviews(
  orgId: string,
  period: string = currentPeriod(),
): Promise<VendorOverview[]> {
  const rows = await getOrgVendors(orgId);
  const result: VendorOverview[] = [];
  for (const vendor of rows) {
    const tiers = await loadTiers(vendor.id);
    const incs = await loadIncidents(vendor.id);
    const latest = await latestProbeStatus(vendor.id);
    const report = computeUptimeReport(period, incs);
    const breach = detectBreach(
      report.uptimePct,
      tiers.map((t) => ({
        uptimeThresholdPct: t.uptimeThresholdPct,
        creditPct: t.creditPct,
        tierRank: t.tierRank,
      })),
      vendor.monthlySpendCents,
    );
    result.push({
      vendor,
      tiers,
      latestProbeStatus: latest,
      uptimePct: report.uptimePct,
      downtimeSeconds: report.downtimeSeconds,
      incidentCount: report.incidentCount,
      breach,
      period,
    });
  }
  return result;
}

export interface DashboardSummary {
  totalVendors: number;
  atRiskVendors: number;
  totalMonthlySpendCents: number;
  potentialCreditCents: number;
  recoveredYtdCents: number;
  activeIncidentCount: number;
  openClaims: number;
  avgUptimePct: number;
  period: string;
  prevPeriod: string;
}

export async function getDashboardSummary(orgId: string): Promise<DashboardSummary> {
  const period = currentPeriod();
  const overviews = await getVendorOverviews(orgId, period);

  const totalMonthlySpend = overviews.reduce(
    (sum, o) => sum + o.vendor.monthlySpendCents,
    0,
  );
  const atRisk = overviews.filter((o) => o.breach.hasBreach).length;
  const potentialCredit = overviews.reduce(
    (sum, o) => sum + o.breach.estimatedCreditCents,
    0,
  );
  const avgUptime = overviews.length
    ? overviews.reduce((s, o) => s + o.uptimePct, 0) / overviews.length
    : 100;

  // Active incidents = incidents without endedAt
  const vendorIds = overviews.map((o) => o.vendor.id);
  let activeIncidents = 0;
  let openClaims = 0;
  let recoveredYtd = 0;
  if (vendorIds.length > 0) {
    const active = await db
      .select({ count: sql<number>`count(*)` })
      .from(incidents)
      .where(
        and(
          sql`${incidents.vendorId} IN (${sql.join(
            vendorIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          sql`${incidents.endedAt} IS NULL`,
        ),
      )
      .get();
    activeIncidents = Number(active?.count ?? 0);

    const open = await db
      .select({ count: sql<number>`count(*)` })
      .from(claims)
      .where(
        and(
          sql`${claims.vendorId} IN (${sql.join(
            vendorIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          sql`${claims.status} IN ('drafted','filed','acknowledged')`,
        ),
      )
      .get();
    openClaims = Number(open?.count ?? 0);

    const rec = await db
      .select({ total: sql<number>`coalesce(sum(${claims.recoveredCents}),0)` })
      .from(claims)
      .where(
        and(
          sql`${claims.vendorId} IN (${sql.join(
            vendorIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(claims.status, 'recovered'),
        ),
      )
      .get();
    recoveredYtd = Number(rec?.total ?? 0);
  }

  return {
    totalVendors: overviews.length,
    atRiskVendors: atRisk,
    totalMonthlySpendCents: totalMonthlySpend,
    potentialCreditCents: potentialCredit,
    recoveredYtdCents: recoveredYtd,
    activeIncidentCount: activeIncidents,
    openClaims,
    avgUptimePct: avgUptime,
    period,
    prevPeriod: previousPeriod(period),
  };
}

export async function getRecentIncidents(orgId: string, limit = 10) {
  const rows = await db
    .select({
      i: incidents,
      v: vendors,
    })
    .from(incidents)
    .innerJoin(vendors, eq(incidents.vendorId, vendors.id))
    .where(eq(vendors.orgId, orgId))
    .orderBy(desc(incidents.startedAt))
    .limit(limit)
    .all();
  return rows.map((r) => ({
    incident: r.i,
    vendor: r.v,
  }));
}

export async function getAllClaims(orgId: string) {
  const rows = await db
    .select({ c: claims, v: vendors })
    .from(claims)
    .innerJoin(vendors, eq(claims.vendorId, vendors.id))
    .where(eq(vendors.orgId, orgId))
    .orderBy(desc(claims.createdAt))
    .all();
  return rows.map((r) => ({ claim: r.c, vendor: r.v }));
}

/**
 * Per-vendor daily uptime for the last N days (default 7). Derived from
 * the incident log, same math as the full uptime report but broken down
 * per UTC day.
 */
export async function getDailyUptime(
  vendorId: string,
  days = 7,
): Promise<Array<{ day: number; uptimePct: number }>> {
  const endDay = Math.floor(Date.now() / 1000 / 86400) * 86400; // today 00:00 UTC
  const startDay = endDay - (days - 1) * 86400;
  const incs = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.vendorId, vendorId), gte(incidents.startedAt, startDay - 7 * 86400)))
    .all();
  const now = Math.floor(Date.now() / 1000);
  const out: Array<{ day: number; uptimePct: number }> = [];
  for (let i = 0; i < days; i += 1) {
    const dayStart = startDay + i * 86400;
    const dayEnd = Math.min(dayStart + 86400, now);
    const total = Math.max(0, dayEnd - dayStart);
    if (total <= 0) {
      out.push({ day: dayStart, uptimePct: 100 });
      continue;
    }
    let downtime = 0;
    for (const inc of incs) {
      const incEnd = inc.endedAt ?? (inc.durationSeconds != null ? inc.startedAt + inc.durationSeconds : now);
      const overlapStart = Math.max(inc.startedAt, dayStart);
      const overlapEnd = Math.min(incEnd, dayEnd);
      if (overlapEnd > overlapStart) downtime += overlapEnd - overlapStart;
    }
    if (downtime > total) downtime = total;
    out.push({ day: dayStart, uptimePct: ((total - downtime) / total) * 100 });
  }
  return out;
}

/**
 * Monthly recovery rollup for the org — last `months` periods. Buckets
 * claims by filing/recovery month so the dashboard can draw a
 * "how much did we file vs. actually collect" stacked bar chart.
 */
export async function getMonthlyRecovery(
  orgId: string,
  months = 6,
): Promise<Array<{
  period: string;
  draftedCents: number;
  filedCents: number;
  recoveredCents: number;
  count: number;
}>> {
  // Build the list of period labels we care about, oldest → newest.
  const now = new Date();
  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const rows = await db
    .select({
      period: claims.period,
      status: claims.status,
      estimatedCreditCents: claims.estimatedCreditCents,
      recoveredCents: claims.recoveredCents,
    })
    .from(claims)
    .innerJoin(vendors, eq(claims.vendorId, vendors.id))
    .where(eq(vendors.orgId, orgId))
    .all();
  const byPeriod = new Map<
    string,
    { drafted: number; filed: number; recovered: number; count: number }
  >();
  for (const p of periods) byPeriod.set(p, { drafted: 0, filed: 0, recovered: 0, count: 0 });
  for (const r of rows) {
    const bucket = byPeriod.get(r.period);
    if (!bucket) continue; // outside the requested window
    bucket.count += 1;
    // Three stages of the recovery funnel — we show all three stacked so
    // an org with only drafted claims still sees momentum.
    if (r.status === 'drafted') {
      bucket.drafted += r.estimatedCreditCents;
    }
    if (['filed', 'acknowledged', 'rejected'].includes(r.status)) {
      bucket.filed += r.estimatedCreditCents;
    }
    if (r.status === 'recovered') {
      bucket.recovered += r.recoveredCents ?? 0;
    }
  }
  return periods.map((p) => {
    const b = byPeriod.get(p)!;
    return {
      period: p,
      draftedCents: b.drafted,
      filedCents: b.filed,
      recoveredCents: b.recovered,
      count: b.count,
    };
  });
}

export async function getVendorDetail(orgId: string, vendorId: string) {
  const vendor = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, orgId)))
    .get();
  if (!vendor) return null;
  const tiers = await loadTiers(vendor.id);
  const incidents90d = await loadIncidents(
    vendor.id,
    Math.floor(Date.now() / 1000) - 90 * 86400,
  );
  const probeRows = await db
    .select()
    .from(probes)
    .where(
      and(
        eq(probes.vendorId, vendor.id),
        gte(probes.checkedAt, Math.floor(Date.now() / 1000) - 30 * 86400),
      ),
    )
    .orderBy(desc(probes.checkedAt))
    .limit(3000)
    .all();
  const vendorClaims = await db
    .select()
    .from(claims)
    .where(eq(claims.vendorId, vendor.id))
    .orderBy(desc(claims.createdAt))
    .all();

  const currentReport = computeUptimeReport(currentPeriod(), incidents90d);
  const prevReport = computeUptimeReport(previousPeriod(currentPeriod()), incidents90d);
  const breach = detectBreach(
    currentReport.uptimePct,
    tiers.map((t) => ({
      uptimeThresholdPct: t.uptimeThresholdPct,
      creditPct: t.creditPct,
      tierRank: t.tierRank,
    })),
    vendor.monthlySpendCents,
  );

  return {
    vendor,
    tiers,
    incidents: incidents90d,
    probes: probeRows,
    claims: vendorClaims,
    currentReport,
    prevReport,
    breach,
  };
}
