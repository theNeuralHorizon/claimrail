'use server';

import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getAuthContext } from './session';
import { rateLimit } from '@/lib/rate-limit';
import { appendAuditEvent } from '@/lib/audit/chain';
import { db } from '@/lib/db/client';
import { memberships, users, invitations } from '@/lib/db/schema';
import { appUrl, sendEmail } from './email';
import {
  issueInvitation,
  revokeInvitation,
  tryAttachExistingUser,
  resolveInvitation,
} from './invitations';

export type TeamState = {
  error?: string;
  success?: string;
  inviteLink?: string;
};

const inviteSchema = z
  .object({
    email: z.string().email().max(256),
    role: z.enum(['admin', 'member']),
  })
  .strict();

function requireAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

// ─────────────────────────────────────────────────────────────────────────
// Invite
// ─────────────────────────────────────────────────────────────────────────
export async function inviteTeammateAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  if (!requireAdmin(ctx.role)) return { error: 'Only admins can invite teammates.' };

  const rl = rateLimit(`invite:${ctx.org.id}`, { limit: 20, windowSeconds: 3600 });
  if (!rl.allowed) return { error: 'Too many invites sent. Wait an hour.' };

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) return { error: 'Email + role required.' };

  const normalized = parsed.data.email.toLowerCase().trim();

  // If the invitee is already a member of this org, bail early so we don't
  // spam them with a useless invite email.
  const existingUser = await db.select().from(users).where(eq(users.email, normalized)).get();
  if (existingUser) {
    const already = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, existingUser.id), eq(memberships.orgId, ctx.org.id)))
      .get();
    if (already) return { error: 'That person is already a member.' };
  }

  const issued = await issueInvitation({
    orgId: ctx.org.id,
    email: normalized,
    role: parsed.data.role,
    invitedBy: ctx.user.id,
  });
  const link = `${appUrl()}/accept-invite?token=${issued.rawToken}`;

  await sendEmail({
    to: normalized,
    subject: `${ctx.user.name} invited you to ${ctx.org.name} on ClaimRail`,
    text:
      `${ctx.user.name} has invited you to join ${ctx.org.name} on ClaimRail as ${parsed.data.role}.\n\n` +
      `Accept the invitation (link expires in 7 days):\n${link}\n\n` +
      `If you weren't expecting this invite, ignore this email.`,
  });

  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'team.invite',
    resource: 'invitation',
    resourceId: issued.id,
    metadata: { email: normalized, role: parsed.data.role },
  });

  return {
    success: `Invite sent to ${normalized}. Link expires in 7 days.`,
    // Echo link back so we can show it in the UI (useful when email isn't wired).
    inviteLink: link,
  };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  if (!requireAdmin(ctx.role)) return;
  const invitationId = String(formData.get('invitationId') ?? '');
  if (!invitationId) return;
  const ok = await revokeInvitation(ctx.org.id, invitationId);
  if (ok) {
    await appendAuditEvent({
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: 'team.invite.revoke',
      resource: 'invitation',
      resourceId: invitationId,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Accept invite (public — no auth required if signing up via link)
// ─────────────────────────────────────────────────────────────────────────
export async function acceptInviteExistingUser(rawToken: string): Promise<{
  ok: boolean;
  reason?: string;
  orgId?: string;
}> {
  const invite = await resolveInvitation(rawToken);
  if (!invite) return { ok: false, reason: 'invalid_or_expired' };
  // This path only works if the current session's email matches.
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, reason: 'not_signed_in' };
  if (ctx.user.email.toLowerCase() !== invite.email) {
    return { ok: false, reason: 'wrong_account' };
  }
  const attached = await tryAttachExistingUser(invite);
  if (!attached.attached) return { ok: false, reason: 'needs_signup' };
  await appendAuditEvent({
    orgId: invite.orgId,
    actorId: ctx.user.id,
    action: 'team.invite.accept',
    resource: 'invitation',
    resourceId: invite.id,
    metadata: { email: invite.email },
  });
  return { ok: true, orgId: invite.orgId };
}

// ─────────────────────────────────────────────────────────────────────────
// Member management
// ─────────────────────────────────────────────────────────────────────────

const roleSchema = z.enum(['owner', 'admin', 'member']);

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  if (ctx.role !== 'owner') return; // only owners can change roles
  const userId = String(formData.get('userId') ?? '');
  const parsedRole = roleSchema.safeParse(formData.get('role'));
  if (!userId || !parsedRole.success) return;
  // Don't let the only owner demote themselves — otherwise the org becomes
  // ownerless. Count current owners; if we're at 1 and target is the owner
  // to-be-demoted, refuse.
  if (userId === ctx.user.id && parsedRole.data !== 'owner') {
    const owners = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.role, 'owner')))
      .all();
    if (owners.length <= 1) return;
  }
  await db
    .update(memberships)
    .set({ role: parsedRole.data })
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, ctx.org.id)))
    .run();
  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'team.role.change',
    resource: 'membership',
    resourceId: userId,
    metadata: { role: parsedRole.data },
  });
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  if (!requireAdmin(ctx.role)) return;
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;
  // Can't remove the last owner.
  const target = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, ctx.org.id)))
    .get();
  if (!target) return;
  if (target.role === 'owner') {
    const owners = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.role, 'owner')))
      .all();
    if (owners.length <= 1) return;
  }
  await db
    .delete(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, ctx.org.id)))
    .run();
  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'team.remove',
    resource: 'membership',
    resourceId: userId,
  });
}
