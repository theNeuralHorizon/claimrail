import Link from 'next/link';
import { ResetPasswordForm } from './reset-password-form';

export const metadata = { title: 'Reset password · ClaimRail' };

interface SearchParams {
  searchParams: { token?: string };
}

export default function ResetPasswordPage({ searchParams }: SearchParams) {
  const token = searchParams.token ?? '';
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900 tracking-tight">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Missing reset token. Request a new link from the forgot-password page.
        </div>
      )}
    </div>
  );
}
