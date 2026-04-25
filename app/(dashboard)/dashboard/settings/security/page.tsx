import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { securityEvents } from '@/lib/db/schema';
import { eq, desc, or } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { disabledKeys } from '@/lib/security/kill-switch';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

export const metadata = { title: 'Security · ClaimRail' };

function toneForSeverity(s: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (s === 'critical' || s === 'high') return 'danger';
  if (s === 'warn') return 'warn';
  return 'info';
}

export default async function SecurityPage() {
  const ctx = await requireAuth();
  const killed = disabledKeys();

  // Show events either scoped to this org OR events on the user that
  // don't yet have an org (e.g. pre-session signup failures).
  const rows = await db
    .select()
    .from(securityEvents)
    .where(
      or(eq(securityEvents.orgId, ctx.org.id), eq(securityEvents.userId, ctx.user.id)),
    )
    .orderBy(desc(securityEvents.createdAt))
    .limit(200)
    ;

  const counts = {
    critical: rows.filter((r) => r.severity === 'critical').length,
    high: rows.filter((r) => r.severity === 'high').length,
    warn: rows.filter((r) => r.severity === 'warn').length,
  };

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
              Security events
            </h1>
            <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              Adversarial activity and defense triggers. Distinct from the audit log, which
              covers successful state changes.
            </p>
          </div>
        </div>
      </div>

      {killed.length > 0 ? (
        <div className="rounded-xl border border-red-200 dark:border-danger-500/40 bg-danger-50 dark:bg-danger-500/10 p-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-danger-600 dark:text-danger-400" />
          <div>
            <div className="text-sm font-semibold text-danger-700 dark:text-danger-300">Kill switch engaged</div>
            <div className="text-xs text-danger-700 dark:text-danger-300">
              Disabled subsystems: <span className="font-mono">{killed.join(', ')}</span>. Unset{' '}
              <code className="font-mono">CLAIMRAIL_DISABLE</code> to restore.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <CountCard label="Critical" value={counts.critical} tone="danger" />
        <CountCard label="High" value={counts.high} tone="danger" />
        <CountCard label="Warn" value={counts.warn} tone="warn" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Last 200 security events for this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-500 dark:text-ink-400">
              No events yet. That's good.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 dark:bg-ink-950/40 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  <tr>
                    <th className="text-left px-6 py-3">When</th>
                    <th className="text-left px-6 py-3">Severity</th>
                    <th className="text-left px-6 py-3">Kind</th>
                    <th className="text-left px-6 py-3">IP</th>
                    <th className="text-left px-6 py-3">User agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                      <td className="px-6 py-3 text-ink-700 dark:text-ink-300">
                        {format(new Date(r.createdAt * 1000), 'MMM d, HH:mm:ss')}
                      </td>
                      <td className="px-6 py-3">
                        <Badge tone={toneForSeverity(r.severity)}>{r.severity}</Badge>
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-ink-900 dark:text-ink-100">{r.kind}</td>
                      <td className="px-6 py-3 font-mono text-xs text-ink-500 dark:text-ink-400">{r.ip ?? '—'}</td>
                      <td className="px-6 py-3 font-mono text-[11px] text-ink-500 dark:text-ink-400 max-w-md truncate">
                        {r.userAgent ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'warn' | 'success';
}) {
  const ring =
    tone === 'danger'
      ? 'border-red-200 dark:border-danger-500/30 bg-danger-50/40 dark:bg-danger-500/10'
      : tone === 'warn'
        ? 'border-amber-200 dark:border-warn-500/30 bg-warn-50/40 dark:bg-warn-500/10'
        : 'border-brand-200 dark:border-brand-500/30 bg-brand-50/40 dark:bg-brand-500/10';
  return (
    <div className={`rounded-xl border p-5 ${ring}`}>
      <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-ink-900 dark:text-ink-100 tabular-nums">{value}</div>
    </div>
  );
}
