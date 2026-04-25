// Side-effect import: freezes Object.prototype etc. at boot to neutralise
// prototype-pollution payloads before any JSON is parsed server-side.
import '@/lib/security/freeze';

import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres, { type Sql } from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import * as schema from './schema';

/**
 * DB client resolution.
 *
 *   DATABASE_URL=postgres://… (or postgresql://)  → postgres-js, real Postgres
 *   DATABASE_URL=pglite://./local-data            → PGlite, on-disk file
 *   DATABASE_URL=pglite::memory:                  → PGlite, in-memory (default)
 *   DATABASE_URL=./foo.db   /  unset              → PGlite at <cwd>/claimrail-data
 *
 * The two adapter types share Drizzle's `pg-core` schema (see schema.ts) so
 * application code is dialect-agnostic. PGlite is wire-compatible with
 * Postgres for everything we use.
 */

type AnyDrizzle = ReturnType<typeof drizzlePg<typeof schema>>
  | ReturnType<typeof drizzlePglite<typeof schema>>;

interface ClientBundle {
  db: AnyDrizzle;
  /**
   * Raw SQL escape hatch — used by migrate.ts to run multi-statement DDL.
   * Both drivers expose an `unsafe(sql)` method, so this normalises across
   * them.
   */
  unsafe: (sql: string) => Promise<unknown>;
  /** Close all open connections. */
  end: (opts?: { timeout?: number }) => Promise<void>;
  /** Postgres-js connection (when in real-Postgres mode), else null. */
  pgClient: Sql | null;
  /** PGlite instance (when in embedded mode), else null. */
  pglite: PGlite | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __claimrailDbBundle: ClientBundle | undefined;
}

function buildBundle(): ClientBundle {
  const raw = process.env.DATABASE_URL?.trim();

  // Real Postgres — Render, Neon, RDS, etc.
  if (raw && (raw.startsWith('postgres://') || raw.startsWith('postgresql://'))) {
    // Render-managed Postgres requires TLS but presents a self-signed cert
    // (their `*.render.com` chain). `ssl: 'require'` performs a TLS
    // handshake without verifying the chain — appropriate for managed
    // services where the host is the auth boundary.
    const usesTls =
      /sslmode=require/i.test(raw) ||
      raw.includes('.render.com') ||
      raw.includes('.neon.tech') ||
      raw.includes('.aws.neon.tech');

    const pg = postgres(raw, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: usesTls ? 'require' : undefined,
    });

    return {
      db: drizzlePg(pg, { schema }),
      unsafe: (s: string) => pg.unsafe(s),
      end: async (opts) => {
        await pg.end({ timeout: opts?.timeout ?? 5 });
      },
      pgClient: pg,
      pglite: null,
    };
  }

  // Embedded PGlite — local dev, CI, tests.
  let dataDir: string | undefined;
  if (raw?.startsWith('pglite::memory:') || raw === ':memory:') {
    dataDir = undefined; // memory mode
  } else if (raw?.startsWith('pglite://')) {
    dataDir = raw.slice('pglite://'.length);
  } else if (raw && !raw.startsWith('postgres')) {
    // Treat any non-postgres URL as a local data directory path.
    dataDir = raw.replace(/^file:/, '');
  } else {
    dataDir = path.join(process.cwd(), 'claimrail-data');
  }

  const pglite = new PGlite(dataDir);
  return {
    db: drizzlePglite(pglite, { schema }),
    unsafe: async (s: string) => {
      // PGlite's `exec` runs multiple statements; `query` is single-statement.
      // Migrations use single statements split client-side, so we can use
      // `query` for parity with postgres-js's `unsafe`.
      await pglite.query(s);
    },
    end: async () => {
      await pglite.close();
    },
    pgClient: null,
    pglite,
  };
}

const bundle = globalThis.__claimrailDbBundle ?? buildBundle();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__claimrailDbBundle = bundle;
}

export const db = bundle.db;
/** Raw SQL escape hatch for migrations + ad-hoc admin scripts. */
export const sqlClient = {
  unsafe: bundle.unsafe,
  end: bundle.end,
};
export * from './schema';
