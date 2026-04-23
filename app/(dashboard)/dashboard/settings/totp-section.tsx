'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  startTotpSetupAction,
  confirmTotpSetupAction,
  disableTotpAction,
  type TotpState,
} from '@/lib/auth/totp-actions';

const initial: TotpState = {};

function PendingBtn({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

export function TotpSection({ enabled }: { enabled: boolean }) {
  const [startState, startAction] = useFormState(startTotpSetupAction, initial);
  const [confirmState, confirmAction] = useFormState(confirmTotpSetupAction, initial);
  const [disableState, disableAction] = useFormState(disableTotpAction, initial);
  const [showBackup, setShowBackup] = useState(true);

  if (enabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone="success">Enabled</Badge>
          <span className="text-sm text-ink-600">
            Two-factor authentication is active on your account.
          </span>
        </div>
        <form action={disableAction} className="flex items-end gap-2">
          <div className="flex-1 max-w-sm space-y-1.5">
            <Label htmlFor="disable-password">Password</Label>
            <Input
              id="disable-password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" variant="danger" size="sm">Disable 2FA</Button>
        </form>
        {disableState?.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {disableState.error}
          </div>
        ) : null}
        {disableState?.success ? (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
            {disableState.success}
          </div>
        ) : null}
      </div>
    );
  }

  const secret = confirmState?.secret || startState.secret;
  const otpauthUri = confirmState?.otpauthUri || startState.otpauthUri;

  return (
    <div className="space-y-4">
      {confirmState?.success ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 space-y-2">
          <div className="text-sm font-medium text-brand-800">{confirmState.success}</div>
          {showBackup && confirmState.backupCodes ? (
            <div>
              <div className="text-xs font-medium text-brand-900">Backup codes</div>
              <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
                {confirmState.backupCodes.map((c) => (
                  <div
                    key={c}
                    className="rounded border border-brand-200 bg-white px-2 py-1"
                  >
                    {c}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-brand-900">
                Store these somewhere safe — each can be used once to sign in if you lose your authenticator.
              </div>
              <button
                type="button"
                onClick={() => setShowBackup(false)}
                className="mt-2 text-xs text-brand-800 underline"
              >
                I've saved them
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!secret && !confirmState?.success ? (
        <form action={startAction} className="flex items-end gap-2">
          <div className="flex-1 max-w-sm space-y-1.5">
            <Label htmlFor="setup-password">Confirm your password to start</Label>
            <Input
              id="setup-password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </div>
          <PendingBtn>Begin setup</PendingBtn>
        </form>
      ) : null}

      {startState.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {startState.error}
        </div>
      ) : null}

      {secret && otpauthUri && !confirmState?.success ? (
        <div className="rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-950/40 p-4 space-y-3">
          <div className="text-sm font-medium text-ink-900 dark:text-ink-100">
            Scan with your authenticator
          </div>
          <div className="text-xs text-ink-600 dark:text-ink-400">
            Use Google Authenticator, 1Password, Authy, or any RFC 6238 client.
          </div>
          <div className="rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 text-ink-800 dark:text-ink-200 p-3 font-mono text-xs break-all">
            {otpauthUri}
          </div>
          <div className="text-xs text-ink-600 dark:text-ink-400">
            Or enter this secret manually:{' '}
            <span className="font-mono text-ink-900 dark:text-ink-100">{secret}</span>
          </div>
          <form action={confirmAction} className="flex items-end gap-2">
            <input type="hidden" name="secret" value={secret} />
            <div className="flex-1 max-w-xs space-y-1.5">
              <Label htmlFor="totp-code">6-digit code</Label>
              <Input
                id="totp-code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </div>
            <PendingBtn>Activate 2FA</PendingBtn>
          </form>
          {confirmState?.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {confirmState.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
