import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { vendors, slaTerms } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { validateProbeUrl } from '@/lib/probes/ssrf';
import { guardMutation } from '@/lib/security/request-guard';
import { appendAuditEvent } from '@/lib/audit/chain';

const tierSchema = z.object({
  uptimeThresholdPct: z.number().gt(0).lt(100),
  creditPct: z.number().gt(0).lte(100),
  sourceExcerpt: z.string().max(500).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  monitorUrl: z.string().url(),
  monthlySpendCents: z.number().int().min(0),
  contactEmail: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
  slaExcerpt: z.string().max(50_000).optional(),
  tiers: z.array(tierSchema).min(1).max(10),
});

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await db.select().from(vendors).where(eq(vendors.orgId, ctx.org.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const urlCheck = validateProbeUrl(d.monitorUrl);
  if (!urlCheck.ok) {
    return NextResponse.json(
      { error: `Monitor URL rejected: ${urlCheck.reason}` },
      { status: 400 },
    );
  }
  const id = nanoid(16);

  await db
    .insert(vendors)
    .values({
      id,
      orgId: ctx.org.id,
      name: d.name,
      monitorUrl: d.monitorUrl,
      monthlySpendCents: d.monthlySpendCents,
      contactEmail: d.contactEmail,
      notes: d.notes ?? d.slaExcerpt?.slice(0, 500) ?? null,
    })
    ;

  let tierRank = 1;
  for (const t of d.tiers.sort((a, b) => b.uptimeThresholdPct - a.uptimeThresholdPct)) {
    await db
      .insert(slaTerms)
      .values({
        id: nanoid(16),
        vendorId: id,
        uptimeThresholdPct: t.uptimeThresholdPct,
        creditPct: t.creditPct,
        tierRank: tierRank++,
        sourceExcerpt: t.sourceExcerpt ?? null,
      })
      ;
  }

  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'vendor.create',
    resource: 'vendor',
    resourceId: id,
    metadata: { name: d.name, tierCount: d.tiers.length },
  });

  return NextResponse.json({ id });
}
