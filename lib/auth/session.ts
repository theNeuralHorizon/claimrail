import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { sessions, users, memberships, orgs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const COOKIE_NAME = 'claimrail_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // In dev we fall back to a predictable key so the app still runs, but in
    // production this MUST be set.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET env var is required in production');
    }
    return new TextEncoder().encode(
      'dev-fallback-secret-key-do-not-use-in-production-please',
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sid: string; // session id in DB
  uid: string; // user id
  email: string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.uid !== 'string' ||
      typeof payload.email !== 'string'
    ) {
      return null;
    }
    return { sid: payload.sid, uid: payload.uid, email: payload.email };
  } catch {
    return null;
  }
}

export async function createSession(userId: string, email: string) {
  const sid = nanoid(24);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  await db.insert(sessions).values({ id: sid, userId, expiresAt }).run();
  const jwt = await signSession({ sid, uid: userId, email });
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return { sid, jwt };
}

export async function destroySession(): Promise<void> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifySession(token);
    if (payload) {
      await db.delete(sessions).where(eq(sessions.id, payload.sid)).run();
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

export interface AuthContext {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; slug: string; plan: string };
  role: 'owner' | 'admin' | 'member';
}

/**
 * Resolve the current session from the cookie. Returns null if unauthenticated.
 * Validates JWT + DB session row + user + picks the user's first org membership.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;

  // Check DB session still valid
  const sessionRow = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, payload.sid))
    .get();
  if (!sessionRow) return null;
  if (sessionRow.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.id, payload.sid)).run();
    return null;
  }

  const user = await db.select().from(users).where(eq(users.id, payload.uid)).get();
  if (!user) return null;

  const mem = await db
    .select({ m: memberships, o: orgs })
    .from(memberships)
    .innerJoin(orgs, eq(memberships.orgId, orgs.id))
    .where(eq(memberships.userId, user.id))
    .get();
  if (!mem) return null;

  return {
    user: { id: user.id, email: user.email, name: user.name },
    org: {
      id: mem.o.id,
      name: mem.o.name,
      slug: mem.o.slug,
      plan: mem.o.plan,
    },
    role: mem.m.role,
  };
}

/**
 * Resolve auth, redirecting to /login if absent. Use in server components.
 */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return ctx;
}

/**
 * Assert a user has access to a given org. Use in API routes for defense-
 * in-depth — most queries already filter by orgId, this adds belt+suspenders.
 */
export async function assertOrgAccess(
  userId: string,
  orgId: string,
): Promise<'owner' | 'admin' | 'member' | null> {
  const mem = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .get();
  return (mem?.role as 'owner' | 'admin' | 'member' | null) ?? null;
}
