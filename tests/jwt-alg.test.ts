/**
 * JWT algorithm confusion tests.
 *
 * Classic attacks:
 *   1. `alg: none` — server accepts unsigned tokens.
 *   2. `alg: RS256` fed to a server expecting HS256 — verifier uses the
 *      server's HMAC key as the "RSA public key".
 *
 * Our verifier pins `algorithms: ['HS256']` via jose. This test calls
 * verifySession with adversarial tokens and confirms it rejects.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';
});

async function makeToken(alg: string, secret: Uint8Array) {
  return new SignJWT({
    sid: 's1',
    uid: 'u1',
    email: 'a@b.co',
    fp: 'x'.repeat(24),
    absExp: Math.floor(Date.now() / 1000) + 86400,
  })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer('claimrail')
    .setAudience('claimrail-web')
    .setExpirationTime('1h')
    .sign(secret);
}

describe('JWT algorithm pinning', () => {
  it('rejects alg: none', async () => {
    const { verifySession } = await import('@/lib/auth/session');
    // jose refuses to sign with "none" without explicit opt-in, so craft
    // the header-body-signature manually.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        sid: 's',
        uid: 'u',
        email: 'a@b.co',
        fp: 'y'.repeat(24),
        absExp: Math.floor(Date.now() / 1000) + 86400,
        iss: 'claimrail',
        aud: 'claimrail-web',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const token = `${header}.${body}.`;
    expect(await verifySession(token)).toBeNull();
  });

  it('rejects a token signed with the wrong algorithm (HS384)', async () => {
    const { verifySession } = await import('@/lib/auth/session');
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const token = await makeToken('HS384', secret);
    expect(await verifySession(token)).toBeNull();
  });

  it('accepts a well-formed HS256 token', async () => {
    const { verifySession, signSession } = await import('@/lib/auth/session');
    const token = await signSession({
      sid: 's',
      uid: 'u',
      email: 'a@b.co',
      fp: 'z'.repeat(24),
      absExp: Math.floor(Date.now() / 1000) + 86400,
    });
    const payload = await verifySession(token);
    expect(payload?.uid).toBe('u');
  });

  it('rejects tokens whose signature has been tampered with', async () => {
    const { verifySession, signSession } = await import('@/lib/auth/session');
    const token = await signSession({
      sid: 's',
      uid: 'u',
      email: 'a@b.co',
      fp: 'q'.repeat(24),
      absExp: Math.floor(Date.now() / 1000) + 86400,
    });
    // Flip the last char of the signature portion.
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tampered = parts.join('.');
    expect(await verifySession(tampered)).toBeNull();
  });
});
