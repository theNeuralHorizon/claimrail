import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { vendors, claims } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Lightweight endpoint for the Cmd+K palette. Returns up to 20 vendors and
 * 20 most-recent claims the current user can reach, shaped as palette items.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ items: [] });

  const v = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.orgId, ctx.org.id))
    .limit(20)
    .all();

  const c = await db
    .select({ id: claims.id, period: claims.period, vendorName: vendors.name })
    .from(claims)
    .innerJoin(vendors, eq(claims.vendorId, vendors.id))
    .where(eq(vendors.orgId, ctx.org.id))
    .orderBy(desc(claims.createdAt))
    .limit(20)
    .all();

  return NextResponse.json({
    items: [
      ...v.map((row) => ({
        id: `v-${row.id}`,
        label: row.name,
        href: `/dashboard/vendors/${row.id}`,
        group: 'Vendors' as const,
      })),
      ...c.map((row) => ({
        id: `c-${row.id}`,
        label: `${row.vendorName} — ${row.period}`,
        href: `/dashboard/claims/${row.id}`,
        group: 'Claims' as const,
      })),
    ],
  });
}
