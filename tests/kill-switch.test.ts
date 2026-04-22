import { describe, it, expect, afterEach } from 'vitest';
import { isDisabled, disabledKeys, killSwitchMessage } from '@/lib/security/kill-switch';

afterEach(() => {
  delete process.env.CLAIMRAIL_DISABLE;
});

describe('kill switch', () => {
  it('defaults to nothing disabled', () => {
    expect(isDisabled('login')).toBe(false);
    expect(disabledKeys()).toEqual([]);
  });

  it('honours a single subsystem', () => {
    process.env.CLAIMRAIL_DISABLE = 'login';
    expect(isDisabled('login')).toBe(true);
    expect(isDisabled('signup')).toBe(false);
  });

  it('honours a comma list', () => {
    process.env.CLAIMRAIL_DISABLE = 'login,signup';
    expect(isDisabled('login')).toBe(true);
    expect(isDisabled('signup')).toBe(true);
  });

  it('"all" implies every subsystem', () => {
    process.env.CLAIMRAIL_DISABLE = 'all';
    expect(isDisabled('login')).toBe(true);
    expect(isDisabled('signup')).toBe(true);
    expect(isDisabled('password_reset')).toBe(true);
    expect(isDisabled('probes')).toBe(true);
  });

  it('ignores unknown subsystem names', () => {
    process.env.CLAIMRAIL_DISABLE = 'foobar';
    expect(disabledKeys()).toEqual([]);
  });

  it('produces a usable message', () => {
    expect(killSwitchMessage('login')).toContain('(login)');
  });
});
