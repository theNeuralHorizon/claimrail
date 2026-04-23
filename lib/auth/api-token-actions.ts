'use server';

import { z } from 'zod';
import { getAuthContext } from '@/lib/auth/session';
import { appendAuditEvent } from '@/lib/audit/chain';
import { issueApiToken, revokeApiToken } from './api-tokens';
import { rateLimit } from '@/lib/rate-limit';

export type ApiTokenState = {
  error?: string;
  success?: string;
  issued?: { rawToken: string; prefix: string; name: string };
};

const createSchema = z
  .object({
    name: z.string().min(1).max(64),
    scope: z.enum(['read', 'write']),
  })
  .strict();

export async function createApiTokenAction(
  _prev: ApiTokenState,
  formData: FormData,
): Promise<ApiTokenState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { error: 'Only admins can create API tokens.' };
  }
  const rl = rateLimit(`api-token:${ctx.org.id}`, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) return { error: 'Too many tokens created. Wait an hour.' };

  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    scope: formData.get('scope'),
  });
  if (!parsed.success) return { error: 'Name + scope required.' };

  const issued = await issueApiToken({
    orgId: ctx.org.id,
    createdBy: ctx.user.id,
    name: parsed.data.name,
    scope: parsed.data.scope,
  });
  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'api_token.create',
    resource: 'api_token',
    resourceId: issued.id,
    metadata: { name: issued.name, scope: issued.scope },
  });
  return {
    success: 'Token created. Copy it now — you won\'t see it again.',
    issued: {
      rawToken: issued.rawToken,
      prefix: issued.prefix,
      name: issued.name,
    },
  };
}

export async function revokeApiTokenAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return;
  const tokenId = String(formData.get('tokenId') ?? '');
  if (!tokenId) return;
  const ok = await revokeApiToken(ctx.org.id, tokenId);
  if (ok) {
    await appendAuditEvent({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: 'api_token.revoke',
      resource: 'api_token',
      resourceId: tokenId,
    });
  }
}
