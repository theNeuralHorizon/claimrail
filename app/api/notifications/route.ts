import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { securityEvents } from '@/lib/db/schema';
import { desc, eq, or } from 'drizzle-orm';

/**
 * Recent notifications feed for the header bell. Last 20 security events
 * scoped to the current user's org or to the user directly.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ items: [] });

  const rows = await db
    .select({
      id: securityEvents.id,
      kind: securityEvents.kind,
      severity: securityEvents.severity,
      createdAt: securityEvents.createdAt,
      ip: securityEvents.ip,
    })
    .from(securityEvents)
    .where(
      or(eq(securityEvents.orgId, ctx.org.id), eq(securityEvents.userId, ctx.user.id)),
    )
    .orderBy(desc(securityEvents.createdAt))
    .limit(20)
    ;

  return NextResponse.json({ items: rows });
}
