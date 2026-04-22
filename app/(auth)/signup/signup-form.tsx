'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { signupAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useFormState(signupAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required autoComplete="name" placeholder="Alex Smith" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="orgName">Company</Label>
          <Input id="orgName" name="orgName" required placeholder="Acme Inc." />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      <Submit>Create account</Submit>
    </form>
  );
}
