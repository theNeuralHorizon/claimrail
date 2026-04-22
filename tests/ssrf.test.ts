import { describe, it, expect } from 'vitest';
import { validateProbeUrl } from '@/lib/probes/ssrf';

describe('validateProbeUrl', () => {
  it.each([
    ['https://status.stripe.com', true],
    ['https://status.example.com/page', true],
    ['http://foo.bar.com/status', true],
  ])('allows public URL %s', (url, expected) => {
    expect(validateProbeUrl(url).ok).toBe(expected);
  });

  it.each([
    'http://localhost/x',
    'http://127.0.0.1',
    'http://127.0.0.1:8080',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://172.31.255.254',
    'http://0.0.0.0',
    'http://foo.local',
    'http://foo.internal',
  ])('blocks internal URL %s', (url) => {
    expect(validateProbeUrl(url).ok).toBe(false);
  });

  it('blocks non-http(s) schemes', () => {
    expect(validateProbeUrl('ftp://example.com').ok).toBe(false);
    expect(validateProbeUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateProbeUrl('javascript:alert(1)').ok).toBe(false);
  });

  it('blocks common internal-service ports', () => {
    expect(validateProbeUrl('http://example.com:6379').ok).toBe(false);
    expect(validateProbeUrl('http://example.com:5432').ok).toBe(false);
    expect(validateProbeUrl('http://example.com:22').ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateProbeUrl('not a url').ok).toBe(false);
    expect(validateProbeUrl('').ok).toBe(false);
  });

  it('allows IPv4 with 172.15/172.32 outside private range', () => {
    expect(validateProbeUrl('http://172.15.1.1').ok).toBe(true);
    expect(validateProbeUrl('http://172.32.1.1').ok).toBe(true);
  });
});
