'use server';

import { db } from '@/lib/db/client';
import { orgs, users, memberships, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
import { sendEmail, appUrl } from './email';
import { decryptFromJson, verifyTotp } from '@/lib/security/crypto';
import { totpBackupCodes } from '@/lib/db/schema';
import { verifyPassword as bcryptVerify } from './password';
import { and } from 'drizzle-orm';

const signupSchema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(128),
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(128),
  totpCode: z.string().max(20).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

function requesterIp(): string {
  const h = headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'
  );
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

export type ActionState = { error?: string; success?: string; requiresTotp?: boolean };

// ─────────────────────────────────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────────────────────────────────
export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = requesterIp();
  const rl = rateLimit(`signup:${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return { error: 'Too many attempts. Try again in an hour.' };
  }
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name'),
    orgName: formData.get('orgName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };
  }
  const { email, password, name, orgName } = parsed.data;
  const policy = checkPasswordPolicy(password, { email, name });
  if (!policy.ok) return { error: policy.reason };

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();
  if (existing) {
    return {
      error: 'We could not create that account. Try signing in or use a different email.',
    };
  }

  const userId = nanoid(16);
  const orgId = nanoid(16);
  let slug = slugify(orgName) || `org-${nanoid(6)}`;
  let attempt = 0;
  while (await db.select().from(orgs).where(eq(orgs.slug, slug)).get()) {
    attempt += 1;
    slug = `${slugify(orgName) || 'org'}-${attempt}`;
    if (attempt > 10) slug = `org-${nanoid(6)}`;
  }

  const passwordHash = await hashPassword(password);
  await db
    .insert(users)
    .values({ id: userId, email: normalizedEmail, name, passwordHash })
    .run();
  await db.insert(orgs).values({ id: orgId, name: orgName, slug }).run();
  await db
    .insert(memberships)
    .values({ id: nanoid(16), userId, orgId, role: 'owner' })
    .run();

  // Issue an email verification link (dev-mode: logs to stdout).
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
  const ip = requesterIp();
  const email = String(formData.get('email') ?? '').trim();

  const ipLimit = rateLimit(`login:ip:${ip}`, { limit: 20, windowSeconds: 900 });
  const emailLimit = rateLimit(`login:email:${email.toLowerCase()}`, {
    limit: 8,
    windowSeconds: 900,
  });
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { error: 'Too many failed attempts. Wait 15 minutes and try again.' };
  }

  const parsed = loginSchema.safeParse({
    email,
    password: formData.get('password'),
    totpCode: formData.get('totpCode') ?? undefined,
  });
  if (!parsed.success) {
    await runDummyVerify();
    return { error: 'Invalid email or password.' };
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .get();

  if (!user) {
    await runDummyVerify();
    return { error: 'Invalid email or password.' };
  }

  if (isLocked(user)) {
    return {
      error: `Account temporarily locked after ${LOCK_THRESHOLD} failed attempts. Try again later or reset your password.`,
    };
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    await recordFailedLogin(user.id);
    return { error: 'Invalid email or password.' };
  }

  // 2FA: if TOTP is enabled, require a code.
  if (user.totpEnabledAt && user.totpSecretEncrypted) {
    const code = (parsed.data.totpCode ?? '').trim();
    if (!code) {
      // Tell the client to render the 2FA field. Don't advance the session.
      return { requiresTotp: true };
    }
    let valid = false;
    // Try 6-digit TOTP first.
    if (/^\d{6}$/.test(code)) {
      const secret = decryptFromJson(user.totpSecretEncrypted);
      valid = verifyTotp(secret, code);
    } else {
      // Otherwise try backup codes.
      const normalizedCode = code.toLowerCase().replace(/\s+/g, '');
      const { hashToken } = await import('@/lib/security/crypto');
      const hash = hashToken(normalizedCode);
      const row = await db
        .select()
        .from(totpBackupCodes)
        .where(and(eq(totpBackupCodes.userId, user.id), eq(totpBackupCodes.codeHash, hash)))
        .get();
      if (row && !row.usedAt) {
        await db
          .update(totpBackupCodes)
          .set({ usedAt: Math.floor(Date.now() / 1000) })
          .where(eq(totpBackupCodes.id, row.id))
          .run();
        valid = true;
      }
    }
    if (!valid) {
      await recordFailedLogin(user.id);
      return { requiresTotp: true, error: 'Invalid 2FA code.' };
    }
  }

  await recordSuccessfulLogin(user.id);
  await createSession(user.id, user.email);
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

/**
 * Form-compatible wrapper for the resend flow — returns void so it works
 * with `<form action={resendVerificationForm}>` (Server Actions with
 * state use `useFormState` and want Promise<ActionState>; plain forms
 * want Promise<void>).
 */
export async function resendVerificationForm(): Promise<void> {
  await resendVerificationAction();
}

export async function resendVerificationAction(): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).get();
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

/**
 * Confirm-email is a one-shot: it always redirects. We use the plain
 * `<form action={fn}>` signature (FormData in, void out) rather than
 * useFormState, because there's no in-page error UI to render — a failure
 * redirects to /verify-email?error=1.
 */
export async function confirmEmailAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const consumed = await consumeToken(token, 'email_verify');
  if (!consumed) redirect('/verify-email?error=invalid');
  await db
    .update(users)
    .set({ emailVerifiedAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, consumed.userId))
    .run();
  redirect('/dashboard?verified=1');
}

// ─────────────────────────────────────────────────────────────────────────
// Password change (requires current password)
// ─────────────────────────────────────────────────────────────────────────

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

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

  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).get();
  if (!user) return { error: 'Account not found.' };
  const ok = await bcryptVerify(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { error: 'Current password is incorrect.' };

  const policy = checkPasswordPolicy(parsed.data.newPassword, {
    email: user.email,
    name: user.name,
  });
  if (!policy.ok) return { error: policy.reason };
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return { error: 'New password must differ from current password.' };
  }

  const hash = await hashPassword(parsed.data.newPassword);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id)).run();

  // Invalidate every other session — the current session stays valid so
  // the user doesn't get bounced out of the page they just completed the
  // change on. Everything else is forcibly signed out.
  const current = await currentSessionId();
  const allSessions = await db.select().from(sessions).where(eq(sessions.userId, user.id)).all();
  for (const s of allSessions) {
    if (s.id !== current) {
      await db.delete(sessions).where(eq(sessions.id, s.id)).run();
    }
  }

  await recordAudit('auth.password.change', user.id, {}, ctx.org.id);
  return { success: 'Password updated. Other sessions signed out.' };
}

// ─────────────────────────────────────────────────────────────────────────
// Password reset (forgot password)
// ─────────────────────────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  email: z.string().email().max(256),
});

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = requesterIp();
  const rl = rateLimit(`pwreset:ip:${ip}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    // Intentionally do NOT leak rate-limit state to the caller; always
    // return the same generic success message.
    return { success: 'If that email exists, a reset link has been sent.' };
  }
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { success: 'If that email exists, a reset link has been sent.' };
  }
  const normalized = parsed.data.email.toLowerCase().trim();
  const user = await db.select().from(users).where(eq(users.email, normalized)).get();
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
  }
  // Constant timing regardless of whether the user existed.
  return { success: 'If that email exists, a reset link has been sent.' };
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1).max(128),
});

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
  const user = await db.select().from(users).where(eq(users.id, consumed.userId)).get();
  if (!user) return { error: 'Account not found.' };
  const policy = checkPasswordPolicy(parsed.data.newPassword, {
    email: user.email,
    name: user.name,
  });
  if (!policy.ok) return { error: policy.reason };

  const hash = await hashPassword(parsed.data.newPassword);
  await db
    .update(users)
    .set({ passwordHash: hash, failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, user.id))
    .run();
  // Revoke *every* session for this user — a reset means their credential
  // may have been compromised.
  await db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  redirect('/login?reset=1');
}
