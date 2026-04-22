import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptString,
  decryptString,
  encryptToJson,
  decryptFromJson,
  generateRandomToken,
  hashToken,
  constantTimeCompare,
  generateTotpSecret,
  currentTotp,
  verifyTotp,
  totpProvisioningUri,
  generateBackupCodes,
} from '@/lib/security/crypto';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-min-32-chars-long-enough-for-hs256-sign';
});

describe('symmetric encryption', () => {
  it('round-trips a plaintext', () => {
    const blob = encryptString('hello world');
    expect(decryptString(blob)).toBe('hello world');
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const a = encryptString('same input');
    const b = encryptString('same input');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('fails on tampered ciphertext (GCM auth tag rejects modified bytes)', () => {
    const blob = encryptString('hello world this is a secret');
    // Flip one bit in the ciphertext region so the stored auth tag no
    // longer matches. Base64 length is preserved.
    const buf = Buffer.from(blob.ct, 'base64');
    buf[Math.floor(buf.length / 2)] ^= 0x01;
    const tampered = { ...blob, ct: buf.toString('base64') };
    expect(() => decryptString(tampered)).toThrow();
  });

  it('JSON round-trip works', () => {
    const s = encryptToJson('seed-xyz');
    expect(decryptFromJson(s)).toBe('seed-xyz');
  });
});

describe('tokens', () => {
  it('generates high-entropy tokens', () => {
    const a = generateRandomToken();
    const b = generateRandomToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(32);
  });
  it('hashToken is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abcd'));
  });
  it('constantTimeCompare', () => {
    expect(constantTimeCompare('abc', 'abc')).toBe(true);
    expect(constantTimeCompare('abc', 'abd')).toBe(false);
    expect(constantTimeCompare('abc', 'ab')).toBe(false);
  });
});

describe('TOTP (RFC 6238)', () => {
  it('generates a base32 secret', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(32); // 160 bits = 32 base32 chars
  });

  it('currentTotp returns a 6-digit code', () => {
    const s = generateTotpSecret();
    const code = currentTotp(s);
    expect(code).toMatch(/^\d{6}$/);
  });

  it('verifyTotp accepts current code', () => {
    const s = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(s, currentTotp(s, now), now)).toBe(true);
  });

  it('verifyTotp accepts code from previous/next step (clock drift)', () => {
    const s = generateTotpSecret();
    const now = Date.now();
    const prev = currentTotp(s, now - 30_000);
    const next = currentTotp(s, now + 30_000);
    expect(verifyTotp(s, prev, now)).toBe(true);
    expect(verifyTotp(s, next, now)).toBe(true);
  });

  it('verifyTotp rejects codes outside the window', () => {
    const s = generateTotpSecret();
    const now = Date.now();
    const far = currentTotp(s, now + 120_000);
    expect(verifyTotp(s, far, now)).toBe(false);
  });

  it('verifyTotp rejects non-numeric input', () => {
    const s = generateTotpSecret();
    expect(verifyTotp(s, 'abcdef')).toBe(false);
    expect(verifyTotp(s, '12345')).toBe(false); // too short
    expect(verifyTotp(s, '1234567')).toBe(false); // too long
  });

  it('provisioning URI is well-formed', () => {
    const s = generateTotpSecret();
    const uri = totpProvisioningUri({ secret: s, issuer: 'ClaimRail', account: 'a@b.co' });
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain('issuer=ClaimRail');
  });
});

describe('backup codes', () => {
  it('generates 10 unique formatted codes by default', () => {
    const codes = generateBackupCodes();
    expect(codes.length).toBe(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9a-f]{4}-[0-9a-f]{6}$/);
    }
  });
});
