/**
 * Team invitations.
 *
 * Only owners/admins may invite. Each invitation carries a 256-bit random
 * token shown once (in the email link) and stored peppered-HMAC-hashed.
 * Expiry is 7 days; revokable anytime; single-use.
 *
 * Accepting an invite either:
 *   - Signs the recipient up fresh (we pre-fill email + bind the org).
 *   - Or — if they already have a ClaimRail account — adds a membership
 *     row to the inviting org (no new user/org rows).
 */
import { db } from '@/lib/db/client';
import { invitations, memberships, users } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { digestToken, generateRandomToken } from '@/lib/security/crypto';

const TTL_SECONDS = 60 * 60 * 24 * 7;

export interface IssuedInvitation {
  id: string;
  rawToken: string;
  expiresAt: number;
}

export async function issueInvitation(input: {
  orgId: string;
  email: string;
  role: 'admin' | 'member';
  invitedBy: string;
}): Promise<IssuedInvitation> {
  const id = nanoid(16);
  const rawToken = generateRandomToken(24);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  await db
    .insert(invitations)
    .values({
      id,
      orgId: input.orgId,
      email: input.email.toLowerCase().trim(),
      role: input.role,
      tokenHash: digestToken(rawToken),
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .run();
  return { id, rawToken, expiresAt };
}

export interface ResolvedInvitation {
  id: string;
  orgId: string;
  email: string;
  role: 'admin' | 'member';
}

/**
 * Look up an invite by raw token. Returns null if missing, expired,
 * revoked, or already accepted.
 */
export async function resolveInvitation(rawToken: string): Promise<ResolvedInvitation | null> {
  if (!rawToken || rawToken.length < 16) return null;
  const row = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, digestToken(rawToken)))
    .get();
  if (!row) return null;
  if (row.acceptedAt != null) return null;
  if (row.revokedAt != null) return null;
  if (row.expiresAt < Math.floor(Date.now() / 1000)) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    role: row.role,
  };
}

/**
 * Mark an invite as consumed. Called after successfully creating the
 * membership. Returns true on success, false if another process got there
 * first.
 */
export async function consumeInvitation(invitationId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .update(invitations)
    .set({ acceptedAt: now })
    .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)))
    .returning()
    .all();
  return res.length > 0;
}

export async function revokeInvitation(orgId: string, invitationId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const res = await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.orgId, orgId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning()
    .all();
  return res.length > 0;
}

/**
 * Accept an invitation by raw token. If the recipient already has a user
 * account, attach membership directly. Otherwise return the resolved
 * invite for the signup flow to consume.
 */
export async function tryAttachExistingUser(
  invite: ResolvedInvitation,
): Promise<{ attached: true } | { attached: false }> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, invite.email))
    .get();
  if (!existing) return { attached: false };
  // Don't accidentally demote an existing owner — only add if no membership
  // exists for this (user, org) pair yet.
  const already = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, existing.id), eq(memberships.orgId, invite.orgId)))
    .get();
  if (!already) {
    await db
      .insert(memberships)
      .values({
        id: nanoid(16),
        userId: existing.id,
        orgId: invite.orgId,
        role: invite.role,
      })
      .run();
  }
  await consumeInvitation(invite.id);
  return { attached: true };
}
