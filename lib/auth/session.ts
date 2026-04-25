import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { sessions, users, memberships, orgs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';

// The `__Host-` prefix is a browser-enforced hardening: cookie MUST have
// Secure + Path=/ and MUST NOT have a Domain attribute. Any violation →
// browsers silently drop the Set-Cookie. That means we can only use it
// when we're actually serving HTTPS (i.e. production). In dev we fall
// back to the plain name so logins work over http://localhost.
const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_NAME = IS_PROD ? '__Host-claimrail_session' : 'claimrail_session';
const LEGACY_COOKIE_NAME = 'claimrail_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days sliding
const ABSOLUTE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days absolute
const JWT_ISSUER = 'claimrail';
const JWT_AUDIENCE = 'claimrail-web';

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      // In production this MUST be set to a real random string.
      throw new Error(
        'AUTH_SECRET env var must be set to at least 32 characters in production',
      );
    }
    return new TextEncoder().encode(
      'dev-fallback-secret-key-do-not-use-in-production-please',
    );
  }
  return new TextEncoder().encode(secret);
}

function cookieIsSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}

function fingerprint(): string {
  // Blake-style stable digest of UA + IP, used to bind a session to the
  // originating client. Changes → session refused. Short enough to fit
  // in a JWT claim without bloating it.
  const h = headers();
  const ua = h.get('user-agent') ?? '';
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    '';
  return createHash('sha256').update(`${ua}|${ip}`).digest('hex').slice(0, 24);
}

export interface SessionPayload {
  sid: string;
  uid: string;
  email: string;
  fp: string; // fingerprint
  absExp: number; // absolute expiry (unix seconds)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecret();
    // Pin algorithms to HS256 only. Defends against "alg: none" and
    // algorithm-confusion attacks (sending an RS256 JWT signed with what
    // an attacker hopes is our HMAC key as an RSA public key).
    const { payload, protectedHeader } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
      typ: 'JWT',
    });
    // Belt+suspenders: reject any token whose header claims something else.
    if (protectedHeader.alg !== 'HS256') return null;
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.uid !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.fp !== 'string' ||
      typeof payload.absExp !== 'number'
    ) {
      return null;
    }
    return {
      sid: payload.sid,
      uid: payload.uid,
      email: payload.email,
      fp: payload.fp,
      absExp: payload.absExp,
    };
  } catch {
    return null;
  }
}

export async function createSession(userId: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const sid = nanoid(24);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const absExp = now + ABSOLUTE_TTL_SECONDS;
  const fp = fingerprint();
  await db.insert(sessions).values({ id: sid, userId, expiresAt });
  const jwt = await signSession({ sid, uid: userId, email, fp, absExp });
  const cookieStore = cookies();
  // __Host- prefix requires: Secure + Path=/ + no Domain. Enforces origin.
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieIsSecure(),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return { sid, jwt };
}

function readSessionCookie(): string | undefined {
  const cookieStore = cookies();
  return (
    cookieStore.get(COOKIE_NAME)?.value ??
    cookieStore.get(LEGACY_COOKIE_NAME)?.value
  );
}

export async function destroySession(): Promise<void> {
  const cookieStore = cookies();
  const token = readSessionCookie();
  if (token) {
    const payload = await verifySession(token);
    if (payload) {
      await db.delete(sessions).where(eq(sessions.id, payload.sid));
    }
  }
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(LEGACY_COOKIE_NAME);
}

/**
 * Return the session id encoded in the current request's cookie, or null
 * if there's no session. Used by the password-change flow to preserve the
 * current session while revoking every other one.
 */
export async function currentSessionId(): Promise<string | null> {
  const token = readSessionCookie();
  if (!token) return null;
  const payload = await verifySession(token);
  return payload?.sid ?? null;
}

export async function destroyAllSessionsForUser(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;
  await db.delete(sessions).where(eq(sessions.userId, ctx.user.id));
  const cookieStore = cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(LEGACY_COOKIE_NAME);
}

export interface AuthContext {
  user: { id: string; email: string; name: string };
  org: { id: string; name: string; slug: string; plan: string };
  role: 'owner' | 'admin' | 'member';
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const token = readSessionCookie();
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;

  // Absolute expiry check — a sliding session can't live forever.
  if (payload.absExp < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.id, payload.sid));
    return null;
  }

  // Fingerprint check — binds session to originating UA + IP class.
  if (payload.fp !== fingerprint()) {
    await db.delete(sessions).where(eq(sessions.id, payload.sid));
    return null;
  }

  const sessionRow = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, payload.sid))
    .then((r) => r[0]);
  if (!sessionRow) return null;
  if (sessionRow.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.id, payload.sid));
    return null;
  }

  const user = await db.select().from(users).where(eq(users.id, payload.uid)).then((r) => r[0]);
  if (!user) return null;

  const mem = await db
    .select({ m: memberships, o: orgs })
    .from(memberships)
    .innerJoin(orgs, eq(memberships.orgId, orgs.id))
    .where(eq(memberships.userId, user.id))
    .then((r) => r[0]);
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

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export async function assertOrgAccess(
  userId: string,
  orgId: string,
): Promise<'owner' | 'admin' | 'member' | null> {
  const mem = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .then((r) => r[0]);
  return (mem?.role as 'owner' | 'admin' | 'member' | null) ?? null;
}
