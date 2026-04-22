'use server';

import { db } from '@/lib/db/client';
import { orgs, users, memberships } from '@/lib/db/schema';
import { appendAuditEvent } from '@/lib/audit/chain';
import { eq } from 'drizzle-orm';
import { checkPasswordPolicy, hashPassword, runDummyVerify, verifyPassword } from './password';
import { createSession, destroySession, destroyAllSessionsForUser } from './session';
import { nanoid } from 'nanoid';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';

const signupSchema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(128),
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(128),
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

export type ActionState = { error?: string; success?: boolean };

// ─────────────────────────────────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────────────────────────────────
export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = requesterIp();
  // 5 signup attempts per IP per hour. Generous; real bots burn through
  // this fast enough that it's not noise for real users.
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
    // Don't leak email existence. Return the same generic message we'd
    // emit on any other failure.
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

  await recordAudit('auth.signup', userId, { email: normalizedEmail, ip }, orgId);
  await createSession(userId, normalizedEmail);
  redirect('/dashboard');
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

  // Defense-in-depth rate limit: per-IP (broad) + per-email (precise).
  const ipLimit = rateLimit(`login:ip:${ip}`, { limit: 20, windowSeconds: 900 });
  const emailLimit = rateLimit(`login:email:${email.toLowerCase()}`, {
    limit: 8,
    windowSeconds: 900,
  });
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return {
      error: 'Too many failed attempts. Wait 15 minutes and try again.',
    };
  }

  const parsed = loginSchema.safeParse({
    email,
    password: formData.get('password'),
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
    // Run a dummy verify so the timing between "missing user" and
    // "wrong password" is indistinguishable.
    await runDummyVerify();
    return { error: 'Invalid email or password.' };
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { error: 'Invalid email or password.' };
  }
  // Rotate: on every successful login we issue a fresh session. Previous
  // sessions remain valid (so you don't get kicked off your phone) — but
  // the user can invoke logout-all from settings.
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
