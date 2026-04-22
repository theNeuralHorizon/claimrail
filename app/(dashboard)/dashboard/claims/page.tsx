import { requireAuth } from '@/lib/auth/session';
import { getAllClaims } from '@/lib/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCents, formatUptime } from '@/lib/sla/engine';
import Link from 'next/link';
import { format } from 'date-fns';

export const metadata = { title: 'Claims · ClaimRail' };

export default async function ClaimsPage() {
  const ctx = await requireAuth();
  const claims = await getAllClaims(ctx.org.id);

  const totals = claims.reduce(
    (acc, { claim }) => {
      acc.potential += claim.estimatedCreditCents;
      if (claim.status === 'recovered') acc.recovered += claim.recoveredCents ?? 0;
      if (['drafted', 'filed', 'acknowledged'].includes(claim.status)) acc.open += 1;
      return acc;
    },
    { potential: 0, recovered: 0, open: 0 },
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Claims</h1>
        <p className="text-sm text-ink-500 mt-1">
          {claims.length} claim{claims.length === 1 ? '' : 's'} total · {totals.open} open · {formatCents(totals.recovered)} recovered
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All claims</CardTitle>
          <CardDescription>Click a row to open the draft letter.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {claims.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-500">
              No claims yet. Breaches trigger drafts automatically.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="text-left px-6 py-3">Vendor</th>
                    <th className="text-left px-6 py-3">Period</th>
                    <th className="text-left px-6 py-3">Uptime</th>
                    <th className="text-left px-6 py-3">Credit</th>
                    <th className="text-left px-6 py-3">Estimated</th>
                    <th className="text-left px-6 py-3">Recovered</th>
                    <th className="text-left px-6 py-3">Status</th>
                    <th className="text-left px-6 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {claims.map(({ claim, vendor }) => {
                    const tone =
                      claim.status === 'recovered'
                        ? 'success'
                        : claim.status === 'rejected'
                          ? 'danger'
                          : claim.status === 'filed' || claim.status === 'acknowledged'
                            ? 'info'
                            : 'warn';
                    return (
                      <tr key={claim.id} className="hover:bg-ink-50/60">
                        <td className="px-6 py-3">
                          <Link
                            href={`/dashboard/claims/${claim.id}`}
                            className="font-medium text-ink-900 hover:underline"
                          >
                            {vendor.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3 font-mono text-ink-700">{claim.period}</td>
                        <td className="px-6 py-3 font-mono text-ink-900">
                          {formatUptime(claim.measuredUptimePct)}
                        </td>
                        <td className="px-6 py-3 font-mono text-ink-700">{claim.creditPct}%</td>
                        <td className="px-6 py-3 font-mono text-ink-900">
                          {formatCents(claim.estimatedCreditCents)}
                        </td>
                        <td className="px-6 py-3 font-mono text-brand-700">
                          {formatCents(claim.recoveredCents ?? 0)}
                        </td>
                        <td className="px-6 py-3">
                          <Badge tone={tone} className="capitalize">
                            {claim.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-ink-500">
                          {format(new Date(claim.createdAt * 1000), 'MMM d, yyyy')}
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
