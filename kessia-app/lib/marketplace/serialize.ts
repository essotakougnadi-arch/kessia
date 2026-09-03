// ============================================================
// KESSIA — Marketplace : sérialisation des articles pour l'API
// ============================================================

import type { MarketplaceItem } from '@prisma/client';

type ItemWithSeller = MarketplaceItem & {
  seller: { id: string; firstName: string; lastName: string } | null;
  business?: { id: string; name: string } | null;
};

export function serializeItem(it: ItemWithSeller, opts?: { includeImage?: boolean }) {
  return {
    id: it.id,
    title: it.title,
    description: it.description,
    category: it.category,
    price: Number(it.price),
    currency: it.currency,
    city: it.city,
    imageUrl: opts?.includeImage === false ? null : it.imageUrl,
    hasImage: !!it.imageUrl,
    payableByTontine: it.payableByTontine,
    tontineInstallments: it.tontineInstallments,
    stock: it.stock,
    status: it.status,
    createdAt: it.createdAt,
    sellerId: it.sellerId,
    sellerName: it.seller ? `${it.seller.firstName} ${it.seller.lastName}` : null,
    businessName: it.business?.name ?? null,
  };
}
