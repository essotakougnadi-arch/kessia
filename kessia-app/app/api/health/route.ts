// ============================================================
// KESSIA — GET /api/health (cahier des charges §47)
// Sonde de disponibilité (base incluse). Public.
// ============================================================

import prisma from '@/lib/db/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { correlateRequest } from '@/lib/observability/request-context';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // P1.13-C : route publique, hors withAuth — corrélation établie ici
  // explicitement (voir lib/observability/request-context.ts).
  correlateRequest(request);

  const started = Date.now();
  let db: 'ok' | 'down' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }

  const status = db === 'ok' ? 'ok' : 'degraded';
  return NextResponse.json(
    {
      status,
      db,
      version: process.env.npm_package_version ?? '0.1.0',
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    },
    { status: status === 'ok' ? 200 : 503 }
  );
}
