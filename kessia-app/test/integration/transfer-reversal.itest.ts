import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as transfer } from '@/app/api/v1/wallet/transfer/route';
import { signAccessToken } from '@/lib/auth/session';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { prisma, makeUser, cleanup, settle } from './helpers';

const userIds: string[] = [];
afterEach(async () => {
  await settle();
  await cleanup({ userIds: userIds.splice(0) });
});

function req(token: string, body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/v1/wallet/transfer', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/wallet/transfer — reversal (intégration)', () => {
  it('si le crédit du destinataire échoue (wallet verrouillé), le débit est annulé (REVERSAL) et le solde rétabli', async () => {
    const sender = await makeUser({ balance: 50_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    const recipient = await makeUser({ balance: 0, locked: true }); // crédit impossible
    userIds.push(sender.id, recipient.id);

    const token = signAccessToken({ sub: sender.id, phone: sender.phone, role: 'USER' });
    const res = await transfer(req(token, { recipientPhone: recipient.phone, amount: 12_000 }));

    // Le crédit a échoué → 500 "solde rétabli", pas de perte d'argent
    expect(res.status).toBe(500);

    await settle();
    expect(await getWalletBalance(sender.walletId)).toBe(50_000);
    expect(await getWalletBalance(recipient.walletId)).toBe(0);

    // Trois écritures côté expéditeur : DEBIT TRANSFER_OUT + CREDIT REVERSAL
    const entries = await prisma.ledgerEntry.findMany({
      where: { walletId: sender.walletId },
      select: { type: true, direction: true, idempotencyKey: true },
    });
    expect(entries.some((e) => e.type === 'TRANSFER_OUT' && e.direction === 'DEBIT')).toBe(true);
    expect(entries.some((e) => e.type === 'REVERSAL' && e.direction === 'CREDIT')).toBe(true);
    expect(entries.some((e) => e.idempotencyKey?.startsWith('REV-'))).toBe(true);

    // Audit wallet.transfer_failed avec reversed: true
    const audit = await prisma.auditLog.findFirst({
      where: { userId: sender.id, action: 'wallet.transfer_failed' },
    });
    expect(audit).toBeTruthy();
    expect((audit?.metadata as Record<string, unknown> | null)?.reversed).toBe(true);
  });

  it('un transfert normal débite l’expéditeur et crédite le destinataire (pas de reversal)', async () => {
    const sender = await makeUser({ balance: 30_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    const recipient = await makeUser({ balance: 0 });
    userIds.push(sender.id, recipient.id);

    const token = signAccessToken({ sub: sender.id, phone: sender.phone, role: 'USER' });
    const res = await transfer(req(token, { recipientPhone: recipient.phone, amount: 8_000 }));
    expect(res.status).toBe(200);

    await settle();
    expect(await getWalletBalance(sender.walletId)).toBe(22_000);
    expect(await getWalletBalance(recipient.walletId)).toBe(8_000);

    const reversals = await prisma.ledgerEntry.count({
      where: { walletId: sender.walletId, type: 'REVERSAL' },
    });
    expect(reversals).toBe(0);
  });
});
