'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { resetPasswordAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Resetting…' : 'Reset password'}
    </Button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState(resetPasswordAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="At least 12 characters, 3 character classes"
        />
      </div>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      ) : null}
      <Submit />
    </form>
  );
}
