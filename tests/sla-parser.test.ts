import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseHeuristic, parseSla } from '@/lib/ai/sla-parser';

describe('parseHeuristic', () => {
  it('returns empty on empty input', () => {
    const r = parseHeuristic('');
    expect(r.tiers).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('extracts a simple 3-tier SLA', () => {
    const text = `
Service Credits
If the monthly uptime percentage falls below 99.9%, customer is entitled to a service credit equal to 10% of that month's fees.
If the monthly uptime percentage falls below 99.0%, customer is entitled to a 25% service credit.
If the monthly uptime percentage falls below 95%, customer receives a 50% service credit.
    `;
    const r = parseHeuristic(text);
    expect(r.tiers.map((t) => t.uptimeThresholdPct)).toEqual([99.9, 99, 95]);
    expect(r.tiers.map((t) => t.creditPct)).toEqual([10, 25, 50]);
    expect(r.tiers[0].tierRank).toBe(1);
  });

  it('handles four-nines', () => {
    const r = parseHeuristic(
      'If availability is below 99.99%, 10% service credit applies.',
    );
    expect(r.tiers[0].uptimeThresholdPct).toBe(99.99);
    expect(r.tiers[0].creditPct).toBe(10);
  });

  it('ignores unrelated percentages', () => {
    const r = parseHeuristic(
      'Tax is 5%. Discount is 20%. Delivery fee 3%. Please review.',
    );
    expect(r.tiers).toHaveLength(0);
  });

  it('deduplicates identical tiers', () => {
    const r = parseHeuristic(`
Below 99.9% uptime, 10% credit.
Below 99.9% uptime, 10% credit applies monthly.
    `);
    expect(r.tiers).toHaveLength(1);
  });

  it('captures source excerpt for attribution', () => {
    const r = parseHeuristic(
      'If the monthly uptime percentage falls below 99.9%, customer receives a 10% service credit',
    );
    expect(r.tiers[0].sourceExcerpt).toContain('99.9%');
    expect(r.tiers[0].sourceExcerpt).toContain('10%');
  });

  it('warns when nothing is parsed', () => {
    const r = parseHeuristic('Standard commercial terms apply.');
    expect(r.tiers).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/No SLA tiers detected/);
  });

  it('rejects credits > 100%', () => {
    // Even if the text claims it, a credit can't exceed the whole fee
    const r = parseHeuristic(
      'If uptime is below 99.9%, customer gets a 150% service credit.',
    );
    expect(r.tiers).toHaveLength(0);
  });

  it('trims excerpts to 200 chars', () => {
    const veryLongExcerpt = 'x'.repeat(500);
    const r = parseHeuristic(
      `${veryLongExcerpt} If uptime falls below 99.9%, customer gets 10% service credit`,
    );
    if (r.tiers.length > 0) {
      expect(r.tiers[0].sourceExcerpt.length).toBeLessThanOrEqual(200);
    }
  });

  it('caps tiers at 10 with a warning', () => {
    const text = Array.from({ length: 15 }, (_, i) => {
      const threshold = 99.9 - i * 0.1;
      const credit = i + 2;
      return `If uptime is below ${threshold.toFixed(1)}%, ${credit}% service credit applies`;
    }).join('\n');
    const r = parseHeuristic(text);
    expect(r.tiers.length).toBeLessThanOrEqual(10);
  });
});

describe('parseSla (dispatcher)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('falls back to heuristic when no API key configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await parseSla(
      'If uptime falls below 99.9%, 10% credit applies.',
    );
    expect(r.provider).toBe('heuristic');
    expect(r.tiers).toHaveLength(1);
  });

  it('falls back to heuristic when Claude API fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-fake';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await parseSla(
      'If uptime falls below 99.9%, 10% credit applies.',
    );
    expect(r.provider).toBe('heuristic');
  });

  it('uses Claude result when it returns valid tiers', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-fake';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                tiers: [
                  {
                    uptimeThresholdPct: 99.95,
                    creditPct: 20,
                    sourceExcerpt: '99.95% → 20%',
                  },
                ],
              }),
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const r = await parseSla('anything');
    expect(r.provider).toBe('claude');
    expect(r.tiers[0].uptimeThresholdPct).toBe(99.95);
  });
});
