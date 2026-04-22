import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="text-7xl font-bold gradient-text">404</div>
        <h1 className="mt-4 text-2xl font-semibold text-ink-900">Page not found</h1>
        <p className="mt-2 text-ink-600">
          The page you're looking for has been moved, deleted, or never existed.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/">
            <Button variant="outline">Home</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="primary">Dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
