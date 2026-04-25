/**
 * Lightweight migration runner. Splits a multi-statement SQL string and
 * runs each statement once via the underlying postgres-js client.
 * Idempotent: uses CREATE IF NOT EXISTS throughout.
 *
 * Postgres dialect — see schema.ts for the canonical type mapping
 * (unix-second integers stored as BIGINT, native BOOLEAN columns).
 */
import { sqlClient } from './client';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS orgs_slug_idx ON orgs(slug);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at BIGINT,
  totp_secret_encrypted TEXT,
  totp_enabled_at BIGINT,
  failed_login_count BIGINT NOT NULL DEFAULT 0,
  locked_until BIGINT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_tokens_hash_idx ON verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS verification_tokens_user_purpose_idx ON verification_tokens(user_id, purpose);

CREATE TABLE IF NOT EXISTS totp_backup_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE INDEX IF NOT EXISTS totp_backup_codes_user_idx ON totp_backup_codes(user_id);

CREATE TABLE IF NOT EXISTS password_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE INDEX IF NOT EXISTS password_history_user_idx ON password_history(user_id, created_at);

CREATE TABLE IF NOT EXISTS totp_replay_nonces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step BIGINT NOT NULL,
  accepted_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS totp_replay_user_step_idx ON totp_replay_nonces(user_id, step);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
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
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
  last_used_at BIGINT,
  revoked_at BIGINT
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
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE INDEX IF NOT EXISTS security_events_org_time_idx ON security_events(org_id, created_at);
CREATE INDEX IF NOT EXISTS security_events_kind_idx ON security_events(kind);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
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
  expires_at BIGINT NOT NULL,
  accepted_at BIGINT,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_hash_idx ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS invitations_org_email_idx ON invitations(org_id, email);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monitor_url TEXT NOT NULL,
  notes TEXT,
  monthly_spend_cents BIGINT NOT NULL DEFAULT 0,
  contact_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE INDEX IF NOT EXISTS vendors_org_idx ON vendors(org_id);

CREATE TABLE IF NOT EXISTS sla_terms (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  uptime_threshold_pct DOUBLE PRECISION NOT NULL,
  credit_pct DOUBLE PRECISION NOT NULL,
  tier_rank BIGINT NOT NULL DEFAULT 1,
  source_excerpt TEXT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE INDEX IF NOT EXISTS sla_terms_vendor_idx ON sla_terms(vendor_id);

CREATE TABLE IF NOT EXISTS probes (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  checked_at BIGINT NOT NULL,
  status TEXT NOT NULL,
  http_status BIGINT,
  latency_ms BIGINT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS probes_vendor_time_idx ON probes(vendor_id, checked_at);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  started_at BIGINT NOT NULL,
  ended_at BIGINT,
  duration_seconds BIGINT,
  severity TEXT NOT NULL DEFAULT 'minor',
  summary TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS incidents_vendor_idx ON incidents(vendor_id);
CREATE INDEX IF NOT EXISTS incidents_started_at_idx ON incidents(started_at);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  measured_uptime_pct DOUBLE PRECISION NOT NULL,
  threshold DOUBLE PRECISION NOT NULL,
  credit_pct DOUBLE PRECISION NOT NULL,
  spend_cents BIGINT NOT NULL,
  estimated_credit_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted',
  recovered_cents BIGINT DEFAULT 0,
  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint,
  filed_at BIGINT,
  resolved_at BIGINT
);
CREATE INDEX IF NOT EXISTS claims_vendor_idx ON claims(vendor_id);
CREATE INDEX IF NOT EXISTS claims_period_idx ON claims(period);
CREATE UNIQUE INDEX IF NOT EXISTS claims_vendor_period_idx ON claims(vendor_id, period);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
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
  seq BIGINT NOT NULL DEFAULT 0,
  prev_hash TEXT,
  row_hash TEXT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
);
CREATE INDEX IF NOT EXISTS audit_org_seq_idx ON audit_events(org_id, seq);
CREATE INDEX IF NOT EXISTS audit_org_time_idx ON audit_events(org_id, created_at);
`;

const MIGRATION_PATCHES = [
  // Older DBs may not have the hash-chain columns. Add them if missing.
  // Postgres supports IF NOT EXISTS on ADD COLUMN since v9.6.
  'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT 0',
  'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash TEXT',
  'ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS row_hash TEXT',
  // Security phase 2 columns on users.
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at BIGINT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at BIGINT',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count BIGINT NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until BIGINT',
];

/** Split a SQL bundle into individual statements, ignoring blank/comment lines. */
function splitStatements(bundle: string): string[] {
  return bundle
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
}

export async function migrate(): Promise<void> {
  for (const stmt of splitStatements(SCHEMA_SQL)) {
    await sqlClient.unsafe(stmt);
  }
  for (const stmt of MIGRATION_PATCHES) {
    try {
      await sqlClient.unsafe(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      // Postgres "duplicate column" error code is 42701; we swallow only
      // those, so any other failure still surfaces.
      if (!/duplicate column|already exists|42701/i.test(msg)) throw err;
    }
  }
}

const invokedDirectly = process.argv[1]?.endsWith('migrate.ts');
if (invokedDirectly) {
  migrate()
    .then(async () => {
      // eslint-disable-next-line no-console
      console.log('✓ Database migrated.');
      await sqlClient.end({ timeout: 5 });
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error('Migrate failed:', err);
      await sqlClient.end({ timeout: 5 }).catch(() => null);
      process.exit(1);
    });
}
