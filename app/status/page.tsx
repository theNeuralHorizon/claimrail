import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/db/client';
import { probes, sessions, users, vendors, claims } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

export const revalidate = 30;
export const metadata = { title: 'Status · ClaimRail' };

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  try {
    await db.select({ n: sql<number>`1` }).from(users).limit(1);
    checks.push({ name: 'Database', ok: true, detail: 'Responding' });
  } catch (err) {
    checks.push({
      name: 'Database',
      ok: false,
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
  const tables: Array<[string, typeof vendors | typeof claims | typeof sessions]> = [
    ['Vendors', vendors],
    ['Claims', claims],
    ['Sessions', sessions],
  ];
  for (const [name, t] of tables) {
    try {
      await db.select({ c: sql<number>`count(*)` }).from(t).then((r) => r[0]);
      checks.push({ name: `${name} table`, ok: true, detail: 'Reachable' });
    } catch {
      checks.push({ name: `${name} table`, ok: false, detail: 'Not reachable' });
    }
  }
  try {
    const last = await db
      .select()
      .from(probes)
      .orderBy(desc(probes.checkedAt))
      .limit(1)
      .then((r) => r[0]);
    if (!last) {
      checks.push({ name: 'Probe cron', ok: true, detail: 'No probes yet (fresh install)' });
    } else {
      const age = Math.floor(Date.now() / 1000) - last.checkedAt;
      checks.push({
        name: 'Probe cron',
        ok: age < 3600,
        detail: age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`,
      });
    }
  } catch {
    checks.push({ name: 'Probe cron', ok: false, detail: 'Probe log unreachable' });
  }
  return checks;
}

export default async function StatusPage() {
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <div className="min-h-screen flex items-start justify-center px-6 py-16 bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-200">
              ← Back to ClaimRail
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">ClaimRail status</h1>
          </div>
          <Badge tone={allOk ? 'success' : 'danger'} className="text-sm px-3 py-1">
            {allOk ? 'All systems operational' : 'Degraded'}
          </Badge>
        </div>
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 divide-y divide-ink-100 dark:divide-ink-800">
          {checks.map((c) => (
            <div key={c.name} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-ink-500 dark:text-ink-400">{c.detail}</div>
              </div>
              <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'Operational' : 'Down'}</Badge>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Auto-refreshes every 30 seconds. Programmatic health data lives at{' '}
          <Link href="/api/health" className="underline text-brand-700 dark:text-brand-300">
            /api/health
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
