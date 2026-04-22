/**
 * Security events — attacks, anomalies, and defense triggers.
 *
 * Distinct from the audit log:
 *   - audit_events records successful state transitions that matter for
 *     compliance ("vendor.create", "claim.update", "auth.password.change").
 *   - security_events records adversarial activity ("login.failed",
 *     "auth.locked", "csrf.rejected", "ssrf.blocked", "totp.replay",
 *     "anomaly.impossible_travel"...).
 *
 * Both feed the admin incident timeline.
 */
import { db } from '@/lib/db/client';
import { securityEvents } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { safeForLog } from './sanitize';

export type SecurityKind =
  | 'login.success'
  | 'login.failed'
  | 'login.locked'
  | 'login.rate_limited'
  | 'signup.rate_limited'
  | 'signup.honeypot'
  | 'signup.too_fast'
  | 'totp.failed'
  | 'totp.replay'
  | 'totp.rate_limited'
  | 'password.reset.requested'
  | 'password.reset.succeeded'
  | 'password.change.succeeded'
  | 'password.history.rejected'
  | 'session.fingerprint_mismatch'
  | 'session.absolute_expired'
  | 'csrf.rejected'
  | 'ssrf.blocked'
  | 'redos.budget_exceeded'
  | 'anomaly.impossible_travel'
  | 'anomaly.new_device'
  | 'kill_switch.engaged'
  | 'suspicious.input';

export interface LogSecurityEvent {
  kind: SecurityKind;
  severity?: 'info' | 'warn' | 'high' | 'critical';
  userId?: string | null;
  orgId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_SEVERITY: Record<SecurityKind, 'info' | 'warn' | 'high' | 'critical'> = {
  'login.success': 'info',
  'login.failed': 'info',
  'login.locked': 'warn',
  'login.rate_limited': 'warn',
  'signup.rate_limited': 'warn',
  'signup.honeypot': 'high',
  'signup.too_fast': 'warn',
  'totp.failed': 'warn',
  'totp.replay': 'high',
  'totp.rate_limited': 'warn',
  'password.reset.requested': 'info',
  'password.reset.succeeded': 'warn',
  'password.change.succeeded': 'info',
  'password.history.rejected': 'info',
  'session.fingerprint_mismatch': 'high',
  'session.absolute_expired': 'info',
  'csrf.rejected': 'high',
  'ssrf.blocked': 'high',
  'redos.budget_exceeded': 'warn',
  'anomaly.impossible_travel': 'high',
  'anomaly.new_device': 'warn',
  'kill_switch.engaged': 'critical',
  'suspicious.input': 'warn',
};

export async function logSecurityEvent(evt: LogSecurityEvent): Promise<void> {
  const severity = evt.severity ?? DEFAULT_SEVERITY[evt.kind] ?? 'info';
  await db
    .insert(securityEvents)
    .values({
      id: nanoid(16),
      orgId: evt.orgId ?? null,
      userId: evt.userId ?? null,
      kind: evt.kind,
      severity,
      ip: evt.ip ?? null,
      userAgent: evt.userAgent?.slice(0, 300) ?? null,
      country: evt.country ?? null,
      metadataJson: evt.metadata ? JSON.stringify(evt.metadata) : null,
    })
    .run();
  // Mirror to stdout — log-injection-safe. In prod you'd pipe this to
  // Datadog / Splunk / your SIEM.
  // eslint-disable-next-line no-console
  console.warn(
    `[sec ${severity}] ${safeForLog(evt.kind)} ip=${safeForLog(evt.ip ?? '')} user=${safeForLog(evt.userId ?? '')} org=${safeForLog(evt.orgId ?? '')}`,
  );
}
