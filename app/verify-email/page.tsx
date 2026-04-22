import Link from 'next/link';
import { confirmEmailAction } from '@/lib/auth/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Verify email · ClaimRail' };

interface SearchParams {
  searchParams: { token?: string; sent?: string; error?: string };
}

export default function VerifyEmailPage({ searchParams }: SearchParams) {
  const token = searchParams.token;
  const sent = searchParams.sent === '1';
  const errorState = searchParams.error;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-ink-50">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>
              {errorState === 'invalid' ? 'Link is invalid or expired' : 'Check your email'}
            </CardTitle>
            <CardDescription>
              {errorState === 'invalid'
                ? 'Request a fresh verification link from Settings, or sign up again.'
                : sent
                  ? 'We just sent you a verification link. Click it to finish setting up your account.'
                  : "Your email isn't verified yet. Look for the link we emailed you."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-ink-600">
              Can't find it? Check spam, or request a new link from Settings.
            </p>
            <Link href="/dashboard" className="block">
              <Button variant="outline" className="w-full">Back to dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-ink-50">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Confirm your email</CardTitle>
          <CardDescription>
            Click the button below to finish verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={confirmEmailAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="primary" className="w-full">
              Confirm email
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
