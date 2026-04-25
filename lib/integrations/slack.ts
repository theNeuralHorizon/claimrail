/**
 * Slack webhook delivery.
 *
 * The customer stores an "Incoming Webhook" URL in Settings. We encrypt
 * it at rest (AES-GCM, same `AUTH_SECRET`-derived key as TOTP seeds) so
 * a DB leak doesn't immediately hand the attacker a way to spam their
 * Slack.
 *
 * Outbound delivery is fire-and-forget: a failed POST is logged but never
 * blocks the triggering request. Slack's default incoming-webhook endpoint
 * accepts JSON on https://hooks.slack.com/services/… so we validate the
 * URL shape at save time.
 */
import { db } from '@/lib/db/client';
import { integrations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptFromJson, encryptToJson } from '@/lib/security/crypto';
import { safeForLog } from '@/lib/security/sanitize';

const SLACK_URL_REGEX = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9/]+$/;

export function validateSlackWebhookUrl(url: string): { ok: boolean; reason?: string } {
  if (!url) return { ok: false, reason: 'URL required' };
  if (url.length > 300) return { ok: false, reason: 'URL too long' };
  if (!SLACK_URL_REGEX.test(url)) {
    return {
      ok: false,
      reason: 'Not a Slack Incoming Webhook URL (expected https://hooks.slack.com/services/...)',
    };
  }
  return { ok: true };
}

export async function saveSlackWebhook(orgId: string, url: string): Promise<void> {
  const existing = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.kind, 'slack_webhook')))
    .then((r) => r[0]);
  const configEncrypted = encryptToJson(JSON.stringify({ url }));
  if (existing) {
    await db
      .update(integrations)
      .set({ configEncrypted, enabled: true })
      .where(eq(integrations.id, existing.id))
      ;
  } else {
    const { nanoid } = await import('nanoid');
    await db
      .insert(integrations)
      .values({
        id: nanoid(16),
        orgId,
        kind: 'slack_webhook',
        configEncrypted,
      })
      ;
  }
}

export async function disableSlackWebhook(orgId: string): Promise<void> {
  await db
    .update(integrations)
    .set({ enabled: false })
    .where(and(eq(integrations.orgId, orgId), eq(integrations.kind, 'slack_webhook')))
    ;
}

export async function getSlackWebhookUrl(orgId: string): Promise<string | null> {
  const row = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.orgId, orgId),
        eq(integrations.kind, 'slack_webhook'),
        eq(integrations.enabled, true),
      ),
    )
    .then((r) => r[0]);
  if (!row) return null;
  try {
    const parsed = JSON.parse(decryptFromJson(row.configEncrypted)) as { url: string };
    return parsed.url ?? null;
  } catch {
    return null;
  }
}

export interface SlackAlert {
  kind: 'breach_detected' | 'claim_drafted' | 'impossible_travel' | 'new_device' | 'test';
  title: string;
  details?: Record<string, string | number>;
  link?: string;
}

function renderSlackMessage(alert: SlackAlert): Record<string, unknown> {
  const fields = Object.entries(alert.details ?? {}).map(([k, v]) => ({
    title: k,
    value: String(v),
    short: true,
  }));
  const colorMap: Record<SlackAlert['kind'], string> = {
    breach_detected: '#dc2626',
    claim_drafted: '#10b981',
    impossible_travel: '#dc2626',
    new_device: '#f59e0b',
    test: '#64748b',
  };
  return {
    attachments: [
      {
        color: colorMap[alert.kind],
        title: `ClaimRail · ${alert.title}`,
        title_link: alert.link,
        fields,
        ts: Math.floor(Date.now() / 1000),
        footer: 'ClaimRail',
      },
    ],
  };
}

/**
 * Deliver an alert to the org's Slack webhook, if configured. Errors are
 * logged but swallowed — we never fail a user-facing action because Slack
 * is down.
 */
export async function sendSlackAlert(orgId: string, alert: SlackAlert): Promise<boolean> {
  const url = await getSlackWebhookUrl(orgId);
  if (!url) return false;
  const body = renderSlackMessage(alert);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[slack] delivery failed status=${res.status} kind=${safeForLog(alert.kind)}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[slack] delivery threw err=${safeForLog(msg)} kind=${safeForLog(alert.kind)}`);
    return false;
  }
}
