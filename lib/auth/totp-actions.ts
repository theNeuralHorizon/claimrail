'use server';

import { db } from '@/lib/db/client';
import { users, totpBackupCodes, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getAuthContext } from './session';
import { rateLimit } from '@/lib/rate-limit';
import { appendAuditEvent } from '@/lib/audit/chain';
import { verifyPassword } from './password';
import {
  decryptFromJson,
  encryptToJson,
  generateBackupCodes,
  generateTotpSecret,
  hashToken,
  totpProvisioningUri,
  verifyTotp,
} from '@/lib/security/crypto';

export type TotpState = {
  error?: string;
  success?: string;
  secret?: string;
  otpauthUri?: string;
  backupCodes?: string[];
};

const startSchema = z.object({
  password: z.string().min(1).max(128),
});

/**
 * Step 1 of enabling TOTP: user confirms their password and we produce a
 * fresh secret + QR URI. The secret is NOT persisted yet — it's returned
 * to the client for display and passed back on confirm.
 */
export async function startTotpSetupAction(
  _prev: TotpState,
  formData: FormData,
): Promise<TotpState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  const rl = rateLimit(`totp-setup:${ctx.user.id}`, {
    limit: 10,
    windowSeconds: 3600,
  });
  if (!rl.allowed) return { error: 'Too many attempts. Wait an hour.' };

  const parsed = startSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: 'Invalid input.' };

  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).then((r) => r[0]);
  if (!user) return { error: 'Account not found.' };
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return { error: 'Password incorrect.' };

  const secret = generateTotpSecret();
  const otpauthUri = totpProvisioningUri({
    secret,
    issuer: 'ClaimRail',
    account: user.email,
  });
  return { secret, otpauthUri };
}

const confirmSchema = z.object({
  secret: z.string().min(16).max(128),
  code: z.string().regex(/^\d{6}$/),
});

/**
 * Step 2: user types the 6-digit code from their authenticator. If it
 * validates, we encrypt + persist the secret, generate backup codes, and
 * flip `totpEnabledAt`.
 */
export async function confirmTotpSetupAction(
  _prev: TotpState,
  formData: FormData,
): Promise<TotpState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };

  const parsed = confirmSchema.safeParse({
    secret: formData.get('secret'),
    code: formData.get('code'),
  });
  if (!parsed.success) return { error: 'Code must be 6 digits.' };

  if (!verifyTotp(parsed.data.secret, parsed.data.code)) {
    return { error: 'Incorrect code. Try again.' };
  }

  const encrypted = encryptToJson(parsed.data.secret);
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(users)
    .set({ totpSecretEncrypted: encrypted, totpEnabledAt: now })
    .where(eq(users.id, ctx.user.id))
    ;

  // Clear any old backup codes and issue 10 fresh ones.
  await db.delete(totpBackupCodes).where(eq(totpBackupCodes.userId, ctx.user.id));
  const codes = generateBackupCodes(10);
  for (const code of codes) {
    await db
      .insert(totpBackupCodes)
      .values({
        id: nanoid(16),
        userId: ctx.user.id,
        codeHash: hashToken(code.toLowerCase().replace(/\s+/g, '')),
      })
      ;
  }

  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'auth.totp.enable',
    resource: 'user',
    resourceId: ctx.user.id,
  });

  return {
    success: 'Two-factor authentication enabled. Save your backup codes below.',
    backupCodes: codes,
  };
}

const disableSchema = z.object({
  password: z.string().min(1).max(128),
});

export async function disableTotpAction(
  _prev: TotpState,
  formData: FormData,
): Promise<TotpState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: 'Sign in first.' };
  const parsed = disableSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: 'Password required.' };

  const user = await db.select().from(users).where(eq(users.id, ctx.user.id)).then((r) => r[0]);
  if (!user) return { error: 'Account not found.' };
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return { error: 'Password incorrect.' };

  await db
    .update(users)
    .set({ totpSecretEncrypted: null, totpEnabledAt: null })
    .where(eq(users.id, ctx.user.id))
    ;
  await db.delete(totpBackupCodes).where(eq(totpBackupCodes.userId, ctx.user.id));

  // Disabling 2FA is a significant auth event — revoke every other session.
  const { currentSessionId } = await import('./session');
  const current = await currentSessionId();
  const all = await db.select().from(sessions).where(eq(sessions.userId, ctx.user.id));
  for (const s of all) {
    if (s.id !== current) {
      await db.delete(sessions).where(eq(sessions.id, s.id));
    }
  }

  await appendAuditEvent({
    orgId: ctx.org.id,
    actorId: ctx.user.id,
    action: 'auth.totp.disable',
    resource: 'user',
    resourceId: ctx.user.id,
  });

  // Re-use confirmTotpSetupAction shape — `decryptFromJson` is only imported
  // to keep it included for type-checking; not used here.
  void decryptFromJson;

  return { success: '2FA disabled.' };
}
