import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { memberships, users, invitations } from '@/lib/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { InviteForm, PendingInvites, MemberTable } from './team-controls';
import { format } from 'date-fns';

export const metadata = { title: 'Team · ClaimRail' };

export default async function TeamPage() {
  const ctx = await requireAuth();

  const [members, pendingInvites] = await Promise.all([
    db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.orgId, ctx.org.id))
      .orderBy(memberships.createdAt),
    db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.org.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt)),
  ]);

  const canManage = ctx.role === 'owner' || ctx.role === 'admin';
  const isOwner = ctx.role === 'owner';

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-200 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
              Team
            </h1>
            <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              {members.length} member{members.length === 1 ? '' : 's'} · {pendingInvites.length} pending invite{pendingInvites.length === 1 ? '' : 's'}
            </p>
          </div>
          <Badge tone="info" className="capitalize">
            You · {ctx.role}
          </Badge>
        </div>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>
              They'll get an email with a 7-day single-use link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Everyone with access to {ctx.org.name}.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <MemberTable
            currentUserId={ctx.user.id}
            isOwner={isOwner}
            members={members.map((m) => ({
              userId: m.userId,
              email: m.email,
              name: m.name,
              role: m.role,
              joinedAt: format(new Date(m.joinedAt * 1000), 'MMM d, yyyy'),
            }))}
          />
        </CardContent>
      </Card>

      {pendingInvites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
            <CardDescription>Haven't been accepted yet.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PendingInvites
              canManage={canManage}
              invites={pendingInvites.map((i) => ({
                id: i.id,
                email: i.email,
                role: i.role,
                sentAt: format(new Date(i.createdAt * 1000), 'MMM d, yyyy'),
                expiresAt: format(new Date(i.expiresAt * 1000), 'MMM d, yyyy'),
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
