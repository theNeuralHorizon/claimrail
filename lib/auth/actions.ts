'use server';

import { db } from '@/lib/db/client';
import { orgs, users, memberships, sessions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  checkPasswordPolicy,
  hashPassword,
  runDummyVerify,
  verifyPassword,
} from './password';
import {
  createSession,
  destroySession,
  destroyAllSessionsForUser,
  getAuthContext,
  currentSessionId,
} from './session';
import { nanoid } from 'nanoid';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { appendAuditEvent } from '@/lib/audit/chain';
import {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  LOCK_THRESHOLD,
} from './lockout';
import { consumeToken, issueToken } from './tokens';
import { resolveInvitation, consumeInvitation, tryAttachExistingUser } from './invitations';
import { sendEmail, appUrl } from './email';
import {
  digestToken,
  decryptFromJson,
  verifyTotp,
  verifyTotpAtStep,
} from '@/lib/security/crypto';
import { totpBackupCodes } from '@/lib/db/schema';
import { isDisabled, killSwitchMessage } from '@/lib/security/kill-switch';
import { logSecurityEvent } from '@/lib/security/security-log';
import { sanitizeLine, sanitizeBlock } from '@/lib/security/sanitize';
import {
  matchesPasswordHistory,
  pushPasswordHistory,
} from './password-history';
import { pinTotpStep, stepForCode } from './totp-nonce';
import { evaluateLoginAnomalies } from '@/lib/security/anomaly';

// Every mutation schema is strict so unknown keys fail fast instead of
// being silently dropped (defense against mass-assignment).
const signupSchema = z
  .object({
    email: z.string().email().max(256),
    password: z.string().min(1).max(128),
    name: z.string().min(1).max(100),
    // Not required when signing up via a team invite — the org already
    // exists, the new account joins it instead of creating one.
    orgName: z.string().max(100).optional(),
    // Raw invitation token carried through from /accept-invite. Validated
    // (and its email cross-checked) inside the action, not here.
    invite: z.string().max(64).optional(),
    // Honeypot: real browsers leave this empty. Bots fill every input.
    company_website: z.string().max(0).optional(),
    // Client-side JS writes this when the form mounts. Any submit faster
    // than MIN_SUBMIT_MS is almost certainly a bot.
    formMountedAt: z.coerce.number().optional(),
  })
  .strict()
  .refine((data) => data.invite || (data.orgName ?? '').trim().length > 0, {
    message: 'Company name is required.',
    path: ['orgName'],
  });

const loginSchema = z
  .object({
    email: z.string().email().max(256),
    password: z.string().min(1).max(128),
    totpCode: z.string().max(20).optional(),
    // Carried through from /accept-invite?...&invite=... for a user who
    // already has an account — validated and consumed after a successful
    // login, not here.
    invite: z.string().max(64).optional(),
  })
  .strict();

const MIN_SIGNUP_SUBMIT_MS = 2_000;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function requestMeta(): { ip: string; userAgent: string } {
  const h = headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown';
  const ua = h.get('user-agent')?.slice(0, 300) ?? '';
  return { ip, userAgent: ua };
}

async function recordAudit(
  action: string,
  resourceId: string,
  metadata: Record<string, unknown>,
  orgId?: string,
): Promise<void> {
  if (!orgId) return;
  await appendAuditEvent({
    orgId,
    actorId: null,
    action,
    resource: 'auth',
    resourceId,
    metadata,
  });
}

export type ActionState = {
  error?: string;
  success?: string;
  requiresTotp?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────────────────────────────────
export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip, userAgent } = requestMeta();

  if (isDisabled('signup')) {
    await logSecurityEvent({ kind: 'kill_switch.engaged', ip, userAgent, metadata: { subsystem: 'signup' } });
    return { error: killSwitchMessage('signup') };
  }

  const rl = rateLimit(`signup:${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    await logSecurityEvent({ kind: 'signup.rate_limited', ip, userAgent });
    return { error: 'Too many attempts. Try again in an hour.' };
  }

  const honeypot = String(formData.get('company_website') ?? '');
  if (honeypot.length > 0) {
    // Real browsers don't submit anything in an invisible field. Silent
    // success: don't tip the bot off.
    await logSecurityEvent({ kind: 'signup.honeypot', severity: 'high', ip, userAgent });
    return { success: "If everything looks good, you'll receive a verification email." };
  }

  const mountedAt = Number(formData.get('formMountedAt') ?? 0);
  if (mountedAt > 0 && Date.now() - mountedAt < MIN_SIGNUP_SUBMIT_MS) {
    await logSecurityEvent({ kind: 'signup.too_fast', ip, userAgent, metadata: { elapsedMs: Date.now() - mountedAt } });
    return { error: 'Please give the form a moment to load and try again.' };
  }

  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    orgName: formData.get('orgName') || undefined,
    invite: formData.get('invite') || undefined,
    company_website: formData.get('company_website') ?? undefined,
    formMountedAt: mountedAt || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }

  const email = sanitizeLine(parsed.data.email, 256);
  const name = sanitizeLine(parsed.data.name, 100);
  const { password } = parsed.data;

  const policy = checkPasswordPolicy(password, { email, name });
  if (!policy.ok) return { error: policy.reason };

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .then((r) => r[0]);
  if (existing) {
    return {
      error: 'We could not create that account. Try signing in or use a different email.',
    };
  }

  // A team invite only binds this signup to the inviting org if it's
  // still valid AND was issued for this exact email — otherwise someone
  // could sign up with any email while carrying along a stale/unrelated
  // token and land in a stranger's org.
  const resolvedInvite = parsed.data.invite
    ? await resolveInvitation(parsed.data.invite)
    : null;
  const invite =
    resolvedInvite && resolvedInvite.email === normalizedEmail ? resolvedInvite : null;

  const userId = nanoid(16);
  const passwordHash = await hashPassword(password);
  await db
    .insert(users)
    .values({ id: userId, email: normalizedEmail, name, passwordHash })
    ;

  let orgId: string;
  if (invite) {
    orgId = invite.orgId;
    await db
      .insert(memberships)
      .values({ id: nanoid(16), userId, orgId, role: invite.role })
      ;
    await consumeInvitation(invite.id);
  } else {
    const orgName = sanitizeLine(parsed.data.orgName ?? '', 100);
    orgId = nanoid(16);
    let slug = slugify(orgName) || `org-${nanoid(6)}`;
    let attempt = 0;
    while (await db.select().from(orgs).where(eq(orgs.slug, slug)).then((r) => r[0])) {
      attempt += 1;
      slug = `${slugify(orgName) || 'org'}-${attempt}`;
      if (attempt > 10) slug = `org-${nanoid(6)}`;
    }
    await db.insert(orgs).values({ id: orgId, name: orgName, slug });
    await db
      .insert(memberships)
      .values({ id: nanoid(16), userId, orgId, role: 'owner' })
      ;
  }

  const token = await issueToken(userId, 'email_verify');
  await sendEmail({
    to: normalizedEmail,
    subject: 'Verify your ClaimRail email',
    text: `Click to verify your email:\n${appUrl()}/verify-email?token=${token.rawToken}`,
  });

  await recordAudit('auth.signup', userId, { email: normalizedEmail, ip }, orgId);
  await createSession(userId, normalizedEmail);
  redirect('/verify-email?sent=1');
}

// ─────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────
export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip, userAgent } = requestMeta();

  if (isDisabled('login')) {
    await logSecurityEvent({ kind: 'kill_switch.engaged', ip, userAgent, metadata: { subsystem: 'login' } });
    return { error: killSwitchMessage('login') };
  }

  const email = sanitizeLine(String(formData.get('email') ?? ''), 256);

  const ipLimit = rateLimit(`login:ip:${ip}`, { limit: 20, windowSeconds: 900 });
  const emailLimit = rateLimit(`login:email:${email.toLowerCase()}`, {
    limit: 8,
    windowSeconds: 900,
  });
  if (!ipLimit.allowed || !emailLimit.allowed) {
    await logSecurityEvent({ kind: 'login.rate_limited', ip, userAgent, metadata: { email } });
    return { error: 'Too many failed attempts. Wait 15 minutes and try again.' };
  }

  const parsed = loginSchema.safeParse({
    email,
    password: formData.get('password'),
    totpCode: formData.get('totpCode') ?? undefined,
    invite: formData.get('invite') || undefined,
  });
  if (!parsed.success) {
    await runDummyVerify();
    await logSecurityEvent({ kind: 'login.failed', ip, userAgent, metadata: { reason: 'schema' } });
    return { error: 'Invalid email or password.' };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .then((r) => r[0]);

  if (!user) {
    await runDummyVerify();
    await logSecurityEvent({ kind: 'login.failed', ip, userAgent, metadata: { reason: 'no_user' } });
    return { error: 'Invalid email or password.' };
  }

  if (isLocked(user)) {
    await logSecurityEvent({
      kind: 'login.locked',
      userId: user.id,
      ip,
      userAgent,
    });
    return {
      error: `Account temporarily locked after ${LOCK_THRESHOLD} failed attempts. Try again later or reset your password.`,
    };
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    await recordFailedLogin(user.id);
    await logSecurityEvent({ kind: 'login.failed', userId: user.id, ip, userAgent, metadata: { reason: 'bad_password' } });
    return { error: 'Invalid email or password.' };
  }

  if (user.totpEnabledAt && user.totpSecretEncrypted) {
    const code = (parsed.data.totpCode ?? '').trim();
    if (!code) return { requiresTotp: true };

    // Dedicated rate limit for the TOTP step — keeps an attacker with
    // correct password from enumerating the ~1M 6-digit codes.
    const totpLimit = rateLimit(`totp:${user.id}`, { limit: 10, windowSeconds: 600 });
    if (!totpLimit.allowed) {
      await logSecurityEvent({ kind: 'totp.rate_limited', userId: user.id, ip, userAgent });
      return { requiresTotp: true, error: 'Too many 2FA attempts. Try again in 10 minutes.' };
    }

    const secret = decryptFromJson(user.totpSecretEncrypted);
    let valid = false;

    if (/^\d{6}$/.test(code)) {
      const step = stepForCode(secret, code, verifyTotpAtStep);
      if (step != null) {
        const pinned = await pinTotpStep(user.id, step);
        if (pinned) valid = true;
        else {
          await logSecurityEvent({
            kind: 'totp.replay',
            severity: 'high',
            userId: user.id,
            ip,
            userAgent,
            metadata: { step },
          });
          return { requiresTotp: true, error: 'That code was already used. Wait for the next one.' };
        }
      }
      // Fall back to legacy verify (no pin) only if stepForCode didn't
      // match — shouldn't happen, kept as defense-in-depth.
      if (!valid && verifyTotp(secret, code)) valid = true;
    } else {
      // Backup code path.
      const normalizedCode = code.toLowerCase().replace(/\s+/g, '');
      const hash = digestToken(normalizedCode);
      const row = await db
        .select()
        .from(totpBackupCodes)
        .where(and(eq(totpBackupCodes.userId, user.id), eq(totpBackupCodes.codeHash, hash)))
        .then((r) => r[0]);
      if (row && !row.usedAt) {
        await db
          .update(totpBackupCodes)
          .set({ usedAt: Math.floor(Date.now() / 1000) })
          .where(eq(totpBackupCodes.id, row.id))
          ;
        valid = true;
      }
    }

    if (!valid) {
      await recordFailedLogin(user.id);
      await logSecurityEvent({ kind: 'totp.failed', userId: user.id, ip, userAgent });
      return { requiresTotp: true, error: 'Invalid 2FA code.' };
    }
  }

  await recordSuccessfulLogin(user.id);

  // Anomaly check uses prior login.success events — do this BEFORE
  // logging the current event so the "new device" heuristic doesn't see
  // itself.
  const anomalies = await evaluateLoginAnomalies({
    userId: user.id,
    ip,
    userAgent,
  });
  if (anomalies.impossibleTravel) {
    await logSecurityEvent({
      kind: 'anomaly.impossible_travel',
      severity: 'high',
      userId: user.id,
      ip,
      userAgent,
    });
  }
  if (anomalies.newDevice) {
    await logSecurityEvent({
      kind: 'anomaly.new_device',
      userId: user.id,
      ip,
      userAgent,
    });
  }

  await logSecurityEvent({ kind: 'login.success', userId: user.id, ip, userAgent });
  await createSession(user.id, user.email);

  // If this login came from an "I already have an account" link on an
  // invite page, finish joining the inviting org right here — otherwise
  // the invite context is lost the moment login redirects to /dashboard.
  if (parsed.data.invite) {
    const invite = await resolveInvitation(parsed.data.invite);
    if (invite && invite.email === user.email.toLowerCase()) {
      const attached = await tryAttachExistingUser(invite);
      if (attached.attached) {
        await appendAuditEvent({
          orgId: invite.orgId,
          actorId: user.id,
          action: 'team.invite.accept',
          resource: 'invitation',
          resourceId: invite.id,
        });
        redirect('/dashboard?joined=1');
      }
    }
  }

  redirect('/dashboard');
}

// ─────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────
export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}

export async function logoutAllSessionsAction(): Promise<void> {
  await destroyAllSessionsForUser();
  redirect('/');
}

// ─────────────────────────────────────────────────────────────────────────
// Email verification
// ─────────────────────────────────────────────────────────────────────────

export async function resendVerificationForm(): Promise<void> {
  await resendVerificationAction();
}

export async function resendVerificationAction(): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).then((r) => r[0]);
  if (!user) return { error: 'Account not found.' };
  if (user.emailVerifiedAt) return { success: 'Already verified.' };

  const rl = rateLimit(`verify-resend:${ctx.user.id}`, {
    limit: 3,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return { error: 'Too many resend requests. Try again in an hour.' };
  }

  const token = await issueToken(user.id, 'email_verify');
  await sendEmail({
    to: user.email,
    subject: 'Verify your ClaimRail email',
    text: `Click to verify your email:\n${appUrl()}/verify-email?token=${token.rawToken}`,
  });
  await recordAudit('auth.verify_email.resend', user.id, { email: user.email }, ctx.org.id);
  return { success: 'Verification email sent.' };
}

export async function confirmEmailAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const consumed = await consumeToken(token, 'email_verify');
  if (!consumed) redirect('/verify-email?error=invalid');
  await db
    .update(users)
    .set({ emailVerifiedAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, consumed.userId))
    ;
  redirect('/dashboard?verified=1');
}

// ─────────────────────────────────────────────────────────────────────────
// Password change
// ─────────────────────────────────────────────────────────────────────────

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(128),
  })
  .strict();

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) return { error: 'Invalid input.' };

  const rl = rateLimit(`pwchange:${ctx.user.id}`, { limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) return { error: 'Too many attempts. Try again in an hour.' };

  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).then((r) => r[0]);
  if (!user) return { error: 'Account not found.' };
  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { error: 'Current password is incorrect.' };

  const policy = checkPasswordPolicy(parsed.data.newPassword, {
    email: user.email,
    name: user.name,
  });
  if (!policy.ok) return { error: policy.reason };

  if (
    await matchesPasswordHistory(user.id, parsed.data.newPassword, user.passwordHash)
  ) {
    await logSecurityEvent({
      kind: 'password.history.rejected',
      userId: user.id,
      orgId: ctx.org.id,
    });
    return {
      error: "You've used this password recently. Choose a new one that's different from your last five.",
    };
  }

  const oldHash = user.passwordHash;
  const hash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));
  await pushPasswordHistory(user.id, oldHash);

  const current = await currentSessionId();
  const allSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  for (const s of allSessions) {
    if (s.id !== current) {
      await db.delete(sessions).where(eq(sessions.id, s.id));
    }
  }

  await recordAudit('auth.password.change', user.id, {}, ctx.org.id);
  await logSecurityEvent({
    kind: 'password.change.succeeded',
    userId: user.id,
    orgId: ctx.org.id,
  });
  return { success: 'Password updated. Other sessions signed out.' };
}

// ─────────────────────────────────────────────────────────────────────────
// Password reset
// ─────────────────────────────────────────────────────────────────────────

const forgotPasswordSchema = z
  .object({ email: z.string().email().max(256) })
  .strict();

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { ip, userAgent } = requestMeta();
  if (isDisabled('password_reset')) {
    return { success: 'If that email exists, a reset link has been sent.' };
  }
  const rl = rateLimit(`pwreset:ip:${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return { success: 'If that email exists, a reset link has been sent.' };
  }
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { success: 'If that email exists, a reset link has been sent.' };
  }
  const normalized = parsed.data.email.toLowerCase().trim();
  const user = await db.select().from(users).where(eq(users.email, normalized)).then((r) => r[0]);
  if (user) {
    const token = await issueToken(user.id, 'password_reset');
    await sendEmail({
      to: user.email,
      subject: 'Reset your ClaimRail password',
      text:
        `Someone requested a password reset for your account.\n` +
        `If it was you, click below (link expires in 30 minutes):\n` +
        `${appUrl()}/reset-password?token=${token.rawToken}\n\n` +
        `If it wasn't you, ignore this email.`,
    });
    await logSecurityEvent({
      kind: 'password.reset.requested',
      userId: user.id,
      ip,
      userAgent,
    });
  }
  return { success: 'If that email exists, a reset link has been sent.' };
}

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(1).max(128),
  })
  .strict();

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) return { error: 'Invalid input.' };

  const consumed = await consumeToken(parsed.data.token, 'password_reset');
  if (!consumed) return { error: 'This reset link is invalid or expired.' };
  const user = await db.select().from(users).where(eq(users.id, consumed.userId)).then((r) => r[0]);
  if (!user) return { error: 'Account not found.' };

  const policy = checkPasswordPolicy(parsed.data.newPassword, {
    email: user.email,
    name: user.name,
  });
  if (!policy.ok) return { error: policy.reason };

  if (
    await matchesPasswordHistory(user.id, parsed.data.newPassword, user.passwordHash)
  ) {
    return {
      error: "You've used this password recently. Choose one that's different from your last five.",
    };
  }

  const oldHash = user.passwordHash;
  const hash = await hashPassword(parsed.data.newPassword);
  await db
    .update(users)
    .set({ passwordHash: hash, failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, user.id))
    ;
  await pushPasswordHistory(user.id, oldHash);
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await logSecurityEvent({
    kind: 'password.reset.succeeded',
    userId: user.id,
  });
  redirect('/login?reset=1');
}

