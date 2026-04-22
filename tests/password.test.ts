import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
  });

  it('hashes + verifies round-trip', async () => {
    const hash = await hashPassword('hunter2password');
    expect(hash).not.toBe('hunter2password');
    expect(await verifyPassword('hunter2password', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
