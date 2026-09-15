import { NextRequest, NextResponse } from 'next/server';
import { seedDemoData } from '@/lib/db/seed';

// TEMPORARY: one-shot trigger to reseed the demo tenant on the live
// deployment after the 2026-09-15 Postgres rotation wiped prod data.
// Direct external connections to Render Postgres were failing from the
// operator's environment, so this reuses the already-working HTTPS path
// (same auth pattern as /api/cron/probes) to run the seed from inside
// Render's network instead. Remove this route once the reseed is done —
// it is destructive (drops and recreates the demo org) and shouldn't be
// left reachable indefinitely even behind a secret.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    await seedDemoData();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 },
    );
  }
}
