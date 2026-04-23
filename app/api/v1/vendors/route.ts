import { NextRequest, NextResponse } from 'next/server';
import { resolveApiToken } from '@/lib/auth/api-tokens';
import { getVendorOverviews } from '@/lib/queries';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public REST v1 — read-only listing of vendors scoped to the owning org.
 * Auth via `Authorization: Bearer crt_…`.
 *
 * Dedicated rate limit per-token (60/min) sits on top of upstream WAF.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/.exec(auth);
  if (!m) {
    return NextResponse.json(
      { error: 'Missing bearer token' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="ClaimRail"' } },
    );
  }
  const resolved = await resolveApiToken(m[1]);
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
      { status: 429, headers: { 'Retry-After': String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))) } },
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
