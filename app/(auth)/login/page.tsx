import Link from 'next/link';
import { LoginForm } from './login-form';
import { resolveInvitation } from '@/lib/auth/invitations';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const metadata = { title: 'Log in · ClaimRail' };

interface LoginPageProps {
  searchParams: { reset?: string; email?: string; invite?: string };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const justReset = searchParams.reset === '1';
  const inviteToken = searchParams.invite ?? '';
  const invite = inviteToken ? await resolveInvitation(inviteToken) : null;
  const inviteOrg = invite
    ? await db.select().from(orgs).where(eq(orgs.id, invite.orgId)).then((r) => r[0])
    : null;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900 tracking-tight">
          {invite ? `Sign in to join ${inviteOrg?.name ?? 'the team'}` : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Don't have an account yet?{' '}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            Start free
          </Link>
        </p>
      </div>
      {justReset ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Password reset. Sign in with your new password below.
        </div>
      ) : null}
      <LoginForm
        defaultEmail={invite?.email ?? searchParams.email}
        emailLocked={Boolean(invite)}
        inviteToken={invite ? inviteToken : undefined}
      />
      {!invite ? (
        <div className="rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-3 text-xs text-brand-900">
          <b>Demo workspace available.</b>{' '}
          Click "Use demo credentials" below to explore — six vendors, real
          probe data, sample claims. Or{' '}
          <Link href="/signup" className="font-medium underline">
            start fresh →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
