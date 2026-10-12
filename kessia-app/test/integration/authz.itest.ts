// ============================================================
// KESSIA — Tests d'autorisation (intégration, P2.20 volet 2)
//
// Les 11 scénarios du plan (docs/audit/PHASE0_EXECUTION_PLAN.md,
// lignes 420-434). Contre une vraie base, comme les autres *.itest.ts.
//
// 5 des 11 scénarios sont déjà couverts, EXHAUSTIVEMENT (souvent au-delà
// de l'exigence du plan — ex. 20 requêtes concurrentes au lieu de 2),
// par des fichiers dédiés existants. Ne pas dupliquer ici — seule une
// référence précise est indiquée :
//   5  (rôle USER sur /admin/*)                → admin-rbac.itest.ts
//   6  (rejeu d'un webhook signé déjà traité)   → webhook-security.itest.ts
//   7  (rejeu POST /marketplace/[id]/order)     → marketplace-order-idempotency.itest.ts
//   9  (session révoquée)                       → session-security.itest.ts
//        ("withAuth — révocation appliquée immédiatement")
//   10 (refresh token déjà tourné)               → session-security.itest.ts
//        ("rotateRefreshToken — rotation & détection de réutilisation")
//
// Les 6 scénarios restants (1, 2, 3, 4, 8, 11) n'avaient aucune
// couverture automatisée avant ce fichier — implémentés ci-dessous.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signAccessToken } from '@/lib/auth/session';
import { getWalletBalance } from '@/lib/ledger/ledger.service';
import { prisma, makeUser, cleanup, settle, tag } from './helpers';

import { GET as walletGet } from '@/app/api/v1/wallet/route';
import { GET as tontineGet } from '@/app/api/v1/tontine/[id]/route';
import { POST as transferPost } from '@/app/api/v1/wallet/transfer/route';
import { POST as contributePost } from '@/app/api/v1/tontine/[id]/contribute/route';
import { POST as deliveriesPost } from '@/app/api/v1/marketplace/deliveries/route';

const userIds: string[] = [];
const tontineIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceDelivery.deleteMany({ where: { order: { itemId: id } } }).catch(() => {});
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0), tontineIds: tontineIds.splice(0) });
});

function tokenFor(user: { id: string; phone: string }) {
  return signAccessToken({ sub: user.id, phone: user.phone, role: 'USER' });
}

// ---- Scénario 1 ---------------------------------------------

describe('Scénario 1 — GET /wallet et GET /tontine/[id] : jamais les données d\'un autre utilisateur', () => {
  it('GET /wallet renvoie toujours le wallet du porteur du token, même en tentant d\'injecter l\'id de B en query', async () => {
    const a = await makeUser({ balance: 10_000 });
    const b = await makeUser({ balance: 999_000 });
    userIds.push(a.id, b.id);

    const res = await walletGet(
      new NextRequest(`http://localhost/api/v1/wallet?userId=${b.id}&id=${b.walletId}`, {
        headers: { authorization: `Bearer ${tokenFor(a)}` },
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; balance: number } };
    expect(body.data.id).toBe(a.walletId);
    expect(body.data.balance).toBe(10_000);
  });

  it('GET /tontine/[id] d\'une tontine privée : un non-membre reçoit 403, jamais les données des membres/cotisations', async () => {
    const organizer = await makeUser({ balance: 0 });
    const attacker = await makeUser({ balance: 0 });
    userIds.push(organizer.id, attacker.id);

    const t = await prisma.tontine.create({
      data: {
        name: `IT privée ${tag()}`, type: 'CLASSIC_ROTATING', amount: 5_000, currency: 'XOF',
        frequency: 'MONTHLY', startDate: new Date(), maxMembers: 5, totalRounds: 5,
        inviteCode: `IT-${tag()}`, createdById: organizer.id, isPublic: false,
        members: { create: [{ userId: organizer.id, status: 'ACTIVE', orderPosition: 1, joinedAt: new Date() }] },
      },
    });
    tontineIds.push(t.id);

    const res = await tontineGet(
      new NextRequest(`http://localhost/api/v1/tontine/${t.id}`, {
        headers: { authorization: `Bearer ${tokenFor(attacker)}` },
      }),
      { params: Promise.resolve({ id: t.id }) }
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; data?: unknown };
    expect(body.success).toBe(false);
    expect(body.data).toBeUndefined();
  });
});

// ---- Scénario 2 ---------------------------------------------

describe('Scénario 2 — POST /wallet/transfer : aucun champ ne permet d\'usurper le wallet d\'un autre', () => {
  it('injecter fromWalletId/senderWalletId appartenant à B n\'a aucun effet : A débite toujours SON PROPRE wallet, B n\'est jamais touché', async () => {
    const a = await makeUser({ balance: 50_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    const b = await makeUser({ balance: 200_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    const recipient = await makeUser({ balance: 0 });
    userIds.push(a.id, b.id, recipient.id);

    const res = await transferPost(
      new NextRequest('http://localhost/api/v1/wallet/transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(a)}` },
        // `transferSchema` (zod) ne déclare aucun de ces champs — ils sont
        // ignorés silencieusement, le wallet expéditeur reste TOUJOURS
        // dérivé de context.userId (le token), jamais du corps envoyé.
        body: JSON.stringify({
          recipientPhone: recipient.phone,
          amount: 10_000,
          fromWalletId: b.walletId,
          senderWalletId: b.walletId,
          userId: b.id,
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(await getWalletBalance(a.walletId)).toBe(40_000); // A débité
    expect(await getWalletBalance(b.walletId)).toBe(200_000); // B strictement intact
  });
});

// ---- Scénario 3 ---------------------------------------------

describe('Scénario 3 — POST /tontine/[id]/contribute sans être membre actif', () => {
  it('un non-membre d\'une tontine active reçoit 403, aucune cotisation créée', async () => {
    const organizer = await makeUser({ balance: 0 });
    const attacker = await makeUser({ balance: 100_000 });
    userIds.push(organizer.id, attacker.id);

    const t = await prisma.tontine.create({
      data: {
        name: `IT contribute ${tag()}`, type: 'CLASSIC_ROTATING', amount: 5_000, currency: 'XOF',
        frequency: 'MONTHLY', startDate: new Date(), maxMembers: 2, totalRounds: 2,
        inviteCode: `IT-${tag()}`, createdById: organizer.id, status: 'ACTIVE',
        members: { create: [{ userId: organizer.id, status: 'ACTIVE', orderPosition: 1, joinedAt: new Date() }] },
      },
    });
    tontineIds.push(t.id);

    const res = await contributePost(
      new NextRequest(`http://localhost/api/v1/tontine/${t.id}/contribute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(attacker)}` },
        body: JSON.stringify({ round: 1 }),
      }),
      { params: Promise.resolve({ id: t.id }) }
    );

    expect(res.status).toBe(403);
    expect(await getWalletBalance(attacker.walletId)).toBe(100_000); // aucun débit
    expect(await prisma.tontineContribution.count({ where: { tontineId: t.id } })).toBe(0);
  });
});

// ---- Scénario 4 ---------------------------------------------

describe('Scénario 4 — POST /marketplace/deliveries sur une commande d\'un autre acheteur', () => {
  it('un attaquant qui n\'est pas l\'acheteur de la commande reçoit 403, aucune livraison créée', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 0 });
    const attacker = await makeUser({ balance: 0 });
    userIds.push(seller.id, buyer.id, attacker.id);

    const item = await prisma.marketplaceItem.create({
      data: {
        sellerId: seller.id, title: `itest authz ${tag()}`, price: 20_000, currency: 'XOF',
        settlement: 'ON_DELIVERY', stock: 1, status: 'ACTIVE',
      },
    });
    itemIds.push(item.id);
    const order = await prisma.marketplaceOrder.create({
      data: {
        itemId: item.id, buyerId: buyer.id, mode: 'WALLET', amount: 20_000, currency: 'XOF',
        status: 'PENDING_SETTLEMENT', settlement: 'ON_DELIVERY', ledgerRef: `ITEST_AUTHZ_${item.id}`,
      },
    });

    const res = await deliveriesPost(
      new NextRequest('http://localhost/api/v1/marketplace/deliveries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(attacker)}` },
        body: JSON.stringify({
          orderId: order.id,
          mode: 'SIMULATED',
          dropoffZone: 'centre-ville',
          dropoffAddress: 'Adresse de test, quartier centre-ville',
          recipientPhone: attacker.phone,
        }),
      })
    );

    expect(res.status).toBe(403);
    expect(await prisma.marketplaceDelivery.count({ where: { orderId: order.id } })).toBe(0);
  });
});

// ---- Scénario 8 ---------------------------------------------

describe('Scénario 8 — POST /wallet/transfer en parallèle avec la même Idempotency-Key', () => {
  it('deux requêtes vraiment concurrentes, même clé : un seul débit, un seul crédit', async () => {
    const sender = await makeUser({ balance: 100_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    const recipient = await makeUser({ balance: 0 });
    userIds.push(sender.id, recipient.id);
    const token = tokenFor(sender);
    const key = crypto.randomUUID();

    function transferRequest() {
      return new NextRequest('http://localhost/api/v1/wallet/transfer', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'idempotency-key': key,
        },
        body: JSON.stringify({ recipientPhone: recipient.phone, amount: 15_000 }),
      });
    }

    const [r1, r2] = await Promise.all([transferPost(transferRequest()), transferPost(transferRequest())]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    expect(await getWalletBalance(sender.walletId)).toBe(85_000); // un seul débit de 15 000
    expect(await getWalletBalance(recipient.walletId)).toBe(15_000); // un seul crédit
  });
});

// ---- Scénario 11 ---------------------------------------------

describe('Scénario 11 — requête d\'écriture cross-origin sans en-tête Authorization (CSRF)', () => {
  it('POST /wallet/transfer avec seulement un cookie d\'accès (sans Authorization) est refusé — withAuth ne lit jamais le cookie pour une écriture', async () => {
    const sender = await makeUser({ balance: 50_000, kycStatus: 'VERIFIED', kycLevel: 2 });
    const recipient = await makeUser({ balance: 0 });
    userIds.push(sender.id, recipient.id);
    const accessToken = tokenFor(sender);

    // Simule une page tierce forçant une requête cross-site : le
    // navigateur attacherait le cookie automatiquement (sameSite=lax
    // n'empêcherait pas toujours une sous-requête simple), mais ne peut
    // jamais poser l'en-tête Authorization — lib/auth/middleware.ts
    // (withAuth) ne lit le cookie qu'en repli GET (commentaire : « une
    // requête d'écriture exige toujours l'en-tête »). Résultat réel :
    // 401 (jeton manquant), pas littéralement 403 « CSRF » — voir note
    // dans le rapport final de ce volet.
    const res = await transferPost(
      new NextRequest('http://localhost/api/v1/wallet/transfer', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://site-attaquant.exemple',
          cookie: `kessia-access-token=${accessToken}`,
        },
        body: JSON.stringify({ recipientPhone: recipient.phone, amount: 10_000 }),
      })
    );

    expect(res.status).toBe(401);
    expect(await getWalletBalance(sender.walletId)).toBe(50_000); // aucun débit
  });
});
