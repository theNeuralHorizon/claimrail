import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { verifyAuditChain } from '@/lib/audit/chain';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

export const metadata = { title: 'Audit log · ClaimRail' };

function toneForAction(action: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (action.endsWith('.disable') || action.includes('rejected')) return 'danger';
  if (action.startsWith('auth.')) return 'warn';
  if (action.endsWith('.create') || action.endsWith('.enable')) return 'success';
  if (action.endsWith('.update')) return 'info';
  return 'neutral';
}

export default async function AuditPage() {
  const ctx = await requireAuth();
  const chainStatus = await verifyAuditChain(ctx.org.id);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, ctx.org.id))
    .orderBy(desc(auditEvents.seq))
    .limit(500)
    ;

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
              Audit log
            </h1>
            <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              {rows.length} most recent events · chain verified via SHA-256 Merkle-style links.
            </p>
          </div>
          <Badge tone={chainStatus.ok ? 'success' : 'danger'}>
            {chainStatus.ok
              ? `Intact · ${chainStatus.checked} events`
              : `Tamper at #${chainStatus.brokenAtIndex}`}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Newest first. Every row is anchored to the prior row's hash.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-500 dark:text-ink-400">No events yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 dark:bg-ink-950/40 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  <tr>
                    <th className="text-left px-6 py-3">#</th>
                    <th className="text-left px-6 py-3">When</th>
                    <th className="text-left px-6 py-3">Action</th>
                    <th className="text-left px-6 py-3">Resource</th>
                    <th className="text-left px-6 py-3">Actor</th>
                    <th className="text-left px-6 py-3">Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                      <td className="px-6 py-3 font-mono text-xs text-ink-500 dark:text-ink-400">
                        {r.seq}
                      </td>
                      <td className="px-6 py-3 text-ink-700 dark:text-ink-300">
                        {format(new Date(r.createdAt * 1000), 'MMM d, HH:mm:ss')}
                      </td>
                      <td className="px-6 py-3">
                        <Badge tone={toneForAction(r.action)}>{r.action}</Badge>
                      </td>
                      <td className="px-6 py-3 text-ink-700 dark:text-ink-300">
                        {r.resource}
                        {r.resourceId ? (
                          <span className="text-ink-400 dark:text-ink-500 font-mono text-xs">
                            {' '}
                            · {r.resourceId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs text-ink-500 dark:text-ink-400">
                        {r.actorId ? r.actorId.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="px-6 py-3 font-mono text-[10px] text-ink-400 dark:text-ink-500">
                        {r.rowHash?.slice(0, 10) ?? '—'}…
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
