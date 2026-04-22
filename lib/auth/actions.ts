'use server';

import { db } from '@/lib/db/client';
import { orgs, users, memberships } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './password';
import { createSession, destroySession } from './session';
import { nanoid } from 'nanoid';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  orgName: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}

export type ActionState = { error?: string; success?: boolean };

export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (existing) {
    return { error: 'An account with that email already exists.' };
  }

  const userId = nanoid(16);
  const orgId = nanoid(16);
  let slug = slugify(orgName);
  if (!slug) slug = nanoid(8);
  // Ensure unique slug
  let attempt = 0;
  while (await db.select().from(orgs).where(eq(orgs.slug, slug)).get()) {
    attempt += 1;
    slug = `${slugify(orgName) || 'org'}-${attempt}`;
    if (attempt > 10) slug = `org-${nanoid(6)}`;
  }

  const passwordHash = await hashPassword(password);
  await db
    .insert(users)
    .values({ id: userId, email: email.toLowerCase(), name, passwordHash })
    .run();
  await db.insert(orgs).values({ id: orgId, name: orgName, slug }).run();
  await db
    .insert(memberships)
    .values({ id: nanoid(16), userId, orgId, role: 'owner' })
    .run();

  await createSession(userId, email.toLowerCase());
  redirect('/dashboard');
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'Invalid email or password.' };
  }
  const { email, password } = parsed.data;
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (!user) {
    return { error: 'Invalid email or password.' };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { error: 'Invalid email or password.' };
  }
  await createSession(user.id, user.email);
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/');
}
