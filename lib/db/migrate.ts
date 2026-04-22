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
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_org_idx ON memberships(user_id, org_id);
CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships(org_id);

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
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS audit_org_time_idx ON audit_events(org_id, created_at);
`;

export async function migrate(): Promise<void> {
  await libsql.executeMultiple(SCHEMA_SQL);
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
