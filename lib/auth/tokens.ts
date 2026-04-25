/**
 * One-time verification tokens used for email verification and password
 * reset flows.
 *
 * Design:
 *   - The raw token is shown once (in the email link) and never persisted.
 *   - We store sha256(token) + user id + purpose + expiry.
 *   - Consuming a token marks it used — we never accept it twice.
 *   - Token hash lookup is via unique index, so no timing leakage.
 */

import { db } from '@/lib/db/client';
import { verificationTokens } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateRandomToken, hashToken } from '@/lib/security/crypto';

export type TokenPurpose = 'email_verify' | 'password_reset';

const TTL: Record<TokenPurpose, number> = {
  email_verify: 60 * 60 * 24, // 24h
  password_reset: 60 * 30, // 30 minutes — shorter because it's a riskier flow
};

export interface IssuedToken {
  rawToken: string;
  tokenId: string;
  expiresAt: number;
}

export async function issueToken(
  userId: string,
  purpose: TokenPurpose,
): Promise<IssuedToken> {
  // Invalidate any outstanding *unused* tokens of the same purpose for this
  // user. Prevents "chain" reuse if the user requests multiple resends.
  await db
    .update(verificationTokens)
    .set({ usedAt: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(verificationTokens.userId, userId),
        eq(verificationTokens.purpose, purpose),
        isNull(verificationTokens.usedAt),
      ),
    )
    ;

  const raw = generateRandomToken(32);
  const tokenHash = hashToken(raw);
  const id = nanoid(16);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL[purpose];
  await db
    .insert(verificationTokens)
    .values({ id, tokenHash, userId, purpose, expiresAt })
    ;
  return { rawToken: raw, tokenId: id, expiresAt };
}

export interface ConsumedToken {
  userId: string;
}

/**
 * Consume a token: verify it exists for the given purpose, hasn't expired,
 * hasn't been used yet, then mark it used and return the bound user id.
 */
export async function consumeToken(
  rawToken: string,
  purpose: TokenPurpose,
): Promise<ConsumedToken | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const tokenHash = hashToken(rawToken);
  const row = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.purpose, purpose),
      ),
    )
    .then((r) => r[0]);
  if (!row) return null;
  if (row.usedAt != null) return null;
  if (row.expiresAt < Math.floor(Date.now() / 1000)) return null;
  // Atomically mark used. If another request consumed it in the meantime,
  // the update affects 0 rows and we bail.
  const now = Math.floor(Date.now() / 1000);
  const upd = await db
    .update(verificationTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(verificationTokens.id, row.id),
        // Guard: only mark used if not already used (race-safe).
        isNull(verificationTokens.usedAt),
      ),
    )
    .returning()
    ;
  if (upd.length === 0) return null;
  return { userId: row.userId };
}
