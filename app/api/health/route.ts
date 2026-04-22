import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'claimrail',
    timestamp: new Date().toISOString(),
  });
}
