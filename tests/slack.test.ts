import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDb = path.join(os.tmpdir(), `claimrail-slack-${nanoid(8)}.db`);
process.env.DATABASE_URL = tmpDb;
process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';

const { migrate } = await import('@/lib/db/migrate');
const { db } = await import('@/lib/db/client');
const { orgs } = await import('@/lib/db/schema');
const {
  saveSlackWebhook,
  getSlackWebhookUrl,
  disableSlackWebhook,
  sendSlackAlert,
  validateSlackWebhookUrl,
} = await import('@/lib/integrations/slack');

beforeAll(async () => {
  await migrate();
});
afterAll(() => {
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ok */
  }
});

describe('validateSlackWebhookUrl', () => {
  it('accepts a valid Slack URL', () => {
    expect(
      validateSlackWebhookUrl(
        'https://hooks.slack.com/services/T0000/B0000/XXXXXXXXXXXX',
      ).ok,
    ).toBe(true);
  });
  it.each([
    'http://hooks.slack.com/services/T/B/xxx', // http, not https
    'https://evil.com/services/T/B/xxx',
    'https://hooks.slack.com/otherpath',
    '',
  ])('rejects %s', (url) => {
    expect(validateSlackWebhookUrl(url).ok).toBe(false);
  });
});

describe('slack webhook storage', () => {
  it('save + read + disable round trip', async () => {
    const orgId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'S', slug: `s-${nanoid(6)}` });
    await saveSlackWebhook(
      orgId,
      'https://hooks.slack.com/services/T123/B456/ABCDEFGHIJ',
    );
    expect(await getSlackWebhookUrl(orgId)).toBe(
      'https://hooks.slack.com/services/T123/B456/ABCDEFGHIJ',
    );
    await disableSlackWebhook(orgId);
    expect(await getSlackWebhookUrl(orgId)).toBeNull();
  });

  it('fire-and-forget delivery swallows fetch errors', async () => {
    const orgId = nanoid(16);
    await db.insert(orgs).values({ id: orgId, name: 'S2', slug: `s2-${nanoid(6)}` });
    await saveSlackWebhook(
      orgId,
      'https://hooks.slack.com/services/T000/B000/XXXXXXXXXX',
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    try {
      // Should NOT throw — swallow + return false.
      const ok = await sendSlackAlert(orgId, {
        kind: 'test',
        title: 'hello',
        details: { x: '1' },
      });
      expect(ok).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
