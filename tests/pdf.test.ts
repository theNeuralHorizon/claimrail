import { describe, it, expect } from 'vitest';
import { renderClaimPdf, claimPdfFilename } from '@/lib/claims/pdf';

describe('renderClaimPdf', () => {
  it('produces a valid PDF 1.4 document', () => {
    const buf = renderClaimPdf({
      subject: 'Service Credit Claim · Stripe · 2026-03 · $1,000',
      body: 'Hello Stripe,\n\nWe measured 99.5% uptime.\n\nThanks,\nAlex',
      period: '2026-03',
      vendorName: 'Stripe',
    });
    const head = buf.subarray(0, 8).toString('latin1');
    expect(head.startsWith('%PDF-1.4')).toBe(true);
    const tail = buf.subarray(buf.length - 10).toString('latin1');
    expect(tail).toContain('%%EOF');
  });

  it('wraps long lines without blowing up', () => {
    const body = ('a'.repeat(200) + '\n').repeat(50);
    const buf = renderClaimPdf({
      subject: 'subj',
      body,
      period: '2026-03',
      vendorName: 'V',
    });
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles non-ASCII by substituting spaces', () => {
    const buf = renderClaimPdf({
      subject: 'Sub — ✓',
      body: 'Café naïve résumé\n',
      period: '2026-03',
      vendorName: 'V',
    });
    expect(buf.subarray(0, 8).toString('latin1').startsWith('%PDF-1.4')).toBe(true);
  });

  it('produces a multi-page document for a long body', () => {
    const line = 'This is a line of text.\n';
    const buf = renderClaimPdf({
      subject: 'subj',
      body: line.repeat(200),
      period: '2026-03',
      vendorName: 'V',
    });
    // Must contain at least two page objects.
    const s = buf.toString('latin1');
    expect((s.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it('produces a safe filename', () => {
    expect(claimPdfFilename('2026-03', 'Stripe Inc.')).toBe(
      'claimrail-Stripe_Inc.-2026-03.pdf',
    );
    // Leading `/` removed, inner `/` replaced with `_`; no path traversal
    // is possible because we strip every char not in [a-zA-Z0-9._-].
    const traversal = claimPdfFilename('2026-03', '../../etc/passwd');
    expect(traversal).not.toContain('/');
    expect(traversal).not.toContain('\\');
    expect(traversal).toBe('claimrail-.._.._etc_passwd-2026-03.pdf');
  });
});
