import { requireAuth } from '@/lib/auth/session';
import {
  getDashboardSummary,
  getRecentIncidents,
  getVendorOverviews,
} from '@/lib/queries';
import { Stat } from '@/components/ui/stat';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DollarSign,
  ShieldAlert,
  TrendingUp,
  Activity,
  AlertCircle,
  FileText,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { formatCents, formatDuration, formatUptime } from '@/lib/sla/engine';
import { formatDistanceToNow } from 'date-fns';

export const metadata = { title: 'Overview · ClaimRail' };

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const summary = await getDashboardSummary(ctx.org.id);
  const overviews = await getVendorOverviews(ctx.org.id);
  const recentIncidents = await getRecentIncidents(ctx.org.id, 6);

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Overview"
        subtitle={`${summary.period} · ${ctx.org.name}`}
        period={summary.period}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Potential credit"
          value={formatCents(summary.potentialCreditCents)}
          hint={`this ${summary.period}`}
          icon={<DollarSign />}
          tone={summary.potentialCreditCents > 0 ? 'success' : 'default'}
        />
        <Stat
          label="At-risk vendors"
          value={summary.atRiskVendors}
          hint={`of ${summary.totalVendors} monitored`}
          icon={<ShieldAlert />}
          tone={summary.atRiskVendors > 0 ? 'warn' : 'default'}
        />
        <Stat
          label="Avg uptime"
          value={formatUptime(summary.avgUptimePct)}
          hint="weighted across vendors"
          icon={<TrendingUp />}
        />
        <Stat
          label="Recovered YTD"
          value={formatCents(summary.recoveredYtdCents)}
          hint={`${summary.openClaims} open claim${summary.openClaims === 1 ? '' : 's'}`}
          icon={<Activity />}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex items-start justify-between flex-row">
              <div>
                <CardTitle>Vendor uptime · {summary.period}</CardTitle>
                <CardDescription>
                  Measured against each vendor's contractual SLA threshold.
                </CardDescription>
              </div>
              <Link href="/dashboard/vendors">
                <Button variant="outline" size="sm">
                  All vendors <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-ink-100">
                {overviews.map((o) => {
                  const tone: 'success' | 'warn' | 'danger' = o.breach.hasBreach
                    ? o.breach.creditPct >= 25
                      ? 'danger'
                      : 'warn'
                    : 'success';
                  const threshold =
                    o.tiers.length > 0
                      ? Math.max(...o.tiers.map((t) => t.uptimeThresholdPct))
                      : 99.9;
                  // Scale the 95%–100% range across the bar; anything below
                  // 95% pegs to zero width (but is always accompanied by a
                  // visible "owed" badge so the UI still communicates severity).
                  const scale = (pct: number) =>
                    Math.min(100, Math.max(2, ((pct - 95) / 5) * 100));
                  const pct = scale(o.uptimePct);
                  const tpct = scale(threshold);
                  return (
                    <li key={o.vendor.id} className="px-6 py-4 hover:bg-ink-50/60 transition-colors">
                      <Link href={`/dashboard/vendors/${o.vendor.id}`} className="block">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <StatusDot status={o.latestProbeStatus} />
                            <div className="min-w-0">
                              <div className="font-medium text-ink-900 truncate">
                                {o.vendor.name}
                              </div>
                              <div className="text-xs text-ink-500 flex items-center gap-1.5">
                                <span className="font-mono">
                                  {formatUptime(o.uptimePct)}
                                </span>
                                <span>·</span>
                                <span>{o.incidentCount} incident{o.incidentCount === 1 ? '' : 's'}</span>
                                <span>·</span>
                                <span>{formatDuration(o.downtimeSeconds)} down</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {o.breach.hasBreach ? (
                              <Badge tone={tone}>
                                {formatCents(o.breach.estimatedCreditCents)} owed
                              </Badge>
                            ) : (
                              <Badge tone="success">Meeting SLA</Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 relative h-1.5 rounded-full bg-ink-100 overflow-hidden">
                          <div
                            className={`h-full ${
                              o.breach.hasBreach ? 'bg-danger-500' : 'bg-brand-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-ink-900"
                            style={{ left: `${tpct}%` }}
                            title={`SLA threshold: ${threshold}%`}
                          />
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {overviews.length === 0 ? (
                  <li className="p-10 text-center text-ink-500">
                    <p>No vendors yet.</p>
                    <Link href="/dashboard/vendors/new" className="mt-3 inline-block">
                      <Button variant="primary" size="sm">Add first vendor</Button>
                    </Link>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-start justify-between flex-row">
              <div>
                <CardTitle>Recent incidents</CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </div>
              <Link href="/dashboard/incidents">
                <Button variant="ghost" size="sm">
                  View all <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {recentIncidents.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-500">
                  No incidents yet.
                </div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {recentIncidents.map(({ incident, vendor }) => {
                    const tone =
                      incident.severity === 'critical'
                        ? 'danger'
                        : incident.severity === 'major'
                          ? 'warn'
                          : 'info';
                    const ago = formatDistanceToNow(new Date(incident.startedAt * 1000), {
                      addSuffix: true,
                    });
                    return (
                      <li key={incident.id} className="px-5 py-3 hover:bg-ink-50/60">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-4 w-4 text-ink-400 mt-0.5 flex-none" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-ink-900 truncate">
                                {vendor.name}
                              </div>
                              <Badge tone={tone} className="text-[10px]">
                                {incident.severity}
                              </Badge>
                            </div>
                            <div className="text-xs text-ink-500 truncate">
                              {ago} · {incident.durationSeconds ? formatDuration(incident.durationSeconds) : 'ongoing'}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard/vendors/new" className="block">
                <Button variant="primary" size="md" className="w-full justify-start">
                  <FileText className="h-4 w-4" />
                  Add a vendor
                </Button>
              </Link>
              <Link href="/dashboard/claims" className="block">
                <Button variant="outline" size="md" className="w-full justify-start">
                  <DollarSign className="h-4 w-4" />
                  Review claims
                </Button>
              </Link>
              <Link
                href="/api/cron/probes"
                target="_blank"
                className="block"
              >
                <Button variant="ghost" size="md" className="w-full justify-start text-ink-500">
                  <ExternalLink className="h-4 w-4" />
                  Cron endpoint
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  period,
}: {
  title: string;
  subtitle?: string;
  period?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle ? <p className="text-sm text-ink-500 mt-1">{subtitle}</p> : null}
      </div>
      {period ? (
        <Badge tone="neutral" className="font-mono">
          {period}
        </Badge>
      ) : null}
    </div>
  );
}
