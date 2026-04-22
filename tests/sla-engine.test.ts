import { describe, it, expect } from 'vitest';
import {
  computeUptimeReport,
  consolidateIncidents,
  currentPeriod,
  detectBreach,
  formatCents,
  formatDuration,
  formatUptime,
  incidentSecondsInPeriod,
  periodToRange,
  previousPeriod,
} from '@/lib/sla/engine';

describe('periodToRange', () => {
  it('returns UTC month boundary for valid input', () => {
    const { start, end } = periodToRange('2026-04');
    expect(start).toBe(Date.UTC(2026, 3, 1) / 1000);
    expect(end).toBe(Date.UTC(2026, 4, 1) / 1000);
  });
  it('rejects bad formats', () => {
    expect(() => periodToRange('2026-13')).toThrow();
    expect(() => periodToRange('2026-1')).toThrow();
    expect(() => periodToRange('202604')).toThrow();
  });
});

describe('currentPeriod / previousPeriod', () => {
  it('formats YYYY-MM', () => {
    expect(currentPeriod(new Date('2026-04-22T00:00:00Z'))).toBe('2026-04');
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(previousPeriod('2026-04')).toBe('2026-03');
  });
});

describe('incidentSecondsInPeriod', () => {
  const periodStart = Date.UTC(2026, 3, 1) / 1000;
  const periodEnd = Date.UTC(2026, 4, 1) / 1000;

  it('returns full duration for incidents fully inside', () => {
    const inc = {
      startedAt: periodStart + 1000,
      endedAt: periodStart + 1600,
      durationSeconds: 600,
    };
    expect(incidentSecondsInPeriod(inc, periodStart, periodEnd)).toBe(600);
  });

  it('clamps straddle incidents to the period', () => {
    // Started in previous month, ended inside April
    const inc = {
      startedAt: periodStart - 3600,
      endedAt: periodStart + 1800,
      durationSeconds: 5400,
    };
    expect(incidentSecondsInPeriod(inc, periodStart, periodEnd)).toBe(1800);
  });

  it('treats ongoing incidents (null endedAt) using now', () => {
    const now = periodStart + 600;
    const inc = { startedAt: periodStart + 100, endedAt: null, durationSeconds: null };
    expect(incidentSecondsInPeriod(inc, periodStart, periodEnd, now)).toBe(500);
  });

  it('returns 0 for incidents outside the period', () => {
    const inc = {
      startedAt: periodEnd + 100,
      endedAt: periodEnd + 200,
      durationSeconds: 100,
    };
    expect(incidentSecondsInPeriod(inc, periodStart, periodEnd)).toBe(0);
  });
});

describe('computeUptimeReport', () => {
  it('returns 100% uptime for no incidents', () => {
    const r = computeUptimeReport('2026-04', [], Date.UTC(2026, 3, 15) / 1000);
    expect(r.uptimePct).toBe(100);
    expect(r.downtimeSeconds).toBe(0);
    expect(r.incidentCount).toBe(0);
  });

  it('caps totalSeconds at current time for the current month', () => {
    const midMonth = Date.UTC(2026, 3, 15) / 1000;
    const r = computeUptimeReport('2026-04', [], midMonth);
    // 14 days into the month -> 14 * 86400 seconds
    expect(r.totalSeconds).toBe(14 * 86400);
  });

  it('deducts incident downtime', () => {
    const now = Date.UTC(2026, 3, 30) / 1000;
    const r = computeUptimeReport(
      '2026-04',
      [
        {
          id: 'a',
          startedAt: Date.UTC(2026, 3, 10, 12) / 1000,
          endedAt: Date.UTC(2026, 3, 10, 13) / 1000,
          durationSeconds: 3600,
          severity: 'major',
          summary: '',
        },
      ],
      now,
    );
    expect(r.downtimeSeconds).toBe(3600);
    expect(r.incidentCount).toBe(1);
  });

  it('never reports >100% uptime even with bad data', () => {
    const now = Date.UTC(2026, 3, 30) / 1000;
    const r = computeUptimeReport(
      '2026-04',
      [
        {
          id: 'a',
          startedAt: Date.UTC(2026, 3, 1) / 1000,
          endedAt: Date.UTC(2026, 3, 30) / 1000,
          durationSeconds: 30 * 86400,
          severity: 'critical',
          summary: '',
        },
      ],
      now,
    );
    expect(r.uptimePct).toBeGreaterThanOrEqual(0);
    expect(r.uptimePct).toBeLessThanOrEqual(100);
  });
});

describe('detectBreach', () => {
  const tiers = [
    { uptimeThresholdPct: 99.9, creditPct: 10, tierRank: 1 },
    { uptimeThresholdPct: 99.0, creditPct: 25, tierRank: 2 },
    { uptimeThresholdPct: 95.0, creditPct: 50, tierRank: 3 },
  ];

  it('returns no breach above top threshold', () => {
    const r = detectBreach(99.95, tiers, 100_00);
    expect(r.hasBreach).toBe(false);
    expect(r.estimatedCreditCents).toBe(0);
  });

  it('picks the most generous applicable tier', () => {
    const r = detectBreach(98.5, tiers, 100_00);
    expect(r.hasBreach).toBe(true);
    expect(r.creditPct).toBe(25);
    expect(r.estimatedCreditCents).toBe(25_00);
  });

  it('scales credit to monthly spend', () => {
    const r = detectBreach(94.0, tiers, 1000_00);
    expect(r.creditPct).toBe(50);
    expect(r.estimatedCreditCents).toBe(500_00);
  });

  it('handles empty tier list', () => {
    const r = detectBreach(50, [], 1000_00);
    expect(r.hasBreach).toBe(false);
    expect(r.estimatedCreditCents).toBe(0);
  });
});

describe('consolidateIncidents', () => {
  it('returns empty for no probes', () => {
    expect(consolidateIncidents([])).toEqual([]);
  });

  it('groups contiguous down probes into one incident', () => {
    const base = 1_700_000_000;
    const incidents = consolidateIncidents([
      { checkedAt: base, status: 'down' },
      { checkedAt: base + 60, status: 'down' },
      { checkedAt: base + 120, status: 'down' },
      { checkedAt: base + 180, status: 'up' },
    ]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].durationSeconds).toBe(120);
  });

  it('splits incidents separated by gap > mergeGap', () => {
    const base = 1_700_000_000;
    const incidents = consolidateIncidents(
      [
        { checkedAt: base, status: 'down' },
        { checkedAt: base + 60, status: 'down' },
        { checkedAt: base + 3600, status: 'down' }, // 1h later
        { checkedAt: base + 3660, status: 'down' },
      ],
      { mergeGapSeconds: 300 },
    );
    expect(incidents).toHaveLength(2);
  });

  it('marks critical severity for hour-plus outages', () => {
    const base = 1_700_000_000;
    const incidents = consolidateIncidents(
      [
        { checkedAt: base, status: 'down' },
        { checkedAt: base + 3700, status: 'down' },
      ],
      { mergeGapSeconds: 7200 },
    );
    expect(incidents[0].severity).toBe('critical');
  });
});

describe('formatters', () => {
  it('formatUptime precision ladder', () => {
    expect(formatUptime(100)).toBe('100.000%');
    expect(formatUptime(99.999)).toBe('99.999%');
    expect(formatUptime(99.5)).toBe('99.50%');
    expect(formatUptime(98)).toBe('98.0%');
  });
  it('formatDuration', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(2 * 86400)).toBe('2d');
  });
  it('formatCents', () => {
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
});
