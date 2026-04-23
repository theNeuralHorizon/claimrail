import { NextRequest, NextResponse } from 'next/server';
import { resolveApiToken } from '@/lib/auth/api-tokens';
import { getVendorOverviews } from '@/lib/queries';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db/client';
import { vendors, slaTerms } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { validateProbeUrl } from '@/lib/probes/ssrf';
import { appendAuditEvent } from '@/lib/audit/chain';
import { sanitizeLine, sanitizeBlock } from '@/lib/security/sanitize';
import {
  moneyCents,
  uptimeThresholdPct,
  creditPct,
} from '@/lib/security/strict-types';

/**
 * Public REST v1.
 *
 * GET  /api/v1/vendors — list vendors + current-period breach state (read scope).
 * POST /api/v1/vendors — create a vendor with tiers (write scope).
 *
 * Auth via `Authorization: Bearer crt_…`. Dedicated rate limit per-token
 * (60/min) sits on top of upstream WAF.
 */

function requireAuth(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/.exec(auth);
  if (!m) {
    return {
      error: NextResponse.json(
        { error: 'Missing bearer token' },
        { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="ClaimRail"' } },
      ),
    };
  }
  return { raw: m[1] };
}

export async function GET(req: NextRequest) {
  const g = requireAuth(req);
  if ('error' in g) return g.error;
  const resolved = await resolveApiToken(g.raw);
  if (!resolved) {
    return NextResponse.json(
      { error: 'Invalid or revoked token' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="ClaimRail", error="invalid_token"' } },
    );
  }
  const rl = rateLimit(`api:v1:vendors:${resolved.tokenId}`, {
    limit: 60,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))) },
      },
    );
  }

  const overviews = await getVendorOverviews(resolved.orgId);
  return NextResponse.json(
    {
      data: overviews.map((o) => ({
        id: o.vendor.id,
        name: o.vendor.name,
        monitorUrl: o.vendor.monitorUrl,
        monthlySpendCents: o.vendor.monthlySpendCents,
        currentPeriod: o.period,
        uptimePct: Number(o.uptimePct.toFixed(4)),
        breach: {
          hasBreach: o.breach.hasBreach,
          threshold: o.breach.threshold,
          creditPct: o.breach.creditPct,
          estimatedCreditCents: o.breach.estimatedCreditCents,
        },
      })),
      meta: { count: overviews.length, period: overviews[0]?.period ?? null },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

const createSchema = z
  .object({
    name: z.string().min(1).max(100),
    monitorUrl: z.string().url().max(500),
    monthlySpendCents: moneyCents,
    contactEmail: z.string().email().max(256).optional(),
    notes: z.string().max(2000).optional(),
    tiers: z
      .array(
        z
          .object({
            uptimeThresholdPct,
            creditPct,
            sourceExcerpt: z.string().max(500).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export async function POST(req: NextRequest) {
  const g = requireAuth(req);
  if ('error' in g) return g.error;
  const resolved = await resolveApiToken(g.raw);
  if (!resolved) {
    return NextResponse.json(
      { error: 'Invalid or revoked token' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="ClaimRail", error="invalid_token"' } },
    );
  }
  if (resolved.scope !== 'write') {
    return NextResponse.json(
      { error: 'This endpoint requires a write-scope token.' },
      { status: 403 },
    );
  }
  const rl = rateLimit(`api:v1:vendors:write:${resolved.tokenId}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid input' },
      { status: 400 },
    );
  }
  const urlCheck = validateProbeUrl(parsed.data.monitorUrl);
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
      orgId: resolved.orgId,
      name: sanitizeLine(parsed.data.name, 100),
      monitorUrl: parsed.data.monitorUrl,
      monthlySpendCents: parsed.data.monthlySpendCents,
      contactEmail: parsed.data.contactEmail,
      notes: parsed.data.notes ? sanitizeBlock(parsed.data.notes, 2000) : null,
    })
    .run();
  let tierRank = 1;
  for (const t of [...parsed.data.tiers].sort(
    (a, b) => b.uptimeThresholdPct - a.uptimeThresholdPct,
  )) {
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
      .run();
  }
  await appendAuditEvent({
    orgId: resolved.orgId,
    actorId: null,
    action: 'vendor.create',
    resource: 'vendor',
    resourceId: id,
    metadata: {
      name: parsed.data.name,
      via: 'api',
      tokenId: resolved.tokenId,
      tierCount: parsed.data.tiers.length,
    },
  });
  return NextResponse.json({ id }, { status: 201 });
}
