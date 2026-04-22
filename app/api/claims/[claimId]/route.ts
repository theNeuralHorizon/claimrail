import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { claims, vendors, auditEvents } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const patchSchema = z.object({
  status: z.enum(['drafted', 'filed', 'acknowledged', 'recovered', 'rejected']).optional(),
  recoveredCents: z.number().int().min(0).nullable().optional(),
});

interface Params {
  params: { claimId: string };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { claimId } = params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const row = await db
    .select({ c: claims, v: vendors })
    .from(claims)
    .innerJoin(vendors, eq(claims.vendorId, vendors.id))
    .where(and(eq(claims.id, claimId), eq(vendors.orgId, ctx.org.id)))
    .get();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const now = Math.floor(Date.now() / 1000);
  if (parsed.data.status != null) {
    patch.status = parsed.data.status;
    if (parsed.data.status === 'filed' && !row.c.filedAt) patch.filedAt = now;
    if (['recovered', 'rejected'].includes(parsed.data.status) && !row.c.resolvedAt) {
      patch.resolvedAt = now;
    }
  }
  if (parsed.data.recoveredCents != null) {
    patch.recoveredCents = parsed.data.recoveredCents;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 });
  }
  await db.update(claims).set(patch).where(eq(claims.id, claimId)).run();

  await db
    .insert(auditEvents)
    .values({
      id: nanoid(16),
      orgId: ctx.org.id,
      actorId: ctx.user.id,
      action: 'claim.update',
      resource: 'claim',
      resourceId: claimId,
      metadataJson: JSON.stringify(patch),
    })
    .run();

  return NextResponse.json({ ok: true });
}
