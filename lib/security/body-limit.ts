/**
 * Per-route JSON body size cap. Complements Next's default limits.
 *
 * Usage inside a route handler:
 *
 *   const body = await readJsonBody(req, { maxBytes: 16_000 });
 *   if (body.tooLarge) return NextResponse.json({ error: ... }, { status: 413 });
 */
import type { NextRequest } from 'next/server';

const DEFAULT_MAX = 64_000; // 64 KB

export interface ReadJsonResult<T = unknown> {
  tooLarge: boolean;
  invalid: boolean;
  data: T | null;
}

export async function readJsonBody<T = unknown>(
  req: NextRequest,
  options: { maxBytes?: number } = {},
): Promise<ReadJsonResult<T>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX;
  const contentLength = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { tooLarge: true, invalid: false, data: null };
  }
  // Content-length is advisory (can be missing or wrong). Read as bytes
  // and check again.
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > maxBytes) {
    return { tooLarge: true, invalid: false, data: null };
  }
  if (buf.length === 0) {
    return { tooLarge: false, invalid: false, data: null };
  }
  try {
    const text = buf.toString('utf8');
    return { tooLarge: false, invalid: false, data: JSON.parse(text) as T };
  } catch {
    return { tooLarge: false, invalid: true, data: null };
  }
}

export { DEFAULT_MAX as DEFAULT_JSON_BODY_MAX };
