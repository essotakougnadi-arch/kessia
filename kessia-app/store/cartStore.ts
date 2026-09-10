'use client';
// ============================================================
// KESSIA — Panier Marketplace (ADR 0041, item 3)
//
// Panier multi-articles CÔTÉ CLIENT uniquement (localStorage). Au
// paiement, chaque ligne est envoyée à l'API EXISTANTE
// `POST /marketplace/[id]/order` (mode WALLET), une fois par unité de
// quantité — c'est le même mécanisme d'achat direct qu'avant (ADR
// 0039), simplement enchaîné plusieurs fois. Aucune nouvelle route,
// aucun nouveau modèle : le panier est une commodité d'interface, pas
// un nouveau système de commande. Le paiement par tontine reste
// disponible uniquement en achat direct (un plan solo cible UN article).
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CartLine = {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  qty: number;
  // Pour regrouper la livraison par vendeur au paiement (ADR 0045).
  sellerId?: string | null;
  sellerName?: string | null;
  pickupZone?: string | null;
};

type CartAddInput = {
  id: string;
  title: string;
  price: number;
  currency: string;
  imageUrl: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  pickupZone?: string | null;
};

type CartState = {
  lines: CartLine[];
  add: (item: CartAddInput) => void;
  remove: (itemId: string) => void;
  setQty: (itemId: string, qty: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (item) =>
        set((state) => {
          const existing = state.lines.find((l) => l.itemId === item.id);
          if (existing) {
            return {
              lines: state.lines.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l)),
            };
          }
          return {
            lines: [
              ...state.lines,
              {
                itemId: item.id, title: item.title, price: item.price, currency: item.currency,
                imageUrl: item.imageUrl, qty: 1,
                sellerId: item.sellerId ?? null, sellerName: item.sellerName ?? null,
                pickupZone: item.pickupZone ?? null,
              },
            ],
          };
        }),
      remove: (itemId) => set((state) => ({ lines: state.lines.filter((l) => l.itemId !== itemId) })),
      setQty: (itemId, qty) =>
        set((state) => ({
          lines: qty <= 0
            ? state.lines.filter((l) => l.itemId !== itemId)
            : state.lines.map((l) => (l.itemId === itemId ? { ...l, qty } : l)),
        })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'kessia-cart' }
  )
);
