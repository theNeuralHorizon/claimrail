import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { claims, vendors } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Mail, FileDown } from 'lucide-react';
import { formatCents, formatUptime } from '@/lib/sla/engine';
import { format } from 'date-fns';
import { ClaimActions, CopyButton } from './claim-actions';

export const metadata = { title: 'Claim · ClaimRail' };

interface Params {
  params: { claimId: string };
}

export default async function ClaimDetailPage({ params }: Params) {
  const { claimId } = params;
  const ctx = await requireAuth();
  const row = await db
    .select({ c: claims, v: vendors })
    .from(claims)
    .innerJoin(vendors, eq(claims.vendorId, vendors.id))
    .where(and(eq(claims.id, claimId), eq(vendors.orgId, ctx.org.id)))
    .then((r) => r[0]);
  if (!row) notFound();
  const { c: claim, v: vendor } = row;

  const tone =
    claim.status === 'recovered'
      ? 'success'
      : claim.status === 'rejected'
        ? 'danger'
        : claim.status === 'filed' || claim.status === 'acknowledged'
          ? 'info'
          : 'warn';

  const mailto = `mailto:${vendor.contactEmail ?? ''}?subject=${encodeURIComponent(claim.emailSubject)}&body=${encodeURIComponent(claim.emailBody)}`;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Link
        href="/dashboard/claims"
        className="inline-flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Claims
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
            {vendor.name} · {claim.period}
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            Drafted {format(new Date(claim.createdAt * 1000), 'PPpp')}
          </p>
        </div>
        <Badge tone={tone} className="capitalize">{claim.status}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoBox label="Measured uptime" value={formatUptime(claim.measuredUptimePct)} />
        <InfoBox label="SLA threshold" value={`${claim.threshold}%`} />
        <InfoBox label="Credit tier" value={`${claim.creditPct}%`} />
        <InfoBox
          label="Estimated credit"
          value={formatCents(claim.estimatedCreditCents)}
          accent
        />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between flex-row">
          <div>
            <CardTitle>Draft email</CardTitle>
            <CardDescription>
              To: <span className="font-mono">{vendor.contactEmail ?? '(set contact email on vendor)'}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton text={`${claim.emailSubject}\n\n${claim.emailBody}`} />
            <a href={`/api/claims/${claim.id}/pdf`}>
              <Button variant="outline" size="sm">
                <FileDown className="h-3.5 w-3.5" /> Download PDF
              </Button>
            </a>
            <a href={mailto}>
              <Button variant="primary" size="sm">
                <Mail className="h-3.5 w-3.5" /> Open in email
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Subject</div>
            <div className="font-mono text-sm bg-ink-50 dark:bg-ink-950/60 text-ink-800 dark:text-ink-200 p-3 rounded-lg border border-ink-200 dark:border-ink-700">
              {claim.emailSubject}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">Body</div>
            <pre className="whitespace-pre-wrap font-mono text-xs bg-ink-50 dark:bg-ink-950/60 text-ink-800 dark:text-ink-200 p-4 rounded-lg border border-ink-200 dark:border-ink-700 max-h-[500px] overflow-y-auto">
              {claim.emailBody}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Update as you hear back from {vendor.name}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimActions
            claimId={claim.id}
            status={claim.status}
            recoveredCents={claim.recoveredCents ?? 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? 'border-brand-200 dark:border-brand-500/30 bg-brand-50/40 dark:bg-brand-500/10'
          : 'border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums font-mono ${
          accent ? 'text-brand-700 dark:text-brand-300' : 'text-ink-900 dark:text-ink-100'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
