// ============================================================
// KESSIA — GET /api/metrics  (cahier des charges §47)
// Métriques au format texte type Prometheus, pour un scraper
// d'observabilité. Protégé par un jeton (METRICS_TOKEN). En son
// absence, l'endpoint est refusé (pas d'exposition publique).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

function line(name: string, help: string, type: string, value: number): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${value}\n`;
}

export async function GET(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-metrics-token');
  if (!token || provided !== token) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const since = new Date(Date.now() - DAY);
  const [
    users, usersVerified, tontinesActive, contributionsLate,
    ledgerAgg, fraudOpen, deliveriesFailed24h, guaranteePending,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { kycStatus: 'VERIFIED' } }),
    prisma.tontine.count({ where: { status: 'ACTIVE' } }),
    prisma.tontineContribution.count({ where: { status: 'LATE' } }),
    prisma.ledgerEntry.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    prisma.fraudAlert.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
    prisma.notificationDelivery.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
    prisma.guaranteeClaim.count({ where: { status: 'PENDING' } }),
  ]);

  const body =
    line('kessia_users_total', 'Nombre de comptes', 'gauge', users) +
    line('kessia_users_kyc_verified', 'Comptes avec KYC vérifié', 'gauge', usersVerified) +
    line('kessia_tontines_active', 'Tontines au statut ACTIVE', 'gauge', tontinesActive) +
    line('kessia_contributions_late', 'Cotisations de tontine en retard', 'gauge', contributionsLate) +
    line('kessia_ledger_tx_24h', 'Écritures ledger confirmées sur 24h', 'counter', ledgerAgg._count) +
    line('kessia_ledger_volume_24h', 'Volume ledger confirmé sur 24h (FCFA)', 'counter', Math.round(Number(ledgerAgg._sum.amount ?? 0))) +
    line('kessia_fraud_alerts_open', 'Alertes anti-fraude non traitées', 'gauge', fraudOpen) +
    line('kessia_notification_deliveries_failed_24h', 'Échecs de distribution de notification sur 24h', 'counter', deliveriesFailed24h) +
    line('kessia_guarantee_claims_pending', 'Demandes au Fonds de Garantie en attente', 'gauge', guaranteePending);

  return new NextResponse(body, {
    status: 200,
    headers: { 'content-type': 'text/plain; version=0.0.4' },
  });
}
