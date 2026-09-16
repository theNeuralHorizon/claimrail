'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRef } from 'react';
import Link from 'next/link';
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

export interface LoginFormProps {
  defaultEmail?: string;
  /** True when the email came from an invite link — locked so the login
   * stays for the account the invite was actually sent to. */
  emailLocked?: boolean;
  inviteToken?: string;
}

export function LoginForm({ defaultEmail, emailLocked = false, inviteToken }: LoginFormProps) {
  const [state, formAction] = useFormState(loginAction, initial);
  const requiresTotp = state?.requiresTotp === true;
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  return (
    <form action={formAction} className="space-y-4">
      {inviteToken ? <input type="hidden" name="invite" value={inviteToken} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          defaultValue={defaultEmail}
          readOnly={requiresTotp || emailLocked}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-[10px] uppercase tracking-wider text-ink-500 hover:text-ink-900">
            Forgot?
          </Link>
        </div>
        <Input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          readOnly={requiresTotp}
        />
      </div>
      {requiresTotp ? (
        <div className="space-y-1.5 animate-slide-up">
          <Label htmlFor="totpCode">2FA code</Label>
          <Input
            id="totpCode"
            name="totpCode"
            type="text"
            autoComplete="one-time-code"
            placeholder="6-digit code or a backup code"
            autoFocus
          />
          <p className="text-xs text-ink-500">
            Enter the code from your authenticator, or one of your backup codes.
          </p>
        </div>
      ) : null}
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      <Submit>{requiresTotp ? 'Verify and sign in' : 'Sign in'}</Submit>
      {!requiresTotp && !inviteToken ? (
        <button
          type="button"
          onClick={() => {
            if (emailRef.current) emailRef.current.value = 'demo@claimrail.io';
            if (passwordRef.current) passwordRef.current.value = 'DemoRail!2026';
            passwordRef.current?.focus();
          }}
          className="block w-full text-center text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100"
        >
          Use demo credentials
        </button>
      ) : null}
    </form>
  );
}
