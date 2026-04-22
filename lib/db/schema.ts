import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────
// Organizations — the tenancy boundary. Every row below scopes by orgId.
// ─────────────────────────────────────────────────────────────────────────
export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  plan: text('plan', { enum: ['free', 'pro', 'enterprise'] }).notNull().default('free'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  slugIdx: uniqueIndex('orgs_slug_idx').on(t.slug),
}));

// Users & membership (a user can belong to multiple orgs)
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  // Verification status. Unverified users can log in but are redirected to
  // /verify-email until they confirm ownership of the inbox.
  emailVerifiedAt: integer('email_verified_at'),
  // 2FA: TOTP secret (encrypted) + enabled flag. We don't enforce 2FA by
  // default — users opt in from settings, but once enabled it's required
  // on every login.
  totpSecretEncrypted: text('totp_secret_encrypted'),
  totpEnabledAt: integer('totp_enabled_at'),
  // Lockout: incremented on every failed login; cleared on success.
  // When the counter hits FAILED_LOGIN_LOCK_THRESHOLD, further attempts
  // are rejected until lockedUntil is in the past.
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: integer('locked_until'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}));

// One-time verification tokens for email confirmation, password reset, and
// step-up auth flows. Short-lived and single-use.
export const verificationTokens = sqliteTable('verification_tokens', {
  id: text('id').primaryKey(),
  // Hashed token — we never store the raw token.
  tokenHash: text('token_hash').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose', {
    enum: ['email_verify', 'password_reset'],
  }).notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  hashIdx: uniqueIndex('verification_tokens_hash_idx').on(t.tokenHash),
  userPurposeIdx: index('verification_tokens_user_purpose_idx').on(t.userId, t.purpose),
}));

// Password history — used to block reuse of the last N passwords.
export const passwordHistory = sqliteTable('password_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('password_history_user_idx').on(t.userId, t.createdAt),
}));

// Short-lived record of accepted TOTP steps per user, so the same 6-digit
// code can't be replayed within its ±1-step acceptance window.
export const totpReplayNonces = sqliteTable('totp_replay_nonces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  step: integer('step').notNull(),
  acceptedAt: integer('accepted_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userStepIdx: uniqueIndex('totp_replay_user_step_idx').on(t.userId, t.step),
}));

// Security events (distinct from the audit log — audit records successful
// state transitions; security events record attacks, anomalies, and
// defense triggers).
export const securityEvents = sqliteTable('security_events', {
  id: text('id').primaryKey(),
  orgId: text('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  kind: text('kind').notNull(),
  severity: text('severity', { enum: ['info', 'warn', 'high', 'critical'] }).notNull().default('info'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  country: text('country'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  orgTimeIdx: index('security_events_org_time_idx').on(t.orgId, t.createdAt),
  kindIdx: index('security_events_kind_idx').on(t.kind),
  userIdx: index('security_events_user_idx').on(t.userId),
}));

// One-time use backup codes for TOTP recovery.
export const totpBackupCodes = sqliteTable('totp_backup_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('totp_backup_codes_user_idx').on(t.userId),
}));

export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userOrgIdx: uniqueIndex('memberships_user_org_idx').on(t.userId, t.orgId),
  orgIdx: index('memberships_org_idx').on(t.orgId),
}));

// ─────────────────────────────────────────────────────────────────────────
// Vendors — the SaaS tools the customer uses and wants SLAs monitored for.
// ─────────────────────────────────────────────────────────────────────────
export const vendors = sqliteTable('vendors', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Status page / public monitoring URL we probe
  monitorUrl: text('monitor_url').notNull(),
  // Freeform contractual notes for humans
  notes: text('notes'),
  // Monthly spend in USD cents — drives credit calculation
  monthlySpendCents: integer('monthly_spend_cents').notNull().default(0),
  // Credit support email for claim delivery
  contactEmail: text('contact_email'),
  // Active flag (pause probes without deleting)
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  orgIdx: index('vendors_org_idx').on(t.orgId),
}));

// ─────────────────────────────────────────────────────────────────────────
// SLA terms — structured output of the parser. A vendor may have multiple
// tiers (e.g. 99.9% monthly uptime → 10% credit, 99% → 25%, <95% → 50%).
// ─────────────────────────────────────────────────────────────────────────
export const slaTerms = sqliteTable('sla_terms', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  // Uptime threshold as a percentage (e.g. 99.9 for three-nines)
  uptimeThresholdPct: real('uptime_threshold_pct').notNull(),
  // Credit percentage awarded when uptime drops below threshold
  creditPct: real('credit_pct').notNull(),
  // Sort order so we can show "tier 1", "tier 2" etc.
  tierRank: integer('tier_rank').notNull().default(1),
  // Raw excerpt for evidence attachments
  sourceExcerpt: text('source_excerpt'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  vendorIdx: index('sla_terms_vendor_idx').on(t.vendorId),
}));

// ─────────────────────────────────────────────────────────────────────────
// Probes — the raw heartbeat data. One row per HTTP check.
// ─────────────────────────────────────────────────────────────────────────
export const probes = sqliteTable('probes', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  // unix seconds
  checkedAt: integer('checked_at').notNull(),
  status: text('status', { enum: ['up', 'degraded', 'down'] }).notNull(),
  httpStatus: integer('http_status'),
  latencyMs: integer('latency_ms'),
  errorMessage: text('error_message'),
}, (t) => ({
  vendorTimeIdx: index('probes_vendor_time_idx').on(t.vendorId, t.checkedAt),
}));

// ─────────────────────────────────────────────────────────────────────────
// Incidents — consolidated outage windows derived from probe streams.
// ─────────────────────────────────────────────────────────────────────────
export const incidents = sqliteTable('incidents', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  durationSeconds: integer('duration_seconds'),
  severity: text('severity', { enum: ['minor', 'major', 'critical'] }).notNull().default('minor'),
  summary: text('summary').notNull(),
  // Source: auto (derived from probes) or manual (user-entered from status page)
  source: text('source', { enum: ['auto', 'manual', 'webhook'] }).notNull().default('auto'),
  isResolved: integer('is_resolved', { mode: 'boolean' }).notNull().default(false),
}, (t) => ({
  vendorIdx: index('incidents_vendor_idx').on(t.vendorId),
  startedAtIdx: index('incidents_started_at_idx').on(t.startedAt),
}));

// ─────────────────────────────────────────────────────────────────────────
// Claims — the money recovery record.
// ─────────────────────────────────────────────────────────────────────────
export const claims = sqliteTable('claims', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  // Billing period the claim covers (YYYY-MM)
  period: text('period').notNull(),
  // Snapshot of uptime calculation at time of claim
  measuredUptimePct: real('measured_uptime_pct').notNull(),
  threshold: real('threshold').notNull(),
  creditPct: real('credit_pct').notNull(),
  // Snapshot of monthly spend used in calculation
  spendCents: integer('spend_cents').notNull(),
  estimatedCreditCents: integer('estimated_credit_cents').notNull(),
  // Lifecycle: drafted → filed → acknowledged → recovered / rejected
  status: text('status', {
    enum: ['drafted', 'filed', 'acknowledged', 'recovered', 'rejected'],
  }).notNull().default('drafted'),
  // Actual money recovered (may differ from estimate)
  recoveredCents: integer('recovered_cents').default(0),
  emailSubject: text('email_subject').notNull(),
  emailBody: text('email_body').notNull(),
  // Evidence is a JSON blob of incident IDs + probe summary
  evidenceJson: text('evidence_json').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  filedAt: integer('filed_at'),
  resolvedAt: integer('resolved_at'),
}, (t) => ({
  vendorIdx: index('claims_vendor_idx').on(t.vendorId),
  periodIdx: index('claims_period_idx').on(t.period),
  vendorPeriodIdx: uniqueIndex('claims_vendor_period_idx').on(t.vendorId, t.period),
}));

// ─────────────────────────────────────────────────────────────────────────
// Sessions — simple JWT backup store for revocation support.
// ─────────────────────────────────────────────────────────────────────────
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId),
}));

// ─────────────────────────────────────────────────────────────────────────
// Audit log — every mutation gets recorded, per-org.
// ─────────────────────────────────────────────────────────────────────────
export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  metadataJson: text('metadata_json'),
  // Strictly monotonic per-org sequence number. Used as the canonical
  // ordering key for the hash chain (wall-clock timestamps aren't
  // precise enough on fast consecutive inserts).
  seq: integer('seq').notNull().default(0),
  // Hash chain: prev_hash is the previous event's row_hash, row_hash is
  // sha256(canonical(fields) || prev_hash). Any edit or deletion breaks it.
  prevHash: text('prev_hash'),
  rowHash: text('row_hash'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  orgSeqIdx: index('audit_org_seq_idx').on(t.orgId, t.seq),
  orgTimeIdx: index('audit_org_time_idx').on(t.orgId, t.createdAt),
}));

// Types exported for app code
export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type SlaTerm = typeof slaTerms.$inferSelect;
export type Probe = typeof probes.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
