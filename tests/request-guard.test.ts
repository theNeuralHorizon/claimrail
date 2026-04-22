import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { guardMutation } from '@/lib/security/request-guard';

function fakeReq(
  method: string,
  headers: Record<string, string> = {},
): { method: string; headers: Headers } {
  return { method, headers: new Headers(headers) };
}

describe('guardMutation', () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });
  afterEach(() => {
    if (originalEnv == null) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  });

  it('allows GET with no headers', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = guardMutation(fakeReq('GET') as any);
    expect(res).toBeNull();
  });

  it('rejects POST without JSON content-type', () => {
    const res = guardMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeReq('POST', { 'content-type': 'text/plain', origin: 'http://localhost:3000' }) as any,
    );
    expect(res?.status).toBe(415);
  });

  it('rejects POST without Origin header', () => {
    const res = guardMutation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeReq('POST', { 'content-type': 'application/json' }) as any,
    );
    expect(res?.status).toBe(403);
  });

  it('rejects POST with wrong Origin', () => {
    const res = guardMutation(
      fakeReq('POST', {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    expect(res?.status).toBe(403);
  });

  it('allows POST with valid Origin + JSON content-type', () => {
    const res = guardMutation(
      fakeReq('POST', {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    expect(res).toBeNull();
  });

  it('falls back to Referer when Origin is missing', () => {
    const res = guardMutation(
      fakeReq('POST', {
        'content-type': 'application/json',
        referer: 'http://localhost:3000/dashboard',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    expect(res).toBeNull();
  });

  it('allows POST with allowAnyContentType + valid Origin', () => {
    const res = guardMutation(
      fakeReq('POST', { origin: 'http://localhost:3000' }) as unknown as Parameters<typeof guardMutation>[0],
      { allowAnyContentType: true },
    );
    expect(res).toBeNull();
  });
});
