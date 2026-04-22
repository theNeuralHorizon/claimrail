import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeUrl } from '@/lib/probes/engine';

describe('probeUrl', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns up for 200 status with low latency', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const result = await probeUrl('https://example.com');
    expect(result.status).toBe('up');
    expect(result.httpStatus).toBe(200);
  });

  it('rejects internal URLs via SSRF guard', async () => {
    const result = await probeUrl('http://127.0.0.1:5432');
    expect(result.status).toBe('down');
    expect(result.errorMessage).toContain('URL rejected');
  });

  it('returns down for 5xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    const result = await probeUrl('https://example.com');
    expect(result.status).toBe('down');
    expect(result.httpStatus).toBe(503);
  });

  it('returns degraded for 4xx (excluding 401/403)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const result = await probeUrl('https://example.com');
    expect(result.status).toBe('degraded');
  });

  it('returns up for 401 (auth required still means the service is up)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const result = await probeUrl('https://example.com');
    expect(result.status).toBe('up');
  });

  it('returns down on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await probeUrl('https://example.com');
    expect(result.status).toBe('down');
    expect(result.errorMessage).toContain('ECONNREFUSED');
  });
});
