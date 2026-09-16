import Link from 'next/link';
import { SignupForm } from './signup-form';
import { resolveInvitation } from '@/lib/auth/invitations';
import { db } from '@/lib/db/client';
import { orgs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const metadata = { title: 'Start free · ClaimRail' };

interface SignupPageProps {
  searchParams: { email?: string; invite?: string };
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const inviteToken = searchParams.invite ?? '';
  const invite = inviteToken ? await resolveInvitation(inviteToken) : null;
  const inviteOrg = invite
    ? await db.select().from(orgs).where(eq(orgs.id, invite.orgId)).then((r) => r[0])
    : null;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900 tracking-tight">
          {invite ? `Join ${inviteOrg?.name ?? 'the team'}` : 'Start recovering credits'}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Log in
          </Link>
        </p>
      </div>
      <SignupForm
        defaultEmail={invite?.email ?? searchParams.email}
        emailLocked={Boolean(invite)}
        inviteToken={invite ? inviteToken : undefined}
        inviteOrgName={invite ? inviteOrg?.name ?? null : null}
      />
      <p className="text-xs text-ink-500 text-center">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="text-brand-700 hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-brand-700 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
