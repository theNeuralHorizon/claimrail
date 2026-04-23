'use server';

import { z } from 'zod';
import { getAuthContext } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { appendAuditEvent } from '@/lib/audit/chain';
import {
  disableSlackWebhook,
  saveSlackWebhook,
  sendSlackAlert,
  validateSlackWebhookUrl,
} from './slack';

export type IntegrationState = { error?: string; success?: string };

const slackSchema = z
  .object({ url: z.string().url().max(300) })
  .strict();

export async function saveSlackWebhookAction(
  _prev: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  const rl = rateLimit(`slack-save:${ctx.org.id}`, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) return { error: 'Too many changes. Try again in an hour.' };

  const parsed = slackSchema.safeParse({ url: formData.get('url') });
  if (!parsed.success) return { error: 'A valid URL is required.' };
  const check = validateSlackWebhookUrl(parsed.data.url);
  if (!check.ok) return { error: check.reason };

  await saveSlackWebhook(ctx.org.id, parsed.data.url);
  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'integration.slack.save',
    resource: 'integration',
    resourceId: 'slack',
  });
  // Send a test message so the customer sees it arrive immediately.
  const delivered = await sendSlackAlert(ctx.org.id, {
    kind: 'test',
    title: 'Connected to ClaimRail',
    details: { status: 'Webhook verified.' },
  });
  return {
    success: delivered
      ? 'Saved. A test message is in your Slack channel.'
      : 'Saved. (We could not deliver a test message — check the webhook URL.)',
  };
}

export async function disableSlackWebhookAction(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  await disableSlackWebhook(ctx.org.id);
  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'integration.slack.disable',
    resource: 'integration',
    resourceId: 'slack',
  });
}
