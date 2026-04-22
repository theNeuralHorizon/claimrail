/**
 * Next.js edge middleware.
 *
 * Responsibilities:
 *   1. Attach a per-request nonce for the CSP (strict-dynamic pattern).
 *   2. Set the full security-header suite — CSP, HSTS, X-Frame-Options,
 *      X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
 *      X-DNS-Prefetch-Control, Cross-Origin-* isolation headers.
 *   3. Strip the fingerprinting `X-Powered-By` header Next emits by default.
 *
 * Runs on every route (see matcher at bottom).
 */

import { NextRequest, NextResponse } from 'next/server';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 without padding chars that CSP dislikes
  return btoa(String.fromCharCode(...bytes))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
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
    // doesn't enable XSS.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    isDev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ');
}

export function middleware(req: NextRequest): NextResponse {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== 'production';

  // Forward the nonce to the app via a request header so server components
  // (via `headers()`) can inject it into inline scripts if we ever need to.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set('Content-Security-Policy', buildCsp(nonce, isDev));

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
  // Don't leak the framework version.
  res.headers.delete('x-powered-by');
  res.headers.set('X-CSP-Nonce', nonce);

  return res;
}

export const config = {
  // Apply to everything except Next internals and static assets.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff|woff2)).*)',
  ],
};
