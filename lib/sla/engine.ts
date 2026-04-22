/**
 * SLA Engine
 *
 * Core calculations for ClaimRail. We avoid storing derived data on the
 * incident record because SLA terms can be edited retroactively — everything
 * is computed fresh from the probe stream + incident log + term tiers.
 *
 * References studied while designing this:
 *   • AWS, GCP, Azure, Stripe, Cloudflare, Twilio public SLAs (format study)
 *   • RFC-style monthly uptime calculation
 *   • SLA credit stacking patterns (take max tier, not sum)
 *
 * Key decision: we measure on a **monthly** basis because every real-world
 * B2B SaaS SLA is monthly. The period is "YYYY-MM" in UTC.
 */

export interface Incident {
  id: string;
  startedAt: number; // unix seconds
  endedAt: number | null;
  durationSeconds: number | null;
  severity: 'minor' | 'major' | 'critical';
  summary: string;
}

export interface SlaTier {
  uptimeThresholdPct: number; // e.g. 99.9
  creditPct: number; // e.g. 10 means 10% of monthly spend
  tierRank: number;
}

export interface UptimeReport {
  period: string; // "YYYY-MM"
  periodStart: number;
  periodEnd: number;
  totalSeconds: number;
  downtimeSeconds: number;
  uptimePct: number;
  incidentCount: number;
  incidents: Incident[];
}

export interface BreachResult {
  hasBreach: boolean;
  applicableTier: SlaTier | null;
  uptimePct: number;
  threshold: number | null;
  creditPct: number;
  estimatedCreditCents: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Period math — all in UTC so multi-region teams agree on boundaries.
// ─────────────────────────────────────────────────────────────────────────

export function periodToRange(period: string): { start: number; end: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) {
    throw new Error(`Invalid period format: ${period}. Expected YYYY-MM`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in period: ${period}`);
  }
  const start = Date.UTC(year, month - 1, 1) / 1000;
  const end = Date.UTC(year, month, 1) / 1000;
  return { start, end };
}

export function currentPeriod(at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function previousPeriod(period: string): string {
  const { start } = periodToRange(period);
  const d = new Date(start * 1000);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return currentPeriod(d);
}

// ─────────────────────────────────────────────────────────────────────────
// Uptime calculation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Clamp an incident window to a given period and return how many seconds
 * of the incident fall inside the window. Incidents that span periods are
 * split (the "straddle problem"): each month owns its own portion.
 */
export function incidentSecondsInPeriod(
  incident: Pick<Incident, 'startedAt' | 'endedAt' | 'durationSeconds'>,
  periodStart: number,
  periodEnd: number,
  now: number = Math.floor(Date.now() / 1000),
): number {
  const effectiveEnd =
    incident.endedAt ??
    (incident.durationSeconds != null
      ? incident.startedAt + incident.durationSeconds
      : now);
  if (effectiveEnd <= incident.startedAt) return 0;
  const overlapStart = Math.max(incident.startedAt, periodStart);
  const overlapEnd = Math.min(effectiveEnd, periodEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

export function computeUptimeReport(
  period: string,
  incidents: Incident[],
  now: number = Math.floor(Date.now() / 1000),
): UptimeReport {
  const { start, end } = periodToRange(period);
  // For the *current* month, only count seconds up to "now" — you can't have
  // downtime in the future. This mirrors how every public SLA dashboard works.
  const effectiveEnd = Math.min(end, Math.max(now, start));
  const totalSeconds = effectiveEnd - start;

  let downtimeSeconds = 0;
  const inside: Incident[] = [];
  for (const inc of incidents) {
    const seconds = incidentSecondsInPeriod(inc, start, effectiveEnd, now);
    if (seconds > 0) {
      downtimeSeconds += seconds;
      inside.push(inc);
    }
  }

  if (downtimeSeconds > totalSeconds) downtimeSeconds = totalSeconds;

  const uptimePct =
    totalSeconds <= 0
      ? 100
      : ((totalSeconds - downtimeSeconds) / totalSeconds) * 100;

  return {
    period,
    periodStart: start,
    periodEnd: effectiveEnd,
    totalSeconds,
    downtimeSeconds,
    uptimePct,
    incidentCount: inside.length,
    incidents: inside,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Breach detection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Given measured uptime and an SLA tier list, find the most generous tier
 * that applies. Real SLAs award the **highest** credit tier hit, not the sum.
 */
export function detectBreach(
  uptimePct: number,
  tiers: SlaTier[],
  monthlySpendCents: number,
): BreachResult {
  // Sort so the most generous (highest credit %) applicable tier wins,
  // and tiers with a higher threshold are evaluated first if tied on credit.
  const sorted = [...tiers].sort((a, b) => {
    if (b.creditPct !== a.creditPct) return b.creditPct - a.creditPct;
    return b.uptimeThresholdPct - a.uptimeThresholdPct;
  });
  let applicable: SlaTier | null = null;
  for (const tier of sorted) {
    if (uptimePct < tier.uptimeThresholdPct) {
      applicable = tier;
      break;
    }
  }
  if (!applicable) {
    return {
      hasBreach: false,
      applicableTier: null,
      uptimePct,
      threshold: tiers.length
        ? Math.max(...tiers.map((t) => t.uptimeThresholdPct))
        : null,
      creditPct: 0,
      estimatedCreditCents: 0,
    };
  }
  return {
    hasBreach: true,
    applicableTier: applicable,
    uptimePct,
    threshold: applicable.uptimeThresholdPct,
    creditPct: applicable.creditPct,
    estimatedCreditCents: Math.round(
      (monthlySpendCents * applicable.creditPct) / 100,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Consolidator — group probe stream into incident windows.
// Adjacent "down" probes within `mergeGapSeconds` fold into one incident.
// ─────────────────────────────────────────────────────────────────────────

export interface ProbeRow {
  checkedAt: number;
  status: 'up' | 'degraded' | 'down';
}

export interface ConsolidatedIncident {
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  severity: 'minor' | 'major' | 'critical';
  probeCount: number;
}

export function consolidateIncidents(
  probes: ProbeRow[],
  options: { mergeGapSeconds?: number; downStatuses?: Array<'down' | 'degraded'> } = {},
): ConsolidatedIncident[] {
  const mergeGap = options.mergeGapSeconds ?? 300; // 5 min
  const downStatuses = new Set(options.downStatuses ?? ['down']);
  if (probes.length === 0) return [];

  const sorted = [...probes].sort((a, b) => a.checkedAt - b.checkedAt);
  const incidents: ConsolidatedIncident[] = [];
  let current: ConsolidatedIncident | null = null;

  for (const p of sorted) {
    if (downStatuses.has(p.status as 'down' | 'degraded')) {
      if (current == null) {
        current = {
          startedAt: p.checkedAt,
          endedAt: null,
          durationSeconds: 0,
          severity: 'minor',
          probeCount: 1,
        };
      } else if (p.checkedAt - (current.endedAt ?? current.startedAt) > mergeGap) {
        incidents.push(finalizeIncident(current));
        current = {
          startedAt: p.checkedAt,
          endedAt: null,
          durationSeconds: 0,
          severity: 'minor',
          probeCount: 1,
        };
      } else {
        current.endedAt = p.checkedAt;
        current.probeCount += 1;
      }
    } else if (current) {
      // Incident ended at the last DOWN probe, not at the first UP probe
      // after it. If we haven't seen a second down probe yet, endedAt will
      // still equal startedAt (0-duration).
      incidents.push(finalizeIncident(current));
      current = null;
    }
  }
  if (current) incidents.push(finalizeIncident(current));
  return incidents;
}

function finalizeIncident(c: ConsolidatedIncident): ConsolidatedIncident {
  const endedAt = c.endedAt ?? c.startedAt;
  const duration = Math.max(0, endedAt - c.startedAt);
  let severity: ConsolidatedIncident['severity'] = 'minor';
  if (duration >= 60 * 60) severity = 'critical';
  else if (duration >= 15 * 60) severity = 'major';
  return { ...c, endedAt, durationSeconds: duration, severity };
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────

export function formatUptime(pct: number): string {
  if (pct >= 99.99) return pct.toFixed(3) + '%';
  if (pct >= 99) return pct.toFixed(2) + '%';
  return pct.toFixed(1) + '%';
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round((seconds / 3600) * 10) / 10}h`;
  return `${Math.round((seconds / 86400) * 10) / 10}d`;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}
