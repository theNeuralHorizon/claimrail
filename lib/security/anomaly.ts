/**
 * Simple anomaly detectors. Zero external deps — no GeoIP, no maxmind —
 * because this is meant to run anywhere and be easy to audit.
 *
 * Two signals:
 *   1. New-device login (new UA+IP fingerprint vs. historic successful
 *      logins for this user).
 *   2. Impossible travel (two successful logins from IP prefixes that
 *      differ AND within a time window so short that a user couldn't
 *      physically relocate). We approximate "distance" by IP prefix —
 *      same /16 means same region, different /16 means at minimum a
 *      couple hundred km.
 *
 * Neither is precise. Both are meant to produce a high-signal notice in
 * the security-event stream that a human should review. False positives
 * are acceptable because the consequence is "user sees an alert on
 * their dashboard", not "user gets locked out".
 */

import { db } from '@/lib/db/client';
import { securityEvents } from '@/lib/db/schema';
import { and, desc, eq, gte } from 'drizzle-orm';
import { createHash } from 'node:crypto';

function hashFingerprint(ua: string, ip: string): string {
  return createHash('sha256').update(`${ua}|${ip}`).digest('hex').slice(0, 24);
}

export interface AnomalyResult {
  newDevice: boolean;
  impossibleTravel: boolean;
}

/**
 * Evaluate the current login against the recent history for this user.
 * Reads from security_events where kind = 'login.success' in the last
 * 30 days.
 */
export async function evaluateLoginAnomalies(params: {
  userId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<AnomalyResult> {
  const { userId } = params;
  const ip = params.ip ?? '';
  const ua = params.userAgent ?? '';
  const now = Math.floor(Date.now() / 1000);
  const lookback = now - 30 * 24 * 3600;

  const prior = await db
    .select()
    .from(securityEvents)
    .where(
      and(
        eq(securityEvents.userId, userId),
        eq(securityEvents.kind, 'login.success'),
        gte(securityEvents.createdAt, lookback),
      ),
    )
    .orderBy(desc(securityEvents.createdAt))
    .limit(100)
    .all();

  // New-device: no prior login event matches this fingerprint.
  const fp = hashFingerprint(ua, ip);
  const knownFps = new Set(
    prior.map((e) => hashFingerprint(e.userAgent ?? '', e.ip ?? '')),
  );
  const newDevice = prior.length > 0 && !knownFps.has(fp);

  // Impossible-travel: compare against the most recent login. If the
  // /16 IP prefix changed AND that login was < 10 minutes ago, flag.
  let impossibleTravel = false;
  if (prior.length > 0) {
    const last = prior[0];
    const prefix = (addr: string) => addr.split('.').slice(0, 2).join('.');
    const minutesSinceLast = (now - last.createdAt) / 60;
    if (
      minutesSinceLast < 10 &&
      last.ip &&
      ip &&
      prefix(last.ip) !== prefix(ip)
    ) {
      impossibleTravel = true;
    }
  }

  return { newDevice, impossibleTravel };
}
