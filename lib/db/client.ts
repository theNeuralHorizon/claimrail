// Side-effect import: freezes Object.prototype etc. at boot to neutralise
// prototype-pollution payloads before any JSON is parsed server-side.
import '@/lib/security/freeze';

import { createClient, type Client, type Config as LibsqlConfig } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'node:path';

/**
 * Resolve the libsql connection config from DATABASE_URL.
 *
 * Supports three forms:
 *   1. Empty / unset                   → local file `claimrail.db` in CWD
 *   2. `./file.db` or absolute path    → local file at that path
 *   3. `file:...`                      → local file (explicit scheme)
 *   4. `libsql://...` or `https://...` → remote Turso; DATABASE_AUTH_TOKEN
 *                                         is then required
 *
 * This lets us use the same `@libsql/client` everywhere — local SQLite for
 * dev/tests, Turso-hosted libsql in production — with no code branch per
 * environment.
 */
function resolveLibsqlConfig(): LibsqlConfig {
  const raw = process.env.DATABASE_URL?.trim();
  const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();

  // Remote libsql (Turso). The auth token is mandatory for any remote URL;
  // failing loud here beats cryptic 401s at first query time.
  if (raw && (raw.startsWith('libsql://') || raw.startsWith('https://') || raw.startsWith('wss://'))) {
    if (!authToken) {
      throw new Error(
        'DATABASE_URL is remote (libsql://…) but DATABASE_AUTH_TOKEN is not set. ' +
          'Create a token in the Turso dashboard and set it as an environment variable.',
      );
    }
    return { url: raw, authToken };
  }

  // Local file. Accept bare paths, `./foo.db`, or explicit `file:` scheme.
  let file: string;
  if (!raw) {
    file = path.join(process.cwd(), 'claimrail.db');
  } else if (raw.startsWith('file:')) {
    file = raw.slice('file:'.length);
  } else {
    file = raw;
  }
  // Windows path separators break libsql's URL parser.
  return { url: `file:${file.replace(/\\/g, '/')}` };
}

// Re-use connection across hot reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __claimrailLibsql: Client | undefined;
}

const client =
  globalThis.__claimrailLibsql ?? createClient(resolveLibsqlConfig());

if (process.env.NODE_ENV !== 'production') {
  globalThis.__claimrailLibsql = client;
}

export const db = drizzle(client, { schema });
export const libsql = client;
export * from './schema';
