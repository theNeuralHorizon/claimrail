'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useRef } from 'react';
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
  const mountRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (mountRef.current) mountRef.current.value = String(Date.now());
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      {/* Honeypot — the label is hidden from humans. Bots submit every
          field they can find, so a non-empty value here marks the
          submission as automated. Visually hidden but still in the DOM
          so naive scrapers find it. */}
      <div
        aria-hidden
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
      >
        <label htmlFor="company_website">Company website (leave blank)</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      {/* Mount timestamp — used server-side to reject too-fast submissions. */}
      <input
        ref={mountRef}
        type="hidden"
        name="formMountedAt"
        defaultValue=""
      />

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
          minLength={12}
          autoComplete="new-password"
          placeholder="12+ chars, 3 character classes"
        />
      </div>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      {state?.success ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          {state.success}
        </div>
      ) : null}
      <Submit>Create account</Submit>
    </form>
  );
}
