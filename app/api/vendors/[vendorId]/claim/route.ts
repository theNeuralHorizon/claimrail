import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { vendors, slaTerms, incidents, claims } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  currentPeriod,
  computeUptimeReport,
  detectBreach,
} from '@/lib/sla/engine';
import { generateClaim } from '@/lib/claims/generator';
import { guardMutation } from '@/lib/security/request-guard';
import { appendAuditEvent } from '@/lib/audit/chain';
import { sendSlackAlert } from '@/lib/integrations/slack';
import { formatCents, formatUptime } from '@/lib/sla/engine';

const schema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

interface Params {
  params: { vendorId: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { vendorId } = params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const period = parsed.data.period ?? currentPeriod();

  const vendor = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, ctx.org.id)))
    .then((r) => r[0]);
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

  const tiers = await db.select().from(slaTerms).where(eq(slaTerms.vendorId, vendor.id));
  if (tiers.length === 0) {
    return NextResponse.json({ error: 'No SLA tiers configured.' }, { status: 400 });
  }

  const incs = await db
    .select()
    .from(incidents)
    .where(eq(incidents.vendorId, vendor.id))
    ;

  const report = computeUptimeReport(
    period,
    incs.map((i) => ({
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
    tiers.map((t) => ({
      uptimeThresholdPct: t.uptimeThresholdPct,
      creditPct: t.creditPct,
      tierRank: t.tierRank,
    })),
    vendor.monthlySpendCents,
  );
  if (!breach.hasBreach) {
    return NextResponse.json(
      { error: `No breach detected for ${period} — uptime was ${report.uptimePct.toFixed(3)}%.` },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(claims)
    .where(and(eq(claims.vendorId, vendor.id), eq(claims.period, period)))
    .then((r) => r[0]);
  if (existing) {
    return NextResponse.json({ id: existing.id, reused: true });
  }

  const sourceExcerpt = tiers.find(
    (t) => t.uptimeThresholdPct === breach.threshold,
  )?.sourceExcerpt;

  const generated = generateClaim({
    vendor: {
      name: vendor.name,
      contactEmail: vendor.contactEmail ?? undefined,
      monthlySpendCents: vendor.monthlySpendCents,
    },
    period,
    uptime: report,
    breach,
    customer: {
      orgName: ctx.org.name,
      userName: ctx.user.name,
      userEmail: ctx.user.email,
    },
    sourceExcerpt: sourceExcerpt ?? null,
  });

  const id = nanoid(16);
  await db
    .insert(claims)
    .values({
      id,
      vendorId: vendor.id,
      period,
      measuredUptimePct: report.uptimePct,
      threshold: breach.threshold ?? 0,
      creditPct: breach.creditPct,
      spendCents: vendor.monthlySpendCents,
      estimatedCreditCents: breach.estimatedCreditCents,
      status: 'drafted',
      emailSubject: generated.subject,
      emailBody: generated.body,
      evidenceJson: JSON.stringify(generated.evidence),
    })
    ;

  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'claim.create',
    resource: 'claim',
    resourceId: id,
    metadata: {
      vendorId: vendor.id,
      period,
      estimatedCreditCents: breach.estimatedCreditCents,
    },
  });

  // Fire-and-forget Slack alert — intentionally not awaited so slow
  // webhook delivery can't delay the HTTP response.
  void sendSlackAlert(ctx.org.id, {
    kind: 'claim_drafted',
    title: `Claim drafted · ${vendor.name}`,
    details: {
      Period: period,
      Uptime: formatUptime(report.uptimePct),
      Threshold: `${breach.threshold}%`,
      Credit: formatCents(breach.estimatedCreditCents),
    },
    link: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/dashboard/claims/${id}`,
  });

  return NextResponse.json({ id, estimatedCreditCents: breach.estimatedCreditCents });
}
