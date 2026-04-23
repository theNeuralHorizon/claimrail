import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { claims, vendors } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { renderClaimPdf, claimPdfFilename } from '@/lib/claims/pdf';

interface Params {
  params: { claimId: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = await db
    .select({ c: claims, v: vendors })
    .from(claims)
    .innerJoin(vendors, eq(claims.vendorId, vendors.id))
    .where(and(eq(claims.id, params.claimId), eq(vendors.orgId, ctx.org.id)))
    .get();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buf = renderClaimPdf({
    subject: row.c.emailSubject,
    body: row.c.emailBody,
    period: row.c.period,
    vendorName: row.v.name,
  });
  const filename = claimPdfFilename(row.c.period, row.v.name);

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
