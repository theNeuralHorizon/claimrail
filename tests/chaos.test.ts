/**
 * Chaos tests — feed the system adversarial inputs and confirm defenses fire.
 */
import { describe, it, expect } from 'vitest';
import { parseHeuristic } from '@/lib/ai/sla-parser';
import { validateProbeUrl } from '@/lib/probes/ssrf';
import { moneyCents, percentage, uptimeThresholdPct } from '@/lib/security/strict-types';
import { sanitizeLine, sanitizeBlock } from '@/lib/security/sanitize';

describe('chaos: SLA parser never blows up', () => {
  it('handles an 800KB blob without hanging (ReDoS cap)', () => {
    const huge = 'If uptime < 99.9%, 10% credit. '.repeat(30_000);
    const start = Date.now();
    const r = parseHeuristic(huge);
    const elapsed = Date.now() - start;
    // Should return quickly thanks to the 80KB cap.
    expect(elapsed).toBeLessThan(2000);
    expect(r.tiers.length).toBeGreaterThan(0);
  });

  it('survives unicode + control-char hostile input', () => {
    const nasty = '\u0000\u0001\u0007 If uptime is below 99.9%, 10% credit. \u200b\u200c';
    const r = parseHeuristic(nasty);
    expect(r.tiers[0]?.uptimeThresholdPct).toBe(99.9);
  });

  it('ignores percentages that look numeric but are out of range', () => {
    const r = parseHeuristic(
      'If uptime is below 200%, you get 1000% credit — obviously nonsense.',
    );
    expect(r.tiers).toHaveLength(0);
  });
});

describe('chaos: probe URL validator', () => {
  // A curated zoo of hostile URLs. Every one should be rejected.
  const hostile = [
    'http://127.0.0.1:6379', // Redis
    'http://localhost', // loopback literal
    'http://[::1]/', // IPv6 loopback
    'http://169.254.169.254/latest/meta-data', // AWS metadata
    'http://metadata.google.internal/', // GCP metadata (via .internal)
    'http://10.0.0.5', // RFC1918
    'http://192.168.0.1',
    'http://172.16.0.1',
    'ftp://example.com',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'gopher://example.com',
    'http://example.com:22', // ssh
    'http://example.com:6379', // redis
    'http://example.com:27017', // mongo
  ];
  it.each(hostile)('rejects %s', (url) => {
    expect(validateProbeUrl(url).ok).toBe(false);
  });
});

describe('chaos: numeric guards', () => {
  it('moneyCents rejects NaN, Infinity, floats, negatives', () => {
    expect(moneyCents.safeParse(Number.NaN).success).toBe(false);
    expect(moneyCents.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(moneyCents.safeParse(-1).success).toBe(false);
    expect(moneyCents.safeParse(1.5).success).toBe(false);
    expect(moneyCents.safeParse(10 ** 15).success).toBe(false);
    expect(moneyCents.safeParse(100_00).success).toBe(true);
  });
  it('percentage rejects out-of-range', () => {
    expect(percentage.safeParse(-0.0001).success).toBe(false);
    expect(percentage.safeParse(100.0001).success).toBe(false);
    expect(percentage.safeParse(50).success).toBe(true);
  });
  it('uptimeThresholdPct rejects unrealistic values', () => {
    expect(uptimeThresholdPct.safeParse(10).success).toBe(false);
    expect(uptimeThresholdPct.safeParse(99.9).success).toBe(true);
  });
});

describe('chaos: sanitizers stop log injection', () => {
  it('removes CRLF from one-line fields', () => {
    const s = sanitizeLine('Alice\r\n[sec critical] fake event ip=evil');
    expect(s).not.toContain('\n');
    expect(s).not.toContain('\r');
  });

  it('caps field length even with unicode', () => {
    // 1 char = 1 code unit for BMP codepoints; safe for our length cap.
    expect(sanitizeLine('A'.repeat(5000), 100).length).toBe(100);
  });

  it('block sanitizer tolerates very large inputs', () => {
    const huge = 'a\n'.repeat(50_000); // 100KB
    const out = sanitizeBlock(huge, 50_000);
    expect(out.length).toBe(50_000);
  });
});
