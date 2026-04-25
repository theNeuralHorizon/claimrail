import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { vendors } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { probeUrl, recordProbe, reconcileIncidents } from '@/lib/probes/engine';
import { rateLimit } from '@/lib/rate-limit';
import { guardMutation } from '@/lib/security/request-guard';

interface Params {
  params: { vendorId: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  // Probe with empty body is OK, but we still want Origin/Referer enforcement.
  const blocked = guardMutation(req, { allowAnyContentType: true });
  if (blocked) return blocked;
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { vendorId } = params;
  // Manual probing is rate-limited per user so one person can't hammer
  // a vendor from the dashboard.
  const rl = rateLimit(`probe:${ctx.user.id}`, { limit: 30, windowSeconds: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Probe rate limit reached.' }, { status: 429 });
  }
  const vendor = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.orgId, ctx.org.id)))
    .then((r) => r[0]);
  if (!vendor) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const result = await probeUrl(vendor.monitorUrl);
  await recordProbe(vendor.id, result);
  await reconcileIncidents(vendor.id);
  return NextResponse.json({ vendorId, result });
}
