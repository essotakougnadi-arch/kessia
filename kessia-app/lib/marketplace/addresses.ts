// ============================================================
// KESSIA — Carnet d'adresses de livraison (ADR 0045)
// ============================================================

import prisma from '@/lib/db/prisma';
import { findZone } from '@/lib/delivery/zones';
import type { DeliveryAddress } from '@prisma/client';

export type SerializedAddress = {
  id: string;
  label: string;
  area: string;
  areaLabel: string | null;
  address: string;
  recipientPhone: string;
  isDefault: boolean;
};

export function serializeAddress(a: DeliveryAddress): SerializedAddress {
  return {
    id: a.id,
    label: a.label,
    area: a.area,
    areaLabel: findZone(a.area)?.label ?? null,
    address: a.address,
    recipientPhone: a.recipientPhone,
    isDefault: a.isDefault,
  };
}

export async function listAddresses(userId: string): Promise<SerializedAddress[]> {
  const rows = await prisma.deliveryAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  return rows.map(serializeAddress);
}

/** Crée une adresse ; si `isDefault`, retire le drapeau des autres. */
export async function createAddress(
  userId: string,
  data: { label: string; area: string; address: string; recipientPhone: string; isDefault?: boolean },
): Promise<SerializedAddress> {
  const count = await prisma.deliveryAddress.count({ where: { userId } });
  const isDefault = data.isDefault || count === 0; // la première adresse devient le défaut
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.deliveryAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.deliveryAddress.create({
      data: {
        userId,
        label: data.label,
        area: data.area,
        address: data.address,
        recipientPhone: data.recipientPhone,
        isDefault,
      },
    });
  });
  return serializeAddress(created);
}

export async function updateAddress(
  userId: string,
  id: string,
  data: Partial<{ label: string; area: string; address: string; recipientPhone: string; isDefault: boolean }>,
): Promise<SerializedAddress | null> {
  const existing = await prisma.deliveryAddress.findFirst({ where: { id, userId } });
  if (!existing) return null;
  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.deliveryAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.deliveryAddress.update({ where: { id }, data });
  });
  return serializeAddress(updated);
}

export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  const res = await prisma.deliveryAddress.deleteMany({ where: { id, userId } });
  return res.count > 0;
}
