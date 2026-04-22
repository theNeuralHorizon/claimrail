import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata = { title: 'Forgot password · ClaimRail' };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900 tracking-tight">
          Forgot password
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Enter your email and we'll send you a reset link.{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
