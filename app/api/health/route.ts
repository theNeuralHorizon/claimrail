import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { probes, orgs, users, vendors, claims } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

/**
 * Health endpoint. Exercises real work — DB ping + recent-probe age +
 * schema sanity — so it's a useful liveness/readiness signal and not just
 * a "server is up" lie.
 *
 * Returns 200 when everything looks healthy and 503 otherwise. Upstream
 * load balancers + uptime monitors should check status code + JSON.
 */

interface HealthResult {
  ok: boolean;
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: Record<string, { ok: boolean; detail?: string; value?: number | string }>;
}

const bootedAt = Date.now();

export async function GET() {
  const result: HealthResult = {
    ok: true,
    service: 'claimrail',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // DB ping — a trivial SELECT 1.
  try {
    await db.select({ n: sql<number>`1` }).from(orgs).limit(1).all();
    result.checks.db = { ok: true };
  } catch (err) {
    result.ok = false;
    result.checks.db = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    };
  }

  // Schema sanity — all the tables we depend on respond to a count query.
  const tables = [
    { name: 'users', t: users },
    { name: 'vendors', t: vendors },
    { name: 'claims', t: claims },
  ] as const;
  for (const spec of tables) {
    try {
      const r = await db.select({ c: sql<number>`count(*)` }).from(spec.t).get();
      result.checks[spec.name] = { ok: true, value: Number(r?.c ?? 0) };
    } catch (err) {
      result.ok = false;
      result.checks[spec.name] = {
        ok: false,
        detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      };
    }
  }

  // Last probe: how long since ANY probe ran? Long silence = cron broken.
  try {
    const latest = await db
      .select()
      .from(probes)
      .orderBy(desc(probes.checkedAt))
      .limit(1)
      .get();
    const now = Math.floor(Date.now() / 1000);
    if (!latest) {
      result.checks.probes = { ok: true, detail: 'no probes yet' };
    } else {
      const ageSec = now - latest.checkedAt;
      // Cron should be hitting /api/cron/probes at least every 15 min.
      // Anything older than 1 hour is a red flag.
      result.checks.probes = {
        ok: ageSec < 3600,
        value: ageSec,
        detail: `${Math.floor(ageSec / 60)}m ago`,
      };
      if (ageSec >= 3600) result.ok = false;
    }
  } catch (err) {
    result.ok = false;
    result.checks.probes = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    };
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}
