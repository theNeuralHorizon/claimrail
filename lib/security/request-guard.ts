/**
 * Request guard for JSON mutation endpoints.
 *
 * We do NOT ship a CSRF token. Instead, we rely on two constraints that
 * together block the standard CSRF attack:
 *
 *   1. All state-changing routes require `Content-Type: application/json`.
 *      Browsers treat this as a non-simple CORS request, which forces a
 *      preflight — and our server never emits CORS headers, so the
 *      preflight fails and no request is made.
 *
 *   2. We double-check the `Origin` (or `Referer` as fallback) matches the
 *      application's configured origin. Fetch in a normal browser will send
 *      Origin for POST/PATCH/PUT/DELETE. If it's missing or mismatched we
 *      reject with 403.
 *
 * Server Actions have Next's built-in CSRF protection, so they're separately
 * safe. This guard runs only on our JSON API handlers.
 *
 * Allowed exceptions:
 *   • `/api/cron/probes` authenticates via `Authorization: Bearer` header and
 *     is whitelisted (callable cross-origin by schedulers).
 *   • `/api/health` is a read-only GET and doesn't go through this guard.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function expectedOrigins(): string[] {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  const fromRuntime =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  return [fromEnv, fromRuntime, ...defaults].filter(Boolean) as string[];
}

export interface GuardOptions {
  /** Skip the Content-Type check (e.g. GET handlers that accept empty body). */
  allowAnyContentType?: boolean;
}

/**
 * Validate a mutation request. Returns a 403/415 response if the check fails;
 * null if the request should continue.
 */
export function guardMutation(
  req: NextRequest,
  options: GuardOptions = {},
): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;

  // 1. Content-Type must be application/json.
  if (!options.allowAnyContentType) {
    const ct = (req.headers.get('content-type') ?? '').toLowerCase();
    if (!ct.startsWith('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415 },
      );
    }
  }

  // 2. Origin must match one of our expected origins.
  // If Origin is missing, fall back to Referer's origin.
  const origin =
    req.headers.get('origin') ??
    (() => {
      const ref = req.headers.get('referer');
      if (!ref) return null;
      try {
        const u = new URL(ref);
        return `${u.protocol}//${u.host}`;
      } catch {
        return null;
      }
    })();

  if (!origin) {
    return NextResponse.json(
      { error: 'Missing Origin header' },
      { status: 403 },
    );
  }

  const allowed = expectedOrigins();
  if (!allowed.some((a) => a === origin)) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
  }

  return null;
}
