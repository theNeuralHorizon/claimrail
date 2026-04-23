import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { getVendorOverviews, getDailyUptime } from '@/lib/queries';
import { UptimeSparkline } from '@/components/features/uptime-sparkline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, StatusDot } from '@/components/ui/badge';
import { formatCents, formatUptime } from '@/lib/sla/engine';
import { Plus, ArrowUpRight } from 'lucide-react';

export const metadata = { title: 'Vendors · ClaimRail' };

export default async function VendorsPage() {
  const ctx = await requireAuth();
  const overviews = await getVendorOverviews(ctx.org.id);
  const sparklines = await Promise.all(
    overviews.map(async (o) => ({
      vendorId: o.vendor.id,
      points: await getDailyUptime(o.vendor.id, 7),
    })),
  );
  const sparkMap = new Map(sparklines.map((s) => [s.vendorId, s.points]));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Vendors</h1>
          <p className="text-sm text-ink-500 mt-1">
            {overviews.length} vendor{overviews.length === 1 ? '' : 's'} · monitored 24/7
          </p>
        </div>
        <Link href="/dashboard/vendors/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" /> Add vendor
          </Button>
        </Link>
      </div>

      {overviews.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-ink-700 text-lg font-medium">No vendors yet</div>
            <div className="mt-2 text-ink-500 text-sm max-w-md mx-auto">
              Add your first vendor — paste its SLA and we'll start probing its status URL every 5 minutes.
            </div>
            <Link href="/dashboard/vendors/new" className="mt-5 inline-block">
              <Button variant="primary">
                <Plus className="h-4 w-4" /> Add your first vendor
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {overviews.map((o) => {
            const breachTone: 'success' | 'warn' | 'danger' = o.breach.hasBreach
              ? o.breach.creditPct >= 25
                ? 'danger'
                : 'warn'
              : 'success';
            return (
              <Link key={o.vendor.id} href={`/dashboard/vendors/${o.vendor.id}`}>
                <Card className="hover:shadow-md hover:border-ink-300 transition-all h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate flex items-center gap-2">
                          <StatusDot status={o.latestProbeStatus} />
                          {o.vendor.name}
                        </CardTitle>
                        <CardDescription className="truncate">
                          {o.vendor.monitorUrl}
                        </CardDescription>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-ink-400 flex-none" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">Uptime</div>
                        <div className="font-mono text-ink-900 dark:text-ink-100 tabular-nums">
                          {formatUptime(o.uptimePct)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">Monthly spend</div>
                        <div className="font-mono text-ink-900 dark:text-ink-100 tabular-nums">
                          {formatCents(o.vendor.monthlySpendCents)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
                        <span>Last 7 days</span>
                        <span>
                          {sparkMap.get(o.vendor.id)?.[0]?.uptimePct?.toFixed(2) ?? '—'}% today
                        </span>
                      </div>
                      <UptimeSparkline
                        points={sparkMap.get(o.vendor.id) ?? []}
                        threshold={
                          o.tiers.length
                            ? Math.max(...o.tiers.map((t) => t.uptimeThresholdPct))
                            : 99.9
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-ink-100">
                      <Badge tone="neutral">
                        {o.tiers.length} SLA tier{o.tiers.length === 1 ? '' : 's'}
                      </Badge>
                      {o.breach.hasBreach ? (
                        <Badge tone={breachTone}>
                          {formatCents(o.breach.estimatedCreditCents)} owed
                        </Badge>
                      ) : (
                        <Badge tone="success">Meeting SLA</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
