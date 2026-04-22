'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { loginAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue="demo@claimrail.io"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          defaultValue="demo1234"
        />
      </div>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      <Submit>Sign in</Submit>
    </form>
  );
}
