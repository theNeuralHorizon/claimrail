// Side-effect import: freezes Object.prototype etc. at boot to neutralise
// prototype-pollution payloads before any JSON is parsed server-side.
import '@/lib/security/freeze';

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'node:path';

const DB_FILE =
  process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('file:')
    ? process.env.DATABASE_URL
    : path.join(process.cwd(), 'claimrail.db');

const DB_URL = `file:${DB_FILE.replace(/\\/g, '/')}`;

// Re-use connection across hot reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __claimrailLibsql: Client | undefined;
}

const client =
  globalThis.__claimrailLibsql ?? createClient({ url: DB_URL });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__claimrailLibsql = client;
}

export const db = drizzle(client, { schema });
export const libsql = client;
export * from './schema';
