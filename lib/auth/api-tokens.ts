/**
 * Programmatic API tokens.
 *
 * Format: `crt_<20 base32 chars>` (displayed once, stored as HMAC digest
 * like other tokens). Scope is `read` or `write`. Revoke = set
 * `revoked_at`; no hard delete so the audit trail stays intact.
 */
import { db } from '@/lib/db/client';
import { apiTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { digestToken, generateRandomToken } from '@/lib/security/crypto';

export interface IssuedApiToken {
  id: string;
  name: string;
  scope: 'read' | 'write';
  rawToken: string; // shown once
  prefix: string;
}

const PREFIX = 'crt_';

export async function issueApiToken(input: {
  orgId: string;
  createdBy: string;
  name: string;
  scope: 'read' | 'write';
}): Promise<IssuedApiToken> {
  // Use base32 via generateRandomToken-like approach but keep the output
  // URL-safe and copy/paste friendly.
  const body = generateRandomToken(24); // 32 chars base64url
  const rawToken = `${PREFIX}${body}`;
  const id = nanoid(16);
  const prefix = rawToken.slice(0, 12);
  const tokenHash = digestToken(rawToken);
  await db
    .insert(apiTokens)
    .values({
      id,
      orgId: input.orgId,
      createdBy: input.createdBy,
      name: input.name.slice(0, 64),
      prefix,
      tokenHash,
      scope: input.scope,
    })
    .run();
  return { id, name: input.name, scope: input.scope, rawToken, prefix };
}

export async function revokeApiToken(orgId: string, tokenId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .update(apiTokens)
    .set({ revokedAt: now })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.orgId, orgId), isNull(apiTokens.revokedAt)))
    .returning()
    .all();
  return res.length > 0;
}

export interface ResolvedApiToken {
  orgId: string;
  scope: 'read' | 'write';
  tokenId: string;
}

/**
 * Resolve a raw token from the `Authorization: Bearer …` header. Looks up
 * the HMAC digest, checks it isn't revoked, and bumps lastUsedAt.
 */
export async function resolveApiToken(raw: string): Promise<ResolvedApiToken | null> {
  if (!raw.startsWith(PREFIX)) return null;
  const row = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, digestToken(raw)))
    .get();
  if (!row) return null;
  if (row.revokedAt != null) return null;
  // Fire-and-forget lastUsedAt bump.
  void db
    .update(apiTokens)
    .set({ lastUsedAt: Math.floor(Date.now() / 1000) })
    .where(eq(apiTokens.id, row.id))
    .run();
  return { orgId: row.orgId, scope: row.scope, tokenId: row.id };
}

export const API_TOKEN_PREFIX = PREFIX;
