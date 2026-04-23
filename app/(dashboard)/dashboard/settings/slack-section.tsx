'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  saveSlackWebhookAction,
  disableSlackWebhookAction,
  type IntegrationState,
} from '@/lib/integrations/actions';

const initial: IntegrationState = {};

function SaveBtn({ connected }: { connected: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Saving…' : connected ? 'Update URL' : 'Connect Slack'}
    </Button>
  );
}

export function SlackSection({ connected }: { connected: boolean }) {
  const [state, formAction] = useFormState(saveSlackWebhookAction, initial);
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="slack-url">Incoming webhook URL</Label>
          <Input
            id="slack-url"
            name="url"
            type="url"
            required
            placeholder="https://hooks.slack.com/services/T000/B000/xxxx"
          />
        </div>
        <SaveBtn connected={connected} />
      </form>
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
      {connected ? (
        <form action={disableSlackWebhookAction}>
          <Button type="submit" variant="ghost" size="sm" className="text-danger-600">
            Disconnect
          </Button>
        </form>
      ) : null}
      <div className="text-xs text-ink-500 dark:text-ink-400">
        We'll post to this channel when a claim is drafted, a breach is detected,
        or an impossible-travel login is flagged.
      </div>
    </div>
  );
}
