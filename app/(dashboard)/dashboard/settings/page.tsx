import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { logoutAllSessionsAction, resendVerificationForm } from '@/lib/auth/actions';
import { verifyAuditChain } from '@/lib/audit/chain';
import { db } from '@/lib/db/client';
import { users, integrations, apiTokens } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { ChangePasswordForm } from './change-password-form';
import { TotpSection } from './totp-section';
import { SlackSection } from './slack-section';
import { ApiTokensSection } from './api-tokens-section';
import { format } from 'date-fns';

export const metadata = { title: 'Settings · ClaimRail' };

export default async function SettingsPage() {
  const ctx = await requireAuth();
  const cronUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/cron/probes`;
  const chainStatus = await verifyAuditChain(ctx.org.id);
  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).get();
  const emailVerified = user?.emailVerifiedAt != null;
  const totpEnabled = user?.totpEnabledAt != null;

  const slackRow = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.orgId, ctx.org.id), eq(integrations.kind, 'slack_webhook'), eq(integrations.enabled, true)))
    .get();

  const tokens = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.orgId, ctx.org.id))
    .orderBy(desc(apiTokens.createdAt))
    .limit(20)
    .all();

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500 mt-1">
          Organization, account, and security preferences.
        </p>
      </div>

      {!emailVerified ? (
        <div className="rounded-xl border border-amber-200 bg-warn-50 p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-warn-600">
              Verify your email to unlock everything
            </div>
            <div className="text-xs text-warn-600 mt-0.5">
              We sent a link to {ctx.user.email}. Click it, or request a new one.
            </div>
          </div>
          <form action={resendVerificationForm}>
            <Button type="submit" variant="outline" size="sm">Resend</Button>
          </form>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your current workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input defaultValue={ctx.org.name} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <div className="h-10 flex items-center">
                <Badge tone="success" className="capitalize">{ctx.org.plan}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in as {ctx.user.email}{' '}
            {emailVerified ? (
              <Badge tone="success" className="ml-2">Verified</Badge>
            ) : (
              <Badge tone="warn" className="ml-2">Unverified</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input defaultValue={ctx.user.name} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="h-10 flex items-center">
                <Badge tone="info" className="capitalize">{ctx.role}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing your password signs out every other active session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Require a rotating 6-digit code in addition to your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TotpSection enabled={totpEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Session and audit-log controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink-900">Sign out of all devices</div>
              <div className="text-xs text-ink-500">
                Revoke every active session for your account, including this browser.
              </div>
            </div>
            <form action={logoutAllSessionsAction}>
              <Button type="submit" variant="outline" size="sm">Log out everywhere</Button>
            </form>
          </div>
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-ink-100">
            <div>
              <div className="text-sm font-medium text-ink-900">Audit log integrity</div>
              <div className="text-xs text-ink-500">
                {chainStatus.checked} events verified via hash chain.{' '}
                <Link href="/dashboard/settings/audit" className="text-brand-700 hover:underline">
                  View log →
                </Link>
              </div>
            </div>
            <Badge tone={chainStatus.ok ? 'success' : 'danger'}>
              {chainStatus.ok ? 'Intact' : `Broken at #${chainStatus.brokenAtIndex}`}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-ink-100">
            <div>
              <div className="text-sm font-medium text-ink-900">Security events</div>
              <div className="text-xs text-ink-500">
                Adversarial activity and defense triggers.{' '}
                <Link href="/dashboard/settings/security" className="text-brand-700 hover:underline">
                  View events →
                </Link>
              </div>
            </div>
            <Badge tone="info">Live</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>Invite teammates and manage roles.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/settings/team">
            <Button variant="outline" size="sm">Manage team →</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slack alerts</CardTitle>
          <CardDescription>
            {slackRow ? 'Connected. Sending alerts to your workspace.' : 'Get an alert in Slack on breaches, claim drafts, and anomalies.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SlackSection connected={!!slackRow} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API tokens</CardTitle>
          <CardDescription>
            Programmatic access to <code className="font-mono text-xs">/api/v1/*</code>. Keep these secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiTokensSection tokens={tokens.map((t) => ({
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            scope: t.scope,
            createdAt: t.createdAt,
            lastUsedAt: t.lastUsedAt ?? null,
            // Format server-side with a locale-independent pattern — the
            // client would render `toLocaleString()` with its own locale,
            // blowing up React's hydration check.
            lastUsedLabel: t.lastUsedAt
              ? format(new Date(t.lastUsedAt * 1000), 'MMM d, yyyy · HH:mm')
              : 'never',
            revokedAt: t.revokedAt ?? null,
          }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Probing</CardTitle>
          <CardDescription>
            Hit this endpoint on a schedule (every 5 min recommended) to run probes.
            Use GitHub Actions, Vercel Cron, or any scheduler you trust.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Cron URL</Label>
          <div className="font-mono text-xs bg-ink-50 p-3 rounded-lg border border-ink-200 break-all">
            {cronUrl}
          </div>
          <div className="text-xs text-ink-500">
            Pass <code className="font-mono bg-ink-100 px-1 py-0.5 rounded">Authorization: Bearer $CRON_SECRET</code> header.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
