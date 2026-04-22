import bcrypt from 'bcryptjs';

const ROUNDS = 12; // ~300ms on modern hardware; resistant to offline crack

// bcrypt silently truncates to 72 bytes; enforce at our layer too.
const MAX_LENGTH = 72;
const MIN_LENGTH = 12;

// Top-100 passwords — block the absolute worst. Real prod would use the
// haveibeenpwned k-anonymity API, but that's a network dep we don't want
// in the core auth path by default.
const COMMON_PASSWORDS = new Set(
  [
    'password', 'password1', 'password12', 'password123', 'password1234',
    'qwerty123456', 'welcome1234', 'admin1234567', 'letmein12345',
    '123456789012', '1234567890abc', 'abcdefgh', 'abcdef1234',
    'iloveyou1234', 'football1234', 'monkey123456', 'dragon123456',
    'qwertyuiop', 'adminadmin', 'passwordpassword', 'correctbatteryhorse',
    'changemeplease', 'letmeinplease', 'welcomeabcd',
  ].map((s) => s.toLowerCase()),
);

export interface PasswordPolicyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Enforce a strong-enough password policy.
 *
 * Rules:
 *   - 12–72 chars
 *   - At least 3 of {lowercase, uppercase, digit, symbol}
 *   - Not in the common-password blocklist
 *   - Not equal to the user's email or name
 */
export function checkPasswordPolicy(
  password: string,
  context: { email?: string; name?: string } = {},
): PasswordPolicyResult {
  if (typeof password !== 'string') return { ok: false, reason: 'Invalid password' };
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (password.length > MAX_LENGTH) {
    return { ok: false, reason: `Password must be at most ${MAX_LENGTH} characters.` };
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    return {
      ok: false,
      reason: 'Password must include at least 3 of: lowercase, uppercase, digit, symbol.',
    };
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return { ok: false, reason: 'This password is in the common-password blocklist.' };
  }
  if (context.email && lower.includes(context.email.toLowerCase().split('@')[0])) {
    return { ok: false, reason: 'Password cannot contain your email.' };
  }
  if (context.name && context.name.length >= 4 && lower.includes(context.name.toLowerCase())) {
    return { ok: false, reason: 'Password cannot contain your name.' };
  }
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) throw new Error(policy.reason ?? 'Invalid password');
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // bcrypt.compare is constant-time with respect to the hash; returns false
  // for malformed hashes without throwing.
  if (!hash || typeof password !== 'string') return false;
  return bcrypt.compare(password, hash);
}

/**
 * Run bcrypt against a dummy hash. Use this when a login attempt targets a
 * non-existent user so timing doesn't leak account existence.
 *
 * The hash below is bcrypt('not-a-real-password', 12).
 */
const DUMMY_HASH =
  '$2a$12$3oX9BpQJi1x1pQvr3v0ZJOE3XyO6M0cqiYqR1YxAqhtWQsE/bKZtu';

export async function runDummyVerify(): Promise<void> {
  await bcrypt.compare('placeholder-password', DUMMY_HASH);
}
