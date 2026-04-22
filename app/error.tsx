'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side report hook (Sentry, etc.) could attach here.
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="text-6xl">⚠</div>
        <h1 className="mt-4 text-2xl font-semibold text-ink-900">Something broke</h1>
        <p className="mt-2 text-ink-600">
          We've been notified. Try reloading, or head back to the dashboard.
        </p>
        {error.digest ? (
          <div className="mt-3 inline-block text-xs font-mono bg-ink-100 text-ink-600 px-2 py-1 rounded">
            Error ID: {error.digest}
          </div>
        ) : null}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
          <Link href="/dashboard">
            <Button variant="primary">Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
