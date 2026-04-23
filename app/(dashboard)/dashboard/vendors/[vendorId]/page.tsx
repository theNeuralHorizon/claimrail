import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { getVendorDetail } from '@/lib/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LatencyChart } from '@/components/features/uptime-chart';
import {
  ArrowLeft,
  ExternalLink,
  DollarSign,
  Clock,
  AlertTriangle,
  FileText,
  PlayCircle,
} from 'lucide-react';
import { formatCents, formatDuration, formatUptime } from '@/lib/sla/engine';
import { formatDistanceToNow } from 'date-fns';
import { GenerateClaimButton, RunProbeButton } from './actions-buttons';

export const metadata = { title: 'Vendor · ClaimRail' };

interface Params {
  params: { vendorId: string };
}

export default async function VendorDetailPage({ params }: Params) {
  const { vendorId } = params;
  const ctx = await requireAuth();
  const detail = await getVendorDetail(ctx.org.id, vendorId);
  if (!detail) notFound();

  const { vendor, tiers, incidents, probes, claims, currentReport, prevReport, breach } = detail;
  const latest = probes[0]?.status ?? 'unknown';

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link
          href="/dashboard/vendors"
          className="inline-flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Vendors
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-100 flex items-center gap-3">
              <StatusDot status={latest as 'up' | 'degraded' | 'down' | 'unknown'} />
              {vendor.name}
            </h1>
            <a
              href={vendor.monitorUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1"
            >
              {vendor.monitorUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <RunProbeButton vendorId={vendor.id} />
            {breach.hasBreach ? (
              <GenerateClaimButton
                vendorId={vendor.id}
                period={currentReport.period}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label={`Uptime · ${currentReport.period}`}
          value={formatUptime(currentReport.uptimePct)}
          hint={`${formatDuration(currentReport.downtimeSeconds)} down · ${currentReport.incidentCount} incidents`}
          icon={<Clock />}
          tone={breach.hasBreach ? 'warn' : 'success'}
        />
        <Stat
          label="Monthly spend"
          value={formatCents(vendor.monthlySpendCents)}
          icon={<DollarSign />}
        />
        <Stat
          label="Potential credit"
          value={formatCents(breach.estimatedCreditCents)}
          hint={
            breach.hasBreach
              ? `${breach.creditPct}% of monthly fees`
              : 'Meeting SLA this month'
          }
          icon={<AlertTriangle />}
          tone={breach.hasBreach ? 'success' : 'default'}
        />
        <Stat
          label={`Last month uptime`}
          value={formatUptime(prevReport.uptimePct)}
          hint={`${formatDuration(prevReport.downtimeSeconds)} down`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Latency · last 30 days</CardTitle>
              <CardDescription>
                One point per probe. Gaps are downtime.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LatencyChart
                points={probes.map((p) => ({
                  timestamp: p.checkedAt,
                  latencyMs: p.latencyMs,
                  status: p.status,
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Incidents</CardTitle>
              <CardDescription>Auto-detected outage windows.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {incidents.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-500 dark:text-ink-400">
                  No incidents in the last 90 days. 🎉
                </div>
              ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800 max-h-[400px] overflow-y-auto">
                  {incidents.map((i) => {
                    const tone =
                      i.severity === 'critical'
                        ? 'danger'
                        : i.severity === 'major'
                          ? 'warn'
                          : 'info';
                    return (
                      <li key={i.id} className="px-6 py-3 hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink-900 dark:text-ink-100 truncate">
                              {i.summary}
                            </div>
                            <div className="text-xs text-ink-500 dark:text-ink-400">
                              {formatDistanceToNow(new Date(i.startedAt * 1000), {
                                addSuffix: true,
                              })}{' '}
                              ·{' '}
                              {i.durationSeconds
                                ? formatDuration(i.durationSeconds)
                                : 'ongoing'}
                            </div>
                          </div>
                          <Badge tone={tone}>{i.severity}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>SLA tiers</CardTitle>
              <CardDescription>Applied in order of uptime threshold.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {tiers.length === 0 ? (
                <div className="p-5 text-sm text-ink-500 dark:text-ink-400">No tiers configured.</div>
              ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {tiers.map((t) => {
                    const active =
                      breach.hasBreach && breach.threshold === t.uptimeThresholdPct;
                    return (
                      <li
                        key={t.id}
                        className={`px-5 py-3 ${active ? 'bg-brand-50/40 dark:bg-brand-500/10' : ''}`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-mono text-ink-900 dark:text-ink-100">
                              &lt; {t.uptimeThresholdPct}%
                            </span>
                            <span className="text-ink-500 dark:text-ink-400 mx-2">→</span>
                            <span className="font-mono text-brand-700 dark:text-brand-400">
                              {t.creditPct}% credit
                            </span>
                          </div>
                          {active ? (
                            <Badge tone="success">Active</Badge>
                          ) : null}
                        </div>
                        {t.sourceExcerpt ? (
                          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1 italic truncate">
                            "{t.sourceExcerpt}"
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Claims</CardTitle>
              <CardDescription>Recovery history for this vendor.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {claims.length === 0 ? (
                <div className="p-5 text-sm text-ink-500 dark:text-ink-400">No claims yet.</div>
              ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {claims.map((c) => {
                    const tone =
                      c.status === 'recovered'
                        ? 'success'
                        : c.status === 'rejected'
                          ? 'danger'
                          : c.status === 'filed' || c.status === 'acknowledged'
                            ? 'info'
                            : 'warn';
                    return (
                      <li key={c.id} className="px-5 py-3">
                        <Link
                          href={`/dashboard/claims/${c.id}`}
                          className="flex items-center justify-between gap-3 hover:bg-ink-50/60 dark:hover:bg-ink-800/40 -mx-5 px-5 py-2 rounded-lg"
                        >
                          <div>
                            <div className="text-sm font-medium text-ink-900 dark:text-ink-100">
                              {c.period} · {formatCents(c.estimatedCreditCents)}
                            </div>
                            <div className="text-xs text-ink-500 dark:text-ink-400 capitalize">
                              {formatUptime(c.measuredUptimePct)} uptime · {c.creditPct}% credit tier
                            </div>
                          </div>
                          <Badge tone={tone} className="capitalize">
                            {c.status}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
