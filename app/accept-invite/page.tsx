import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveInvitation } from '@/lib/auth/invitations';
import { getAuthContext } from '@/lib/auth/session';
import { acceptInviteExistingUser } from '@/lib/auth/team-actions';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Accept invite · ClaimRail' };

interface SearchParams {
  searchParams: { token?: string };
}

export default async function AcceptInvitePage({ searchParams }: SearchParams) {
  const token = searchParams.token ?? '';
  if (!token) {
    return <Shell title="Missing token" description="Your invite link is incomplete. Ask the person who invited you for a fresh link." />;
  }

  const invite = await resolveInvitation(token);
  if (!invite) {
    return <Shell title="This invite is no longer valid" description="It may have been revoked, already accepted, or expired after 7 days." />;
  }

  const org = await db.select().from(orgs).where(eq(orgs.id, invite.orgId)).then((r) => r[0]);
  const ctx = await getAuthContext();

  // If the current session matches the invite email, one-click accept.
  if (ctx && ctx.user.email.toLowerCase() === invite.email) {
    const result = await acceptInviteExistingUser(token);
    if (result.ok) redirect('/dashboard?joined=1');
  }

  return (
    <Shell
      title={`Join ${org?.name ?? 'this team'} on ClaimRail`}
      description={`You've been invited as ${invite.role}. Accept by signing up with ${invite.email} — or sign in to that account.`}
    >
      <div className="flex flex-col gap-2">
        <Link href={`/signup?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(token)}`}>
          <Button variant="primary" className="w-full">
            Create account to accept
          </Button>
        </Link>
        <Link href={`/login?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(token)}`}>
          <Button variant="outline" className="w-full">
            I already have a ClaimRail account
          </Button>
        </Link>
      </div>
      {ctx && ctx.user.email.toLowerCase() !== invite.email ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-warn-50 p-3 text-xs text-warn-600">
          You're currently signed in as <b>{ctx.user.email}</b>, but this invite is for{' '}
          <b>{invite.email}</b>. Sign out and accept from the right account.
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-ink-50 dark:bg-ink-950">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
