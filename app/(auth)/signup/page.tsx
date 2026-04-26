import Link from 'next/link';
import { SignupForm } from './signup-form';

export const metadata = { title: 'Start free · ClaimRail' };

export default function SignupPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900 tracking-tight">Start recovering credits</h1>
        <p className="mt-1 text-sm text-ink-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Log in
          </Link>
        </p>
      </div>
      <SignupForm />
      <p className="text-xs text-ink-500 text-center">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="text-brand-700 hover:underline">Terms</Link>
        {' '}and{' '}
        <Link href="/privacy" className="text-brand-700 hover:underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
