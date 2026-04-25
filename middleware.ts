/**
 * Next.js edge middleware.
 *
 * Responsibilities:
 *   1. Generate a per-request CSP nonce and thread it into Next.js so the
 *      framework attaches it to every inline script it streams (RSC payload
 *      pushes, hydration data, `<Script>` tags). This is the convention
 *      Next.js documents — set the `x-nonce` request header AND set the
 *      `Content-Security-Policy` request header. Both are required: Next.js
 *      uses the request CSP to detect that nonce mode is active.
 *   2. Set the full security-header suite on the response — CSP, HSTS,
 *      X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 *      Permissions-Policy, X-DNS-Prefetch-Control, COOP / CORP.
 *   3. Strip the fingerprinting `X-Powered-By` header Next emits by default.
 *
 * Runs on every page-render route (see matcher at bottom). Prefetch
 * requests are deliberately skipped so the CSP doesn't churn nonces in
 * router-prefetch traffic, which would invalidate the cached page HTML.
 */

import { NextRequest, NextResponse } from 'next/server';
import { disabledKeys } from '@/lib/security/kill-switch';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 without padding chars that CSP dislikes
  return btoa(String.fromCharCode(...bytes))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function shouldForceHttps(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  const proto = req.headers.get('x-forwarded-proto') ?? '';
  return proto === 'http';
}

function buildCsp(nonce: string, isDev: boolean): string {
  // CSP3 nonce + 'self'. We don't enable 'strict-dynamic' because it
  // overrides 'self' and would break externally-loaded same-origin scripts
  // (e.g. /theme-boot.js). 'self' + nonce already blocks every cross-origin
  // and every unsigned inline script.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // Dev only: Next.js inlines eval for Fast Refresh.
    isDev ? "'unsafe-eval'" : '',
  ]
    .filter(Boolean)
    .join(' ');

  const connectSrc = ["'self'", isDev ? 'ws:' : '', isDev ? 'http://localhost:*' : '']
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind/React emit inline styles at runtime; `unsafe-inline` is the
    // practical option here. With the nonce-pinned script-src above, this
    // doesn't enable XSS — an attacker can inject CSS but not JS.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "report-uri /api/security/csp-report",
    "report-to csp-endpoint",
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');
}

export function middleware(req: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = buildCsp(nonce, isDev);

  // Force-redirect HTTP → HTTPS when behind a TLS-terminating proxy in
  // production. Handled before CSP so upgraded connections get the final
  // headers.
  if (shouldForceHttps(req)) {
    const url = req.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  // Forward the nonce + CSP to Next.js via *request* headers. Next.js reads
  // these during SSR/streaming and automatically attaches `nonce="…"` to
  // every inline script it emits (the RSC `__next_f.push` chunks and the
  // hydration data scripts). Without this the browser blocks them and the
  // page falls back to the static server HTML — which causes React error
  // #418/#419/#423 hydration mismatches.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set('Content-Security-Policy', csp);

  // Force HTTPS in transit for one year, include subdomains, eligible for
  // browser preload lists. Only sent on HTTPS deployments.
  if (!isDev) {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=(self)',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  );
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  // Deny cross-origin access at the server layer too. The middleware
  // blocks OPTIONS preflights by not emitting any Access-Control-* headers,
  // so cross-origin fetches fail the preflight.
  res.headers.delete('access-control-allow-origin');

  // Incident-response visibility: if any subsystem is killed via env, tell
  // the dashboard UI so it can render a banner without an extra request.
  const killed = disabledKeys();
  if (killed.length > 0) {
    res.headers.set('X-ClaimRail-Disabled', killed.join(','));
  }
  // Report-To endpoint configuration for modern browsers that honour
  // `report-to` instead of the legacy `report-uri` directive.
  res.headers.set(
    'Report-To',
    JSON.stringify({
      group: 'csp-endpoint',
      max_age: 10886400,
      endpoints: [{ url: '/api/security/csp-report' }],
    }),
  );
  // Don't leak the framework version.
  res.headers.delete('x-powered-by');
  // Expose the nonce so any client wanting to read it (e.g. for ad-hoc
  // <script> tags) can. Inline scripts already get it automatically via
  // the request-header trick above.
  res.headers.set('X-Nonce', nonce);

  return res;
}

export const config = {
  // Apply to everything except Next internals and static assets, AND skip
  // prefetch requests so the cached HTML doesn't get a different nonce
  // every time the router prefetches a link. (Prefetch fetches don't run
  // scripts, so they don't need a nonce.)
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff|woff2)).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
