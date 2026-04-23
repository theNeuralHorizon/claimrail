/**
 * Lightweight migration runner. Runs each statement once via libsql's
 * executeMultiple. Idempotent: uses CREATE IF NOT EXISTS throughout.
 */
import { libsql } from './client';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS orgs_slug_idx ON orgs(slug);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at INTEGER,
  totp_secret_encrypted TEXT,
  totp_enabled_at INTEGER,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_tokens_hash_idx ON verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS verification_tokens_user_purpose_idx ON verification_tokens(user_id, purpose);

CREATE TABLE IF NOT EXISTS totp_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS totp_backup_codes_user_idx ON totp_backup_codes(user_id);

CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS password_history_user_idx ON password_history(user_id, created_at);

CREATE TABLE IF NOT EXISTS totp_replay_nonces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  accepted_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS totp_replay_user_step_idx ON totp_replay_nonces(user_id, step);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS integrations_org_idx ON integrations(org_id, kind);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS api_tokens_org_idx ON api_tokens(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_idx ON api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  ip TEXT,
  user_agent TEXT,
  country TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS security_events_org_time_idx ON security_events(org_id, created_at);
CREATE INDEX IF NOT EXISTS security_events_kind_idx ON security_events(kind);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_org_idx ON memberships(user_id, org_id);
CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships(org_id);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_hash_idx ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS invitations_org_email_idx ON invitations(org_id, email);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monitor_url TEXT NOT NULL,
  notes TEXT,
  monthly_spend_cents INTEGER NOT NULL DEFAULT 0,
  contact_email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS vendors_org_idx ON vendors(org_id);

CREATE TABLE IF NOT EXISTS sla_terms (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  uptime_threshold_pct REAL NOT NULL,
  credit_pct REAL NOT NULL,
  tier_rank INTEGER NOT NULL DEFAULT 1,
  source_excerpt TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS sla_terms_vendor_idx ON sla_terms(vendor_id);

CREATE TABLE IF NOT EXISTS probes (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  checked_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS probes_vendor_time_idx ON probes(vendor_id, checked_at);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER,
  severity TEXT NOT NULL DEFAULT 'minor',
  summary TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  is_resolved INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS incidents_vendor_idx ON incidents(vendor_id);
CREATE INDEX IF NOT EXISTS incidents_started_at_idx ON incidents(started_at);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  measured_uptime_pct REAL NOT NULL,
  threshold REAL NOT NULL,
  credit_pct REAL NOT NULL,
  spend_cents INTEGER NOT NULL,
  estimated_credit_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted',
  recovered_cents INTEGER DEFAULT 0,
  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  filed_at INTEGER,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS claims_vendor_idx ON claims(vendor_id);
CREATE INDEX IF NOT EXISTS claims_period_idx ON claims(period);
CREATE UNIQUE INDEX IF NOT EXISTS claims_vendor_period_idx ON claims(vendor_id, period);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  metadata_json TEXT,
  seq INTEGER NOT NULL DEFAULT 0,
  prev_hash TEXT,
  row_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS audit_org_seq_idx ON audit_events(org_id, seq);
CREATE INDEX IF NOT EXISTS audit_org_time_idx ON audit_events(org_id, created_at);
`;

const MIGRATION_PATCHES = [
  // Older DBs may not have the hash-chain columns. Add them if missing.
  "ALTER TABLE audit_events ADD COLUMN seq INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE audit_events ADD COLUMN prev_hash TEXT",
  "ALTER TABLE audit_events ADD COLUMN row_hash TEXT",
  // Security phase 2 columns on users.
  "ALTER TABLE users ADD COLUMN email_verified_at INTEGER",
  "ALTER TABLE users ADD COLUMN totp_secret_encrypted TEXT",
  "ALTER TABLE users ADD COLUMN totp_enabled_at INTEGER",
  "ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN locked_until INTEGER",
];

export async function migrate(): Promise<void> {
  await libsql.executeMultiple(SCHEMA_SQL);
  // Apply forward-compatible ALTERs. Ignore errors for columns that already
  // exist (SQLite raises "duplicate column name" on second run).
  for (const stmt of MIGRATION_PATCHES) {
    try {
      await libsql.execute(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!/duplicate column|already exists/i.test(msg)) throw err;
    }
  }
}

const invokedDirectly = process.argv[1]?.endsWith('migrate.ts');
if (invokedDirectly) {
  migrate()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('✓ Database migrated.');
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Migrate failed:', err);
      process.exit(1);
    });
}
