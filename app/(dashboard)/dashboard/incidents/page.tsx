import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { incidents, vendors } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/lib/sla/engine';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';

export const metadata = { title: 'Incidents · ClaimRail' };

export default async function IncidentsPage() {
  const ctx = await requireAuth();
  const rows = await db
    .select({ i: incidents, v: vendors })
    .from(incidents)
    .innerJoin(vendors, eq(incidents.vendorId, vendors.id))
    .where(eq(vendors.orgId, ctx.org.id))
    .orderBy(desc(incidents.startedAt))
    .all();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Incidents</h1>
        <p className="text-sm text-ink-500 mt-1">
          {rows.length} incident{rows.length === 1 ? '' : 's'} across all vendors.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All incidents</CardTitle>
          <CardDescription>Sorted by most recent.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-500">
              No incidents recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="text-left px-6 py-3">Vendor</th>
                    <th className="text-left px-6 py-3">Severity</th>
                    <th className="text-left px-6 py-3">Started</th>
                    <th className="text-left px-6 py-3">Duration</th>
                    <th className="text-left px-6 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map(({ i, v }) => {
                    const tone =
                      i.severity === 'critical'
                        ? 'danger'
                        : i.severity === 'major'
                          ? 'warn'
                          : 'info';
                    return (
                      <tr key={i.id} className="hover:bg-ink-50/60">
                        <td className="px-6 py-3">
                          <Link
                            href={`/dashboard/vendors/${v.id}`}
                            className="font-medium text-ink-900 hover:underline"
                          >
                            {v.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <Badge tone={tone}>{i.severity}</Badge>
                        </td>
                        <td className="px-6 py-3 text-ink-700">
                          <div>{format(new Date(i.startedAt * 1000), 'MMM d, HH:mm')}</div>
                          <div className="text-xs text-ink-500">
                            {formatDistanceToNow(new Date(i.startedAt * 1000), { addSuffix: true })}
                          </div>
                        </td>
                        <td className="px-6 py-3 font-mono text-ink-900">
                          {i.durationSeconds ? formatDuration(i.durationSeconds) : 'ongoing'}
                        </td>
                        <td className="px-6 py-3 text-ink-700 max-w-md truncate">
                          {i.summary}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
