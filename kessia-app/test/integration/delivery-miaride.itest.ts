// ============================================================
// KESSIA — Livraison KESSIA–MiaRide : numéro de suivi KESSIA +
// photo du colis étiqueté (intégration)
//
// Vérifie contre une vraie base : `requestDelivery()` génère un
// `kessiaTrackingCode` unique (généré par KESSIA, distinct du
// `providerRef` MiaRide) en mode SIMULATED comme en mode HANDOFF ;
// `uploadLabelPhoto()` est réservé au vendeur, refuse une livraison
// terminée, et est idempotent (un nouveau dépôt remplace le précédent
// sans erreur).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import prisma from '@/lib/db/prisma';
import { requestDelivery, uploadLabelPhoto } from '@/lib/delivery';
import { makeUser, cleanup, settle } from './helpers';

const userIds: string[] = [];
const itemIds: string[] = [];

afterEach(async () => {
  await settle();
  for (const id of itemIds.splice(0)) {
    await prisma.marketplaceDelivery.deleteMany({ where: { order: { itemId: id } } }).catch(() => {});
    await prisma.marketplaceOrder.deleteMany({ where: { itemId: id } }).catch(() => {});
    await prisma.marketplaceItem.deleteMany({ where: { id } }).catch(() => {});
  }
  await cleanup({ userIds: userIds.splice(0) });
});

const FAKE_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function makeItem(sellerId: string, price: number, pickupZone = 'centre-ville') {
  const it = await prisma.marketplaceItem.create({
    data: {
      sellerId, title: `itest miaride ${Date.now()}`, price, currency: 'XOF',
      settlement: 'IMMEDIATE', stock: 1, status: 'ACTIVE', pickupZone,
    },
  });
  itemIds.push(it.id);
  return it;
}

/** Achat WALLET réglé immédiatement (vendeur déjà payé) : commande PAID. */
async function makePaidOrder(buyer: { id: string }, item: { id: string; price: unknown }) {
  const order = await prisma.marketplaceOrder.create({
    data: {
      itemId: item.id, buyerId: buyer.id, mode: 'WALLET', amount: Number(item.price), currency: 'XOF',
      status: 'PAID', settlement: 'IMMEDIATE', settledAt: new Date(),
    },
  });
  await prisma.marketplaceItem.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } });
  return order;
}

describe('requestDelivery — numéro de suivi KESSIA', () => {
  it('mode SIMULATED : génère un kessiaTrackingCode unique, distinct du providerRef MiaRide', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 5_000);
    const order = await makePaidOrder(buyer, item);

    const r = await requestDelivery({
      orderId: order.id, userId: buyer.id, mode: 'SIMULATED',
      dropoffZone: 'tokoin', dropoffAddress: 'Rue itest 12', recipientPhone: buyer.phone,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.delivery.kessiaTrackingCode).toMatch(/^KSA-[A-Z0-9]{8}$/);
    // Le numéro de suivi KESSIA n'est jamais le providerRef MiaRide — ce
    // sont deux références distinctes (cahier des charges).
    expect(r.delivery.kessiaTrackingCode).not.toBe(r.delivery.providerRef);
    expect(r.delivery.providerRef).toMatch(/^MIA-/);
  });

  it('mode HANDOFF : génère aussi un kessiaTrackingCode (providerRef vide tant que le code Miaride n\'est pas collé)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyer.id);

    const item = await makeItem(seller.id, 5_000);
    const order = await makePaidOrder(buyer, item);

    const r = await requestDelivery({
      orderId: order.id, userId: buyer.id, mode: 'HANDOFF',
      dropoffZone: 'tokoin', dropoffAddress: 'Rue itest 12', recipientPhone: buyer.phone,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delivery.kessiaTrackingCode).toMatch(/^KSA-[A-Z0-9]{8}$/);
    expect(r.delivery.providerRef).toBeNull();
    expect(r.handoffUrl).toBeTruthy();
  });

  it('deux livraisons distinctes reçoivent deux kessiaTrackingCode différents', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyerA = await makeUser({ balance: 10_000 });
    const buyerB = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyerA.id, buyerB.id);

    const itemA = await makeItem(seller.id, 4_000);
    const itemB = await makeItem(seller.id, 4_000);
    const orderA = await makePaidOrder(buyerA, itemA);
    const orderB = await makePaidOrder(buyerB, itemB);

    const rA = await requestDelivery({
      orderId: orderA.id, userId: buyerA.id, mode: 'SIMULATED',
      dropoffZone: 'tokoin', dropoffAddress: 'Rue A', recipientPhone: buyerA.phone,
    });
    const rB = await requestDelivery({
      orderId: orderB.id, userId: buyerB.id, mode: 'SIMULATED',
      dropoffZone: 'tokoin', dropoffAddress: 'Rue B', recipientPhone: buyerB.phone,
    });
    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);
    if (!rA.ok || !rB.ok) return;
    expect(rA.delivery.kessiaTrackingCode).not.toBe(rB.delivery.kessiaTrackingCode);
  });
});

describe('uploadLabelPhoto — preuve photo du colis étiqueté', () => {
  async function makeDelivery(seller: { id: string }, buyer: { id: string; phone: string }, item: { id: string; price: unknown }) {
    const order = await makePaidOrder(buyer, item);
    const r = await requestDelivery({
      orderId: order.id, userId: buyer.id, mode: 'SIMULATED',
      dropoffZone: 'tokoin', dropoffAddress: 'Rue itest', recipientPhone: buyer.phone,
    });
    if (!r.ok) throw new Error(`setup requestDelivery: ${r.error}`);
    return r.delivery;
  }

  it('réservé au vendeur : un tiers (y compris l\'acheteur) reçoit FORBIDDEN', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 3_000);
    const delivery = await makeDelivery(seller, buyer, item);

    const r = await uploadLabelPhoto(delivery.id, buyer.id, FAKE_PHOTO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FORBIDDEN');
  });

  it('le vendeur dépose la photo : labelPhotoUrl/labelPhotoUploadedAt/labelPhotoUploadedById enregistrés', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 3_000);
    const delivery = await makeDelivery(seller, buyer, item);

    const r = await uploadLabelPhoto(delivery.id, seller.id, FAKE_PHOTO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.delivery.labelPhotoUrl).toBe(FAKE_PHOTO);
    expect(r.delivery.labelPhotoUploadedAt).not.toBeNull();
    expect(r.delivery.labelPhotoUploadedById).toBe(seller.id);
  });

  it('idempotent : un second dépôt remplace le précédent sans erreur', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 3_000);
    const delivery = await makeDelivery(seller, buyer, item);

    const first = await uploadLabelPhoto(delivery.id, seller.id, FAKE_PHOTO);
    expect(first.ok).toBe(true);

    const OTHER_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCbbbbCbkIEVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const second = await uploadLabelPhoto(delivery.id, seller.id, OTHER_PHOTO);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.delivery.labelPhotoUrl).toBe(OTHER_PHOTO);
  });

  it('refuse le dépôt sur une livraison déjà terminée (CANCELLED)', async () => {
    const seller = await makeUser({ balance: 0 });
    const buyer = await makeUser({ balance: 10_000 });
    userIds.push(seller.id, buyer.id);
    const item = await makeItem(seller.id, 3_000);
    const delivery = await makeDelivery(seller, buyer, item);
    await prisma.marketplaceDelivery.update({ where: { id: delivery.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });

    const r = await uploadLabelPhoto(delivery.id, seller.id, FAKE_PHOTO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('CONFLICT');
  });

  it('livraison introuvable → NOT_FOUND', async () => {
    const seller = await makeUser({ balance: 0 });
    userIds.push(seller.id);
    const r = await uploadLabelPhoto('nonexistent-delivery-id', seller.id, FAKE_PHOTO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });
});
