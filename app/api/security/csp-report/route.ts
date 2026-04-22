import { NextRequest, NextResponse } from 'next/server';

/**
 * Receive CSP violation reports. Browsers POST a JSON body to this endpoint
 * whenever our Content-Security-Policy blocks something. We log them and
 * ack 204.
 *
 * Tip for production: ship these to your observability backend (Sentry,
 * Datadog) instead of just console. A spike in violations usually means
 * either (a) a legit integration change needs CSP tweaking, or (b) a
 * real XSS attempt that CSP just stopped.
 */
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = await req.text().catch(() => null);
  }
  // eslint-disable-next-line no-console
  console.warn('[CSP violation]', JSON.stringify(body));
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
