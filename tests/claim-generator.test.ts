import { describe, it, expect } from 'vitest';
import { generateClaim } from '@/lib/claims/generator';
import type { BreachResult, UptimeReport } from '@/lib/sla/engine';

const uptime: UptimeReport = {
  period: '2026-03',
  periodStart: Date.UTC(2026, 2, 1) / 1000,
  periodEnd: Date.UTC(2026, 3, 1) / 1000,
  totalSeconds: 31 * 86400,
  downtimeSeconds: 3600,
  uptimePct: 99.866,
  incidentCount: 1,
  incidents: [
    {
      id: 'a',
      startedAt: Date.UTC(2026, 2, 10, 12) / 1000,
      endedAt: Date.UTC(2026, 2, 10, 13) / 1000,
      durationSeconds: 3600,
      severity: 'major',
      summary: 'auto-detected outage',
    },
  ],
};

const breach: BreachResult = {
  hasBreach: true,
  applicableTier: { uptimeThresholdPct: 99.9, creditPct: 10, tierRank: 1 },
  uptimePct: 99.866,
  threshold: 99.9,
  creditPct: 10,
  estimatedCreditCents: 1_000_00,
};

describe('generateClaim', () => {
  it('produces subject with period and credit', () => {
    const c = generateClaim({
      vendor: { name: 'Stripe', monthlySpendCents: 10_000_00, contactEmail: 'support@stripe.com' },
      period: '2026-03',
      uptime,
      breach,
      customer: { orgName: 'Acme', userName: 'Alex', userEmail: 'alex@acme.com' },
    });
    expect(c.subject).toContain('Stripe');
    expect(c.subject).toContain('2026-03');
    expect(c.subject).toContain('$1,000.00');
  });

  it('embeds the threshold and measured uptime', () => {
    const c = generateClaim({
      vendor: { name: 'Stripe', monthlySpendCents: 10_000_00 },
      period: '2026-03',
      uptime,
      breach,
      customer: { orgName: 'Acme', userName: 'Alex', userEmail: 'alex@acme.com' },
    });
    expect(c.body).toContain('99.9%');
    expect(c.body).toContain('Acme');
    expect(c.body).toContain('Alex');
    expect(c.body).toContain('incident');
  });

  it('includes incident log with timestamps', () => {
    const c = generateClaim({
      vendor: { name: 'Stripe', monthlySpendCents: 10_000_00 },
      period: '2026-03',
      uptime,
      breach,
      customer: { orgName: 'Acme', userName: 'Alex', userEmail: 'alex@acme.com' },
    });
    expect(c.body).toMatch(/MAJOR/);
    expect(c.body).toMatch(/2026-03-10/);
  });

  it('quotes SLA clause when supplied', () => {
    const c = generateClaim({
      vendor: { name: 'Stripe', monthlySpendCents: 10_000_00 },
      period: '2026-03',
      uptime,
      breach,
      customer: { orgName: 'Acme', userName: 'Alex', userEmail: 'alex@acme.com' },
      sourceExcerpt: 'If uptime falls below 99.9%, 10% credit.',
    });
    expect(c.body).toContain('SLA CLAUSE REFERENCED');
    expect(c.body).toContain('99.9%');
  });

  it('evidence block captures incident metadata', () => {
    const c = generateClaim({
      vendor: { name: 'Stripe', monthlySpendCents: 10_000_00 },
      period: '2026-03',
      uptime,
      breach,
      customer: { orgName: 'Acme', userName: 'Alex', userEmail: 'alex@acme.com' },
    });
    expect(c.evidence.period).toBe('2026-03');
    expect(c.evidence.incidents).toHaveLength(1);
    expect(c.evidence.tier.threshold).toBe(99.9);
  });
});
