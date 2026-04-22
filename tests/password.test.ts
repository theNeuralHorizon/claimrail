import { describe, it, expect } from 'vitest';
import {
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from '@/lib/auth/password';

describe('checkPasswordPolicy', () => {
  it('rejects short passwords', () => {
    expect(checkPasswordPolicy('Sh0rt!').ok).toBe(false);
  });

  it('rejects passwords without enough character classes', () => {
    expect(checkPasswordPolicy('alllowercase1234').ok).toBe(false);
    expect(checkPasswordPolicy('ALLUPPERCASE1234').ok).toBe(false);
    expect(checkPasswordPolicy('MixedCaseNoNumbers').ok).toBe(false);
  });

  it('rejects common passwords', () => {
    expect(checkPasswordPolicy('Password12345').ok).toBe(true); // complexity passes
    expect(checkPasswordPolicy('password1234').ok).toBe(false); // in blocklist
  });

  it('rejects password containing the email local part', () => {
    const r = checkPasswordPolicy('Alice!Secret12', { email: 'alice@example.com' });
    expect(r.ok).toBe(false);
  });

  it('rejects password containing the name', () => {
    const r = checkPasswordPolicy('BobbyTables!12', { name: 'Bobby' });
    expect(r.ok).toBe(false);
  });

  it('accepts a strong password', () => {
    expect(checkPasswordPolicy('ClaimRail!2026-ok').ok).toBe(true);
  });

  it('rejects passwords over 72 chars (bcrypt limit)', () => {
    expect(checkPasswordPolicy('A1!' + 'x'.repeat(80)).ok).toBe(false);
  });
});

describe('password hashing', () => {
  it('rejects policy-failing passwords at hash time', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
  });

  it('hashes + verifies round-trip', async () => {
    const hash = await hashPassword('ClaimRail!2026-ok');
    expect(hash).not.toBe('ClaimRail!2026-ok');
    expect(await verifyPassword('ClaimRail!2026-ok', hash)).toBe(true);
    expect(await verifyPassword('wrong-password!', hash)).toBe(false);
  });
});
