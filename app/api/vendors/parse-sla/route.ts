import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { parseSla } from '@/lib/ai/sla-parser';
import { rateLimit } from '@/lib/rate-limit';
import { guardMutation } from '@/lib/security/request-guard';
import { z } from 'zod';

const schema = z.object({
  text: z.string().min(1).max(50_000),
});

export async function POST(req: NextRequest) {
  const blocked = guardMutation(req);
  if (blocked) return blocked;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // The parser can optionally call Anthropic, so we rate-limit.
  const rl = rateLimit(`parse-sla:${ctx.user.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))) } },
    );
  }
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const result = await parseSla(parsed.data.text);
  return NextResponse.json(result);
}
