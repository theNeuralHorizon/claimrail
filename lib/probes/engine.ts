/**
 * Probe engine
 *
 * HTTP(S) probe with a 10 s timeout. We classify the result into up / degraded
 * / down based on status code + latency thresholds you'd see in real status
 * pages (Pingdom, UptimeRobot, StatusCake all use similar rules).
 *
 * We deliberately avoid external probe services — the whole point of
 * ClaimRail is to build your own independent evidence trail. Customer's
 * cron (Vercel / GitHub Actions) hits /api/cron/probes on their schedule.
 */

import { db, probes, vendors, incidents } from '@/lib/db/client';
import { eq, and, desc, gte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { consolidateIncidents } from '@/lib/sla/engine';
import { assertHostResolvesPublicly, validateProbeUrl } from './ssrf';

export interface ProbeResult {
  status: 'up' | 'degraded' | 'down';
  httpStatus: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
}

export async function probeUrl(
  url: string,
  options: { timeoutMs?: number; degradedLatencyMs?: number; skipSsrfGuard?: boolean } = {},
): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const degradedLatencyMs = options.degradedLatencyMs ?? 3_000;

  // SSRF guard — allow bypass for tests that mock fetch against example.com.
  if (!options.skipSsrfGuard) {
    const check = validateProbeUrl(url);
    if (!check.ok) {
      return {
        status: 'down',
        httpStatus: null,
        latencyMs: null,
        errorMessage: `URL rejected: ${check.reason}`,
      };
    }
    // Resolve DNS and reject if any resolved IP is in a private range.
    // Blocks DNS-rebinding attacks where foo.example.com points at 10.x.x.x.
    try {
      const hostname = new URL(url).hostname;
      await assertHostResolvesPublicly(hostname);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'DNS guard failed';
      return {
        status: 'down',
        httpStatus: null,
        latencyMs: null,
        errorMessage: `URL rejected: ${msg}`,
      };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'ClaimRail-Probe/1.0 (+https://claimrail.io/probe)',
        Accept: 'text/html,application/json,*/*;q=0.5',
      },
      cache: 'no-store',
    });
    const latencyMs = Math.round(performance.now() - started);
    clearTimeout(timer);

    if (res.status >= 500) {
      return {
        status: 'down',
        httpStatus: res.status,
        latencyMs,
        errorMessage: `HTTP ${res.status}`,
      };
    }
    if (res.status >= 400 && res.status !== 401 && res.status !== 403) {
      // 401/403 often just mean "auth required" for probed endpoints — still
      // proves the service is up enough to reject us. Other 4xx we treat
      // as a yellow signal.
      return {
        status: 'degraded',
        httpStatus: res.status,
        latencyMs,
        errorMessage: `HTTP ${res.status}`,
      };
    }
    if (latencyMs > degradedLatencyMs) {
      return {
        status: 'degraded',
        httpStatus: res.status,
        latencyMs,
        errorMessage: `slow response (${latencyMs}ms)`,
      };
    }
    return {
      status: 'up',
      httpStatus: res.status,
      latencyMs,
      errorMessage: null,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - started);
    const message =
      err instanceof Error ? err.message : String(err ?? 'unknown error');
    return {
      status: 'down',
      httpStatus: null,
      latencyMs,
      errorMessage: message.length > 200 ? message.slice(0, 200) : message,
    };
  }
}

export async function recordProbe(vendorId: string, result: ProbeResult): Promise<void> {
  await db
    .insert(probes)
    .values({
      id: nanoid(16),
      vendorId,
      checkedAt: Math.floor(Date.now() / 1000),
      status: result.status,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs,
      errorMessage: result.errorMessage,
    })
    .run();
}

export interface ProbeRunSummary {
  vendorId: string;
  vendorName: string;
  result: ProbeResult;
  newIncidents: number;
}

/**
 * Run a probe for every active vendor in the given org and persist results.
 * Also reconciles the rolling incident list so /dashboard reflects reality.
 */
export async function runProbesForOrg(orgId: string): Promise<ProbeRunSummary[]> {
  const activeVendors = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.orgId, orgId), eq(vendors.isActive, true)))
    .all();

  const summaries: ProbeRunSummary[] = [];
  for (const v of activeVendors) {
    const result = await probeUrl(v.monitorUrl);
    await recordProbe(v.id, result);
    const newIncidents = await reconcileIncidents(v.id);
    summaries.push({
      vendorId: v.id,
      vendorName: v.name,
      result,
      newIncidents,
    });
  }
  return summaries;
}

/**
 * Reconcile: look at the last 48 h of probes and emit incident rows for any
 * runs of 'down' probes that aren't already captured. Idempotent: multiple
 * calls produce the same incident set.
 */
export async function reconcileIncidents(vendorId: string): Promise<number> {
  const lookbackStart = Math.floor(Date.now() / 1000) - 60 * 60 * 48;
  const probeRows = await db
    .select()
    .from(probes)
    .where(and(eq(probes.vendorId, vendorId), gte(probes.checkedAt, lookbackStart)))
    .orderBy(desc(probes.checkedAt))
    .all();

  const consolidated = consolidateIncidents(
    probeRows.map((p) => ({ checkedAt: p.checkedAt, status: p.status })),
    { mergeGapSeconds: 15 * 60 },
  );

  const existing = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.vendorId, vendorId), gte(incidents.startedAt, lookbackStart)))
    .all();

  let newCount = 0;
  for (const inc of consolidated) {
    // De-dupe: if we already have an incident whose start is within 1 min of
    // this one, treat it as the same. Update its end/duration if needed.
    const match = existing.find(
      (e) => Math.abs(e.startedAt - inc.startedAt) < 60,
    );
    if (match) {
      if (
        (match.endedAt ?? 0) !== (inc.endedAt ?? 0) ||
        (match.durationSeconds ?? 0) !== inc.durationSeconds
      ) {
        await db
          .update(incidents)
          .set({
            endedAt: inc.endedAt,
            durationSeconds: inc.durationSeconds,
            severity: inc.severity,
            isResolved: inc.endedAt != null,
          })
          .where(eq(incidents.id, match.id))
          .run();
      }
      continue;
    }
    await db
      .insert(incidents)
      .values({
        id: nanoid(16),
        vendorId,
        startedAt: inc.startedAt,
        endedAt: inc.endedAt,
        durationSeconds: inc.durationSeconds,
        severity: inc.severity,
        source: 'auto',
        summary: `Auto-detected outage · ${inc.probeCount} failed probes`,
        isResolved: inc.endedAt != null,
      })
      .run();
    newCount += 1;
  }
  return newCount;
}
