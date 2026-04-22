'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { changePasswordAction, type ActionState } from '@/lib/auth/actions';

const initial: ActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Updating…' : 'Update password'}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePasswordAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            placeholder="12+ chars, 3 classes"
          />
        </div>
      </div>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      ) : null}
      {state?.success ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {state.success}
        </div>
      ) : null}
      <Submit />
    </form>
  );
}
