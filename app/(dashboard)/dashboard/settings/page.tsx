import { requireAuth } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { logoutAllSessionsAction } from '@/lib/auth/actions';
import { verifyAuditChain } from '@/lib/audit/chain';

export const metadata = { title: 'Settings · ClaimRail' };

export default async function SettingsPage() {
  const ctx = await requireAuth();
  const cronUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/cron/probes`;
  const chainStatus = await verifyAuditChain(ctx.org.id);
  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Settings</h1>
        <p className="text-sm text-ink-500 mt-1">Organization and account preferences.</p>
      </div>
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
                <Badge tone="success" className="capitalize">
                  {ctx.org.plan}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input defaultValue={ctx.user.name} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input defaultValue={ctx.user.email} disabled />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div>
              <Badge tone="info" className="capitalize">{ctx.role}</Badge>
            </div>
          </div>
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
              <div className="text-sm font-medium text-ink-900">
                Sign out of all devices
              </div>
              <div className="text-xs text-ink-500">
                Revoke every active session for your account, including this browser.
              </div>
            </div>
            <form action={logoutAllSessionsAction}>
              <Button type="submit" variant="outline" size="sm">
                Log out everywhere
              </Button>
            </form>
          </div>
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-ink-100">
            <div>
              <div className="text-sm font-medium text-ink-900">
                Audit log integrity
              </div>
              <div className="text-xs text-ink-500">
                {chainStatus.checked} events verified via hash chain.
              </div>
            </div>
            <Badge tone={chainStatus.ok ? 'success' : 'danger'}>
              {chainStatus.ok ? 'Intact' : `Broken at #${chainStatus.brokenAtIndex}`}
            </Badge>
          </div>
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
