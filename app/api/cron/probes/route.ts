import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { runProbesForOrg } from '@/lib/probes/engine';

// This endpoint must be callable by a scheduler (GitHub Actions, Vercel Cron)
// — auth is via a shared secret in the Authorization header rather than a
// cookie. Handles GET + POST so it's compatible with curl + fetch both.

async function requireCronSecret(req: NextRequest): Promise<NextResponse | null> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // If no secret configured (dev), allow — but warn in the response.
    return null;
  }
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const forbidden = await requireCronSecret(req);
  if (forbidden) return forbidden;
  const allOrgs = await db.select().from(orgs).all();
  const report: Array<{
    orgId: string;
    summaries: Awaited<ReturnType<typeof runProbesForOrg>>;
  }> = [];
  for (const o of allOrgs) {
    const summaries = await runProbesForOrg(o.id);
    report.push({ orgId: o.id, summaries });
  }
  return NextResponse.json({
    probedOrgs: allOrgs.length,
    timestamp: Math.floor(Date.now() / 1000),
    report,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
