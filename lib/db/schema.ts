/**
 * Drizzle schema — Postgres dialect.
 *
 * Timestamps are stored as `bigint` unix-seconds rather than Postgres
 * `timestamp`. Reasons:
 *   1. The whole codebase already passes `Math.floor(Date.now()/1000)`
 *      everywhere; switching to JS `Date` round-tripping would touch
 *      hundreds of call sites.
 *   2. Hash-chained audit rows (audit_events.row_hash) canonicalize
 *      the integer second — drift to fractional ms breaks verification.
 *
 * Booleans use real `boolean` columns now (vs. SQLite's int 0/1).
 * Drizzle handles the JS↔SQL mapping transparently.
 */
import {
  pgTable,
  text,
  bigint,
  doublePrecision,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Helper: a `bigint` column storing unix-seconds, returned as a JS number. */
const unixSeconds = (name: string) => bigint(name, { mode: 'number' });

/** Helper: `unixSeconds` column whose default is the current epoch. */
const unixSecondsNow = (name: string) =>
  unixSeconds(name).notNull().default(sql`extract(epoch from now())::bigint`);

// ─────────────────────────────────────────────────────────────────────────
// Organizations — the tenancy boundary. Every row below scopes by orgId.
// ─────────────────────────────────────────────────────────────────────────
export const orgs = pgTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  plan: text('plan', { enum: ['free', 'pro', 'enterprise'] }).notNull().default('free'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  slugIdx: uniqueIndex('orgs_slug_idx').on(t.slug),
}));

// Users & membership (a user can belong to multiple orgs)
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  // Verification status. Unverified users can log in but are redirected to
  // /verify-email until they confirm ownership of the inbox.
  emailVerifiedAt: unixSeconds('email_verified_at'),
  // 2FA: TOTP secret (encrypted) + enabled flag. We don't enforce 2FA by
  // default — users opt in from settings, but once enabled it's required
  // on every login.
  totpSecretEncrypted: text('totp_secret_encrypted'),
  totpEnabledAt: unixSeconds('totp_enabled_at'),
  // Lockout: incremented on every failed login; cleared on success.
  // When the counter hits FAILED_LOGIN_LOCK_THRESHOLD, further attempts
  // are rejected until lockedUntil is in the past.
  failedLoginCount: bigint('failed_login_count', { mode: 'number' }).notNull().default(0),
  lockedUntil: unixSeconds('locked_until'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
}));

// One-time verification tokens for email confirmation, password reset, and
// step-up auth flows. Short-lived and single-use.
export const verificationTokens = pgTable('verification_tokens', {
  id: text('id').primaryKey(),
  // Hashed token — we never store the raw token.
  tokenHash: text('token_hash').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose', {
    enum: ['email_verify', 'password_reset'],
  }).notNull(),
  expiresAt: unixSeconds('expires_at').notNull(),
  usedAt: unixSeconds('used_at'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  hashIdx: uniqueIndex('verification_tokens_hash_idx').on(t.tokenHash),
  userPurposeIdx: index('verification_tokens_user_purpose_idx').on(t.userId, t.purpose),
}));

// Password history — used to block reuse of the last N passwords.
export const passwordHistory = pgTable('password_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  userIdx: index('password_history_user_idx').on(t.userId, t.createdAt),
}));

// Short-lived record of accepted TOTP steps per user, so the same 6-digit
// code can't be replayed within its ±1-step acceptance window.
export const totpReplayNonces = pgTable('totp_replay_nonces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  step: bigint('step', { mode: 'number' }).notNull(),
  acceptedAt: unixSecondsNow('accepted_at'),
}, (t) => ({
  userStepIdx: uniqueIndex('totp_replay_user_step_idx').on(t.userId, t.step),
}));

// Per-org integration settings. Webhook URL stored encrypted so a DB
// leak alone doesn't give the attacker the customer's Slack endpoint.
export const integrations = pgTable('integrations', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['slack_webhook'] }).notNull(),
  // AES-GCM-encrypted JSON blob of whatever config the integration needs.
  configEncrypted: text('config_encrypted').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  orgIdx: index('integrations_org_idx').on(t.orgId, t.kind),
}));

// API tokens — programmatic REST access. Stored as peppered HMAC digests.
// The first 12 chars of the raw token live in the clear as `prefix` so the
// settings UI can show "crt_abc123…" without ever storing the token itself.
export const apiTokens = pgTable('api_tokens', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  tokenHash: text('token_hash').notNull(),
  scope: text('scope', { enum: ['read', 'write'] }).notNull().default('read'),
  createdAt: unixSecondsNow('created_at'),
  lastUsedAt: unixSeconds('last_used_at'),
  revokedAt: unixSeconds('revoked_at'),
}, (t) => ({
  orgIdx: index('api_tokens_org_idx').on(t.orgId),
  hashIdx: uniqueIndex('api_tokens_hash_idx').on(t.tokenHash),
}));

// Security events (distinct from the audit log — audit records successful
// state transitions; security events record attacks, anomalies, and
// defense triggers).
export const securityEvents = pgTable('security_events', {
  id: text('id').primaryKey(),
  orgId: text('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  kind: text('kind').notNull(),
  severity: text('severity', { enum: ['info', 'warn', 'high', 'critical'] }).notNull().default('info'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  country: text('country'),
  metadataJson: text('metadata_json'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  orgTimeIdx: index('security_events_org_time_idx').on(t.orgId, t.createdAt),
  kindIdx: index('security_events_kind_idx').on(t.kind),
  userIdx: index('security_events_user_idx').on(t.userId),
}));

// One-time use backup codes for TOTP recovery.
export const totpBackupCodes = pgTable('totp_backup_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: unixSeconds('used_at'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  userIdx: index('totp_backup_codes_user_idx').on(t.userId),
}));

export const memberships = pgTable('memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  userOrgIdx: uniqueIndex('memberships_user_org_idx').on(t.userId, t.orgId),
  orgIdx: index('memberships_org_idx').on(t.orgId),
}));

// Pending invitations — single-use token bound to an email + role.
// Accepting an invite either signs the recipient up fresh or (if they
// already have a ClaimRail account) adds the membership row directly.
export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  tokenHash: text('token_hash').notNull(),
  invitedBy: text('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: unixSeconds('expires_at').notNull(),
  acceptedAt: unixSeconds('accepted_at'),
  revokedAt: unixSeconds('revoked_at'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  hashIdx: uniqueIndex('invitations_hash_idx').on(t.tokenHash),
  orgEmailIdx: index('invitations_org_email_idx').on(t.orgId, t.email),
}));

// ─────────────────────────────────────────────────────────────────────────
// Vendors — the SaaS tools the customer uses and wants SLAs monitored for.
// ─────────────────────────────────────────────────────────────────────────
export const vendors = pgTable('vendors', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Status page / public monitoring URL we probe
  monitorUrl: text('monitor_url').notNull(),
  // Freeform contractual notes for humans
  notes: text('notes'),
  // Monthly spend in USD cents — drives credit calculation
  monthlySpendCents: bigint('monthly_spend_cents', { mode: 'number' }).notNull().default(0),
  // Credit support email for claim delivery
  contactEmail: text('contact_email'),
  // Active flag (pause probes without deleting)
  isActive: boolean('is_active').notNull().default(true),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  orgIdx: index('vendors_org_idx').on(t.orgId),
}));

// ─────────────────────────────────────────────────────────────────────────
// SLA terms — structured output of the parser. A vendor may have multiple
// tiers (e.g. 99.9% monthly uptime → 10% credit, 99% → 25%, <95% → 50%).
// ─────────────────────────────────────────────────────────────────────────
export const slaTerms = pgTable('sla_terms', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  // Uptime threshold as a percentage (e.g. 99.9 for three-nines)
  uptimeThresholdPct: doublePrecision('uptime_threshold_pct').notNull(),
  // Credit percentage awarded when uptime drops below threshold
  creditPct: doublePrecision('credit_pct').notNull(),
  // Sort order so we can show "tier 1", "tier 2" etc.
  tierRank: bigint('tier_rank', { mode: 'number' }).notNull().default(1),
  // Raw excerpt for evidence attachments
  sourceExcerpt: text('source_excerpt'),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  vendorIdx: index('sla_terms_vendor_idx').on(t.vendorId),
}));

// ─────────────────────────────────────────────────────────────────────────
// Probes — the raw heartbeat data. One row per HTTP check.
// ─────────────────────────────────────────────────────────────────────────
export const probes = pgTable('probes', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  // unix seconds
  checkedAt: unixSeconds('checked_at').notNull(),
  status: text('status', { enum: ['up', 'degraded', 'down'] }).notNull(),
  httpStatus: bigint('http_status', { mode: 'number' }),
  latencyMs: bigint('latency_ms', { mode: 'number' }),
  errorMessage: text('error_message'),
}, (t) => ({
  vendorTimeIdx: index('probes_vendor_time_idx').on(t.vendorId, t.checkedAt),
}));

// ─────────────────────────────────────────────────────────────────────────
// Incidents — consolidated outage windows derived from probe streams.
// ─────────────────────────────────────────────────────────────────────────
export const incidents = pgTable('incidents', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  startedAt: unixSeconds('started_at').notNull(),
  endedAt: unixSeconds('ended_at'),
  durationSeconds: bigint('duration_seconds', { mode: 'number' }),
  severity: text('severity', { enum: ['minor', 'major', 'critical'] }).notNull().default('minor'),
  summary: text('summary').notNull(),
  // Source: auto (derived from probes) or manual (user-entered from status page)
  source: text('source', { enum: ['auto', 'manual', 'webhook'] }).notNull().default('auto'),
  isResolved: boolean('is_resolved').notNull().default(false),
}, (t) => ({
  vendorIdx: index('incidents_vendor_idx').on(t.vendorId),
  startedAtIdx: index('incidents_started_at_idx').on(t.startedAt),
}));

// ─────────────────────────────────────────────────────────────────────────
// Claims — the money recovery record.
// ─────────────────────────────────────────────────────────────────────────
export const claims = pgTable('claims', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  // Billing period the claim covers (YYYY-MM)
  period: text('period').notNull(),
  // Snapshot of uptime calculation at time of claim
  measuredUptimePct: doublePrecision('measured_uptime_pct').notNull(),
  threshold: doublePrecision('threshold').notNull(),
  creditPct: doublePrecision('credit_pct').notNull(),
  // Snapshot of monthly spend used in calculation
  spendCents: bigint('spend_cents', { mode: 'number' }).notNull(),
  estimatedCreditCents: bigint('estimated_credit_cents', { mode: 'number' }).notNull(),
  // Lifecycle: drafted → filed → acknowledged → recovered / rejected
  status: text('status', {
    enum: ['drafted', 'filed', 'acknowledged', 'recovered', 'rejected'],
  }).notNull().default('drafted'),
  // Actual money recovered (may differ from estimate)
  recoveredCents: bigint('recovered_cents', { mode: 'number' }).default(0),
  emailSubject: text('email_subject').notNull(),
  emailBody: text('email_body').notNull(),
  // Evidence is a JSON blob of incident IDs + probe summary
  evidenceJson: text('evidence_json').notNull(),
  createdAt: unixSecondsNow('created_at'),
  filedAt: unixSeconds('filed_at'),
  resolvedAt: unixSeconds('resolved_at'),
}, (t) => ({
  vendorIdx: index('claims_vendor_idx').on(t.vendorId),
  periodIdx: index('claims_period_idx').on(t.period),
  vendorPeriodIdx: uniqueIndex('claims_vendor_period_idx').on(t.vendorId, t.period),
}));

// ─────────────────────────────────────────────────────────────────────────
// Sessions — simple JWT backup store for revocation support.
// ─────────────────────────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: unixSeconds('expires_at').notNull(),
  createdAt: unixSecondsNow('created_at'),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId),
}));

// ─────────────────────────────────────────────────────────────────────────
// Audit log — every mutation gets recorded, per-org.
// ─────────────────────────────────────────────────────────────────────────
export const auditEvents = pgTable('audit_events', {
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
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  // Hash chain: prev_hash is the previous event's row_hash, row_hash is
  // sha256(canonical(fields) || prev_hash). Any edit or deletion breaks it.
  prevHash: text('prev_hash'),
  rowHash: text('row_hash'),
  createdAt: unixSecondsNow('created_at'),
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
