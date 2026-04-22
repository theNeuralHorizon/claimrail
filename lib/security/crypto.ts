/**
 * Cryptographic primitives used across the auth + 2FA stack.
 *
 * We bundle only node:crypto — no extra deps. That keeps the surface area
 * auditable and avoids pulling in native modules with compat issues on
 * Windows / Node 24.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────
// Symmetric encryption (AES-256-GCM).
//
// Used to encrypt TOTP seeds at rest — if the DB leaks without AUTH_SECRET
// we still leak *seed ciphertexts*, not TOTP seeds themselves.
// ─────────────────────────────────────────────────────────────────────────

function kdfKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET must be set (≥32 chars) for encryption');
    }
  }
  // Derive a 32-byte key by SHA-256-ing the shared app secret. The sha256
  // also serves as a way to normalize arbitrary-length secrets.
  return createHash('sha256')
    .update(secret || 'dev-fallback-secret-key-do-not-use-in-production-please')
    .update('|aes-256-gcm-key')
    .digest();
}

export interface EncryptedBlob {
  iv: string; // base64
  ct: string; // base64 (ciphertext || tag)
}

export function encryptString(plaintext: string): EncryptedBlob {
  const key = kdfKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ct: Buffer.concat([enc, tag]).toString('base64'),
  };
}

export function decryptString(blob: EncryptedBlob): string {
  const key = kdfKey();
  const iv = Buffer.from(blob.iv, 'base64');
  const combined = Buffer.from(blob.ct, 'base64');
  const enc = combined.subarray(0, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function encryptToJson(plaintext: string): string {
  return JSON.stringify(encryptString(plaintext));
}

export function decryptFromJson(json: string): string {
  return decryptString(JSON.parse(json) as EncryptedBlob);
}

// ─────────────────────────────────────────────────────────────────────────
// Token helpers (email verification, password reset).
//
// We generate a random 32-byte token, show it once in the email link,
// and persist only sha256(token) + user id. This means a DB leak can't be
// used to forge working tokens.
// ─────────────────────────────────────────────────────────────────────────

export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─────────────────────────────────────────────────────────────────────────
// TOTP (RFC 6238) + HOTP (RFC 4226).
//
// We implement it directly rather than pulling in `otplib` / `speakeasy`
// so we can audit the whole thing. 30s step, 6 digits, SHA-1 (what
// authenticators expect), +/- 1 step window for clock drift.
// ─────────────────────────────────────────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i += 1) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a 20-byte (160-bit) TOTP seed, base32-encoded (RFC 4226 §5.3.3). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secretB32: string, counter: number, digits = 6): string {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = bin % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export function currentTotp(secretB32: string, now = Date.now()): string {
  const counter = Math.floor(now / 1000 / 30);
  return hotp(secretB32, counter);
}

/**
 * Verify a TOTP code with ±1 step window (±30s clock drift).
 * Uses constant-time comparison.
 */
export function verifyTotp(secretB32: string, token: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const counter = Math.floor(now / 1000 / 30);
  for (const step of [-1, 0, 1]) {
    const expected = hotp(secretB32, counter + step);
    if (constantTimeCompare(expected, token)) return true;
  }
  return false;
}

/**
 * Build a QR-ready otpauth:// URI per RFC 6238 §4.
 */
export function totpProvisioningUri(opts: {
  secret: string;
  issuer: string;
  account: string;
}): string {
  const label = `${opts.issuer}:${opts.account}`;
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/** Generate 10 single-use backup codes for TOTP recovery. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex'); // 10 hex chars
    // Format as XXXX-XXXXXX for readability
    return `${raw.slice(0, 4)}-${raw.slice(4)}`.toLowerCase();
  });
}
