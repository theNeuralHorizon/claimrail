import { requireAuth } from '@/lib/auth/session';
import {
  getDashboardSummary,
  getRecentIncidents,
  getVendorOverviews,
  getMonthlyRecovery,
  getDailyUptime,
} from '@/lib/queries';
import { RecoveryChart } from '@/components/features/recovery-chart';
import { OnboardingChecklist, type OnboardingStep } from '@/components/features/onboarding';
import { UptimeSparkline } from '@/components/features/uptime-sparkline';
import { db } from '@/lib/db/client';
import { integrations, memberships, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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
  ArrowUpRight,
  Plus,
  Users,
  Slack,
} from 'lucide-react';
import Link from 'next/link';
import { formatCents, formatDuration, formatUptime } from '@/lib/sla/engine';
import { formatDistanceToNow } from 'date-fns';

export const metadata = { title: 'Overview · ClaimRail' };

export default async function DashboardPage() {
  const ctx = await requireAuth();

  // Fan out every independent query in parallel — none of these depend on
  // each other, only on ctx.org.id / ctx.user.id. Cuts page load from 7×
  // serial round-trips to a single round-trip's worth of latency.
  const [summary, overviews, recentIncidents, recovery, slackRow, memberCount, me] =
    await Promise.all([
      getDashboardSummary(ctx.org.id),
      getVendorOverviews(ctx.org.id),
      getRecentIncidents(ctx.org.id, 5),
      getMonthlyRecovery(ctx.org.id, 6),
      db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.orgId, ctx.org.id),
            eq(integrations.kind, 'slack_webhook'),
            eq(integrations.enabled, true),
          ),
        )
        .then((r) => r[0]),
      db.select().from(memberships).where(eq(memberships.orgId, ctx.org.id)),
      db.select().from(users).where(eq(users.id, ctx.user.id)).then((r) => r[0]),
    ]);

  // Sparklines depend on `overviews`. Already parallel via Promise.all.
  const sparklines = await Promise.all(
    overviews.map(async (o) => ({
      vendorId: o.vendor.id,
      points: await getDailyUptime(o.vendor.id, 7),
    })),
  );
  const sparkMap = new Map(sparklines.map((s) => [s.vendorId, s.points]));

  const onboarding: OnboardingStep[] = [
    {
      id: 'verify',
      label: 'Verify your email',
      hint: 'We sent you a link when you signed up.',
      href: '/dashboard/settings',
      done: me?.emailVerifiedAt != null,
    },
    {
      id: 'vendor',
      label: 'Add your first vendor',
      hint: "Paste an SLA and we'll parse the tiers.",
      href: '/dashboard/vendors/new',
      done: overviews.length > 0,
    },
    {
      id: 'sla',
      label: 'Parse your first SLA',
      hint: 'At least one vendor with a tier configured.',
      href: '/dashboard/vendors',
      done: overviews.some((o) => o.tiers.length > 0),
    },
    {
      id: 'slack',
      label: 'Connect Slack',
      hint: 'Get pinged the moment a claim is drafted.',
      href: '/dashboard/settings',
      done: slackRow != null,
    },
    {
      id: 'team',
      label: 'Invite a teammate',
      hint: 'Finance, procurement, or whoever wants the money back.',
      href: '/dashboard/settings/team',
      done: memberCount.length > 1,
    },
    {
      id: 'twofa',
      label: 'Turn on two-factor auth',
      hint: 'Protects your account if a password leaks.',
      href: '/dashboard/settings',
      done: me?.totpEnabledAt != null,
    },
  ];

  const heroRecoveryPoints = recovery.map((r) => ({
    period: r.period,
    Drafted: r.draftedCents / 100,
    Filed: r.filedCents / 100,
    Recovered: r.recoveredCents / 100,
  }));
  const heroHasAny = heroRecoveryPoints.some((p) => p.Drafted + p.Filed + p.Recovered > 0);

  return (
    <div className="px-6 md:px-8 py-6 md:py-8 space-y-6 max-w-[1400px]">
      <PageHeader
        title="Overview"
        subtitle={`Welcome back, ${ctx.user.name.split(' ')[0]}. Here's where ${ctx.org.name} stands this month.`}
        period={summary.period}
      />

      <OnboardingChecklist steps={onboarding} />

      {/* Hero row: primary metric gets 2 columns, secondary stats share the other. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <Stat
            label="Potential credit · this month"
            value={formatCents(summary.potentialCreditCents)}
            hint={
              summary.atRiskVendors > 0
                ? `${summary.atRiskVendors} vendor${summary.atRiskVendors === 1 ? '' : 's'} breaching SLA right now`
                : 'Every vendor is currently inside their SLA.'
            }
            icon={<DollarSign />}
            size="lg"
            tone={summary.potentialCreditCents > 0 ? 'success' : 'default'}
          />
        </div>
        <Stat
          label="Avg uptime"
          value={formatUptime(summary.avgUptimePct)}
          hint="weighted across vendors"
          icon={<TrendingUp />}
          tone={summary.avgUptimePct >= 99.9 ? 'success' : summary.avgUptimePct >= 99 ? 'default' : 'warn'}
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
          {/* Recovery chart */}
          <Card>
            <CardHeader className="flex items-start justify-between flex-row">
              <div>
                <CardTitle>Recovery funnel</CardTitle>
                <CardDescription>
                  Credit amounts by claim stage, last 6 months.
                </CardDescription>
              </div>
              {heroHasAny ? (
                <Link href="/dashboard/claims">
                  <Button variant="ghost" size="sm">
                    All claims <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              ) : null}
            </CardHeader>
            <CardContent>
              <RecoveryChart data={recovery} />
            </CardContent>
          </Card>

          {/* Vendor uptime table */}
          <Card>
            <CardHeader className="flex items-start justify-between flex-row">
              <div>
                <CardTitle>Vendors · {summary.period}</CardTitle>
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
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {overviews.map((o) => {
                  const threshold =
                    o.tiers.length > 0
                      ? Math.max(...o.tiers.map((t) => t.uptimeThresholdPct))
                      : 99.9;
                  return (
                    <li key={o.vendor.id}>
                      <Link
                        href={`/dashboard/vendors/${o.vendor.id}`}
                        className="block px-6 py-3.5 hover:bg-ink-50/70 dark:hover:bg-ink-800/40 transition-colors"
                      >
                        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4">
                          <StatusDot status={o.latestProbeStatus} />
                          <div className="min-w-0">
                            <div className="font-medium text-ink-900 dark:text-ink-100 truncate">
                              {o.vendor.name}
                            </div>
                            <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-ink-700 dark:text-ink-300 tabular-nums">
                                {formatUptime(o.uptimePct)}
                              </span>
                              <span className="text-ink-300 dark:text-ink-600">·</span>
                              <span>
                                {o.incidentCount} incident{o.incidentCount === 1 ? '' : 's'}
                              </span>
                              <span className="text-ink-300 dark:text-ink-600">·</span>
                              <span>{formatDuration(o.downtimeSeconds)} down</span>
                            </div>
                          </div>
                          <div className="hidden sm:block w-24">
                            <UptimeSparkline
                              points={sparkMap.get(o.vendor.id) ?? []}
                              threshold={threshold}
                            />
                          </div>
                          <div className="justify-self-end">
                            {o.breach.hasBreach ? (
                              <Badge tone="success" className="shrink-0">
                                {formatCents(o.breach.estimatedCreditCents)} owed
                              </Badge>
                            ) : (
                              <Badge tone="neutral" className="shrink-0">
                                Meeting SLA
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {overviews.length === 0 ? (
                  <li className="p-10 text-center text-sm text-ink-500 dark:text-ink-400">
                    <p>No vendors yet.</p>
                    <Link href="/dashboard/vendors/new" className="mt-3 inline-block">
                      <Button variant="primary" size="sm">Add your first vendor</Button>
                    </Link>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-start justify-between flex-row">
              <div>
                <CardTitle>Recent incidents</CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </div>
              <Link href="/dashboard/incidents">
                <Button variant="ghost" size="sm">
                  All <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {recentIncidents.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-500 dark:text-ink-400">
                  Nothing recent. 🎉
                </div>
              ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
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
                      <li
                        key={incident.id}
                        className="px-5 py-3 hover:bg-ink-50/70 dark:hover:bg-ink-800/40"
                      >
                        <div className="flex items-start gap-3">
                          <AlertCircle className="h-4 w-4 text-ink-400 dark:text-ink-500 mt-0.5 flex-none" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-ink-900 dark:text-ink-100 truncate">
                                {vendor.name}
                              </div>
                              <Badge tone={tone} className="text-[10px] shrink-0">
                                {incident.severity}
                              </Badge>
                            </div>
                            <div className="text-xs text-ink-500 dark:text-ink-400 truncate mt-0.5">
                              {ago}
                              {' · '}
                              {incident.durationSeconds
                                ? formatDuration(incident.durationSeconds)
                                : 'ongoing'}
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
              <CardTitle>Act on this</CardTitle>
              <CardDescription>Things you can do right now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard/vendors/new" className="block">
                <Button variant="primary" size="md" className="w-full justify-start">
                  <Plus className="h-4 w-4" />
                  Add a vendor
                </Button>
              </Link>
              <Link href="/dashboard/claims" className="block">
                <Button variant="outline" size="md" className="w-full justify-start">
                  <FileText className="h-4 w-4" />
                  Review {summary.openClaims} open claim{summary.openClaims === 1 ? '' : 's'}
                </Button>
              </Link>
              {!slackRow ? (
                <Link href="/dashboard/settings" className="block">
                  <Button variant="ghost" size="md" className="w-full justify-start">
                    <Slack className="h-4 w-4" />
                    Connect Slack
                  </Button>
                </Link>
              ) : (
                <Link href="/dashboard/settings/team" className="block">
                  <Button variant="ghost" size="md" className="w-full justify-start">
                    <Users className="h-4 w-4" />
                    Invite a teammate
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          {summary.atRiskVendors > 0 ? (
            <Card className="border-brand-200 dark:border-brand-800/60 bg-gradient-to-br from-brand-50/60 to-white dark:from-brand-900/20 dark:to-ink-900">
              <CardHeader>
                <CardTitle>Draft claims now</CardTitle>
                <CardDescription>
                  {summary.atRiskVendors} vendor{summary.atRiskVendors === 1 ? ' is' : 's are'} breaching SLA this month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight tabular-nums text-brand-700 dark:text-brand-300">
                  {formatCents(summary.potentialCreditCents)}
                </div>
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                  waiting to be claimed
                </div>
                <Link href="/dashboard/vendors" className="mt-4 block">
                  <Button variant="primary" size="sm" className="w-full">
                    Review at-risk vendors <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : null}
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1 max-w-2xl">{subtitle}</p>
        ) : null}
      </div>
      {period ? (
        <div className="inline-flex items-center gap-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 px-3 h-9 text-xs">
          <span className="text-ink-500 dark:text-ink-400">Billing period</span>
          <span className="font-mono font-medium text-ink-900 dark:text-ink-100 tabular-nums">
            {period}
          </span>
        </div>
      ) : null}
    </div>
  );
}
