import { NextRequest, NextResponse } from 'next/server';
import { resolveApiToken } from '@/lib/auth/api-tokens';
import { getAllClaims } from '@/lib/queries';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Public REST v1 — list claims for the authenticated token's org.
 * Auth: Bearer `crt_…`. Read tokens are enough; write isn't required.
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
  const rl = rateLimit(`api:v1:claims:${resolved.tokenId}`, {
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

  const rows = await getAllClaims(resolved.orgId);
  return NextResponse.json(
    {
      data: rows.map(({ claim, vendor }) => ({
        id: claim.id,
        vendorId: claim.vendorId,
        vendorName: vendor.name,
        period: claim.period,
        status: claim.status,
        measuredUptimePct: Number(claim.measuredUptimePct.toFixed(4)),
        threshold: claim.threshold,
        creditPct: claim.creditPct,
        estimatedCreditCents: claim.estimatedCreditCents,
        recoveredCents: claim.recoveredCents ?? 0,
        createdAt: new Date(claim.createdAt * 1000).toISOString(),
        filedAt: claim.filedAt ? new Date(claim.filedAt * 1000).toISOString() : null,
        resolvedAt: claim.resolvedAt ? new Date(claim.resolvedAt * 1000).toISOString() : null,
      })),
      meta: { count: rows.length },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
