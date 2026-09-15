/* eslint-disable no-console */
// Rotates the free-tier Render Postgres database before it expires (free
// Postgres instances are deleted 30 days after creation — see the incident
// where dpg-d7mae0hkh4rs73ajen5g-a silently vanished and every DB-touching
// request started throwing ENOTFOUND).
//
// Stateless by design: it reads the *current* DATABASE_URL straight off the
// live web service, extracts the Postgres id from the hostname, and checks
// that instance's expiresAt. Nothing is cached between runs, so there's no
// drift to get out of sync.
//
// Steps when rotation is due (expiresAt within ROTATE_WITHIN_DAYS):
//   1. Delete the old Postgres instance.
//   2. Create a new free Postgres instance in the same region.
//   3. Wait for it to become available, fetch its connection info.
//   4. Run migrations against it (drizzle — lib/db/migrate.ts).
//   5. Point the web service's DATABASE_URL at it (Render auto-redeploys).
//   6. Wait for the new deploy to go live, smoke-test /api/health.
//
// Delete-then-create (not the other way round) because Render's free plan
// allows only one active free Postgres instance per account — attempting
// to create the replacement before deleting the old one is rejected with
// "cannot have more than one active free tier database". That means a
// real downtime window during rotation (old DB gone until the new one is
// migrated and cut over, typically well under a minute) — acceptable for
// a low-traffic app, but worth knowing if this ever gets busier: upgrade
// off the free Postgres plan and drop this workflow, or switch it to
// create-then-delete once on a plan that allows two concurrent instances.
//
// If any step after (1) fails, prod is left with NO working database
// until the next successful run or manual intervention — this workflow
// trades a small maintenance window for never silently going stale again.
//
// Required env:
//   RENDER_API_KEY   Render API key (Account Settings → API Keys)
//   SERVICE_ID       srv-… id of the claimrail web service
//   OWNER_ID         tea-… workspace id to create the new Postgres under
// Optional env:
//   ROTATE_WITHIN_DAYS   default 7
//   REGION               default virginia
//   APP_URL              default https://claimrail-tj98.onrender.com

import { execFileSync } from 'node:child_process';

const API = 'https://api.render.com/v1';
const KEY = requireEnv('RENDER_API_KEY');
const SERVICE_ID = requireEnv('SERVICE_ID');
const OWNER_ID = requireEnv('OWNER_ID');
const ROTATE_WITHIN_DAYS = Number(process.env.ROTATE_WITHIN_DAYS ?? '7');
const REGION = process.env.REGION ?? 'virginia';
const APP_URL = process.env.APP_URL ?? 'https://claimrail-tj98.onrender.com';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`::error::Missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

async function render(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Render API ${init.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function poll(fn, { intervalMs = 5000, timeoutMs = 180_000, label }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(intervalMs);
  }
}

function currentPostgresIdFromUrl(databaseUrl) {
  // postgresql://user:pass@dpg-xxxxx-a/dbname
  const host = new URL(databaseUrl).hostname;
  if (!/^dpg-[a-z0-9]+-a$/.test(host)) {
    throw new Error(`Unexpected DATABASE_URL host shape: ${host}`);
  }
  return host;
}

console.log('→ reading current DATABASE_URL from the live service');
const envVars = await render(`/services/${SERVICE_ID}/env-vars`);
const dbVar = envVars.find((v) => v.envVar?.key === 'DATABASE_URL');
if (!dbVar) throw new Error('DATABASE_URL not set on service — nothing to rotate');
const currentDbId = currentPostgresIdFromUrl(dbVar.envVar.value);
console.log(`  current Postgres id: ${currentDbId}`);

const current = await render(`/postgres/${currentDbId}`);
const expiresAt = current.expiresAt ? new Date(current.expiresAt) : null;
console.log(`  expiresAt: ${expiresAt ? expiresAt.toISOString() : '(no expiry — not free tier)'}`);

if (!expiresAt) {
  console.log('✓ current database has no expiry (paid plan) — nothing to do');
  process.exit(0);
}

const daysLeft = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
console.log(`  days left: ${daysLeft.toFixed(1)}`);
if (daysLeft > ROTATE_WITHIN_DAYS) {
  console.log(`✓ not due for rotation yet (threshold ${ROTATE_WITHIN_DAYS}d)`);
  process.exit(0);
}

console.log(`→ rotation due — deleting old Postgres instance ${currentDbId} first`);
console.log('  (free plan allows only one active free Postgres at a time)');
await render(`/postgres/${currentDbId}`, { method: 'DELETE' });

console.log('→ creating new Postgres instance');
const created = await render('/postgres', {
  method: 'POST',
  body: JSON.stringify({
    name: `claimrail-db-${Date.now()}`,
    ownerId: OWNER_ID,
    plan: 'free',
    region: REGION,
    version: '17',
  }),
});
const newDbId = created.id;
console.log(`  created ${newDbId}, waiting for it to become available`);

await poll(
  async () => {
    const db = await render(`/postgres/${newDbId}`);
    return db.status === 'available' ? db : null;
  },
  { label: 'new Postgres available', timeoutMs: 180_000 },
);

const conn = await render(`/postgres/${newDbId}/connection-info`);
const newDatabaseUrl = conn.internalConnectionString;
if (!newDatabaseUrl) throw new Error('connection-info returned no internalConnectionString');

console.log('→ running migrations against the new database');
execFileSync('npx', ['tsx', 'lib/db/migrate.ts'], {
  env: { ...process.env, DATABASE_URL: newDatabaseUrl },
  stdio: 'inherit',
});

console.log('→ pointing the live service at the new database');
const cutoverStartedAt = Date.now();
await render(`/services/${SERVICE_ID}/env-vars/DATABASE_URL`, {
  method: 'PUT',
  body: JSON.stringify({ value: newDatabaseUrl }),
});

console.log('→ waiting for the resulting deploy to go live');
const deploy = await poll(
  async () => {
    const deploys = await render(`/services/${SERVICE_ID}/deploys?limit=5`);
    // Only consider deploys created after the env var update — an older
    // "live" deploy already in the list would otherwise pass immediately.
    const latest = deploys
      .map((d) => d.deploy)
      .find((d) => new Date(d.createdAt).getTime() >= cutoverStartedAt);
    if (!latest) return null;
    if (latest.status === 'live') return latest;
    if (['build_failed', 'update_failed', 'deactivated', 'canceled'].includes(latest.status)) {
      throw new Error(`Deploy ${latest.id} ended with status ${latest.status}`);
    }
    return null;
  },
  { label: 'new deploy live', timeoutMs: 300_000 },
);
console.log(`  deploy ${deploy.id} is live`);

console.log('→ smoke-testing /api/health');
const health = await poll(
  async () => {
    const res = await fetch(`${APP_URL}/api/health`).catch(() => null);
    if (!res || !res.ok) return null;
    const body = await res.json();
    return body?.checks?.db?.ok ? body : null;
  },
  { label: '/api/health db.ok', timeoutMs: 60_000, intervalMs: 5000 },
);
console.log(`  health OK: ${JSON.stringify(health.checks)}`);

console.log(`✓ rotation complete: ${currentDbId} → ${newDbId}`);
