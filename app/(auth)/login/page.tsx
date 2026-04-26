import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata = { title: 'Log in · ClaimRail' };

export default function LoginPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold text-ink-900 tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-600">
          Don't have an account yet?{' '}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            Start free
          </Link>
        </p>
      </div>
      <LoginForm />
      <div className="rounded-lg border border-dashed border-brand-200 bg-brand-50/40 p-3 text-xs text-brand-900">
        <b>👋 Demo workspace pre-loaded.</b>{' '}
        Sign in above to explore — six vendors, real probe data, sample
        claims. Or{' '}
        <Link href="/signup" className="font-medium underline">
          start fresh →
        </Link>
      </div>
    </div>
  );
}
