// ============================================================
// KESSIA — Hooks Marketplace (§16)
// La liste et le détail fonctionnent connecté OU déconnecté.
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';

export type MarketItem = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  city: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  payableByTontine: boolean;
  tontineInstallments: number | null;
  tontineInstallmentAmount?: number | null;
  stock: number;
  status: string;
  pickupZone: string | null;
  pickupZoneLabel: string | null;
  createdAt: string;
  sellerId: string;
  sellerName: string | null;
  businessName: string | null;
};

export type DeliveryStatus = 'REQUESTED' | 'COURIER_ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export type DeliveryInfo = {
  id: string;
  status: DeliveryStatus;
  mode: 'SIMULATED' | 'HANDOFF';
  simulated: boolean;
  feeAmount: number;
  feeCurrency: string;
  etaMinutes: number | null;
  courierName: string | null;
  trackingUrl: string | null;
  providerRef: string | null;
  dropoffAddress: string;
  pickupLabel: string;
  sellerReadyAt: string | null;
  deliveredAt: string | null;
};

export type MyPurchase = {
  id: string;
  mode: 'WALLET' | 'TONTINE';
  status: string;
  amount: number;
  currency: string;
  tontineId: string | null;
  createdAt: string;
  item: { id: string; title: string; hasImage: boolean };
  deliverable: boolean;
  pickupMissing: boolean;
  delivery: DeliveryInfo | null;
};

export type MySale = { id: string; item: { title: string }; delivery: DeliveryInfo };

export type ActionResult = { success: boolean; message: string; data?: unknown };

function toResult(r: ApiResult): ActionResult {
  return {
    success: r.success,
    message: r.message ?? r.error ?? (r.success ? 'Fait.' : 'Une erreur est survenue.'),
    data: r.data,
  };
}

async function publicFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json();
  if (!json?.success) throw new Error(json?.message ?? 'Échec du chargement.');
  return json.data as T;
}

// ── Catalogue ──────────────────────────────────────────────
export function useMarketplaceList(params: { q?: string; category?: string; tontine?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.tontine) qs.set('tontine', '1');
  const key = `/api/v1/marketplace${qs.toString() ? `?${qs}` : ''}`;

  const { data, error, isLoading, mutate } = useSWR<{ items: MarketItem[]; nextCursor: string | null }>(
    key,
    publicFetch,
    { revalidateOnFocus: false }
  );

  return { items: data?.items ?? [], isLoading, error: error as Error | undefined, refresh: () => mutate() };
}

// ── Détail ─────────────────────────────────────────────────
export function useMarketplaceItem(id: string) {
  const { data, error, isLoading, mutate } = useSWR<MarketItem>(
    id ? `/api/v1/marketplace/${id}` : null,
    publicFetch,
    { revalidateOnFocus: false }
  );
  return { item: data ?? null, isLoading, error: error as Error | undefined, refresh: () => mutate() };
}

// ── Mes articles / achats ──────────────────────────────────
export function useMyMarketplace() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data, error, isLoading, mutate } = useSWR<{
    items: (MarketItem & { orderCount: number })[];
    purchases: MyPurchase[];
    sales: MySale[];
  }>(
    accessToken ? ['/api/v1/marketplace/mine', accessToken] : null,
    ([url]: [string, string]) => apiGet(url),
    { revalidateOnFocus: false }
  );
  return {
    items: data?.items ?? [],
    purchases: data?.purchases ?? [],
    sales: data?.sales ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}

// ── Livraison (ADR 0042) ───────────────────────────────────
export type DeliveryQuote = {
  enabled: boolean;
  alreadyRequested: boolean;
  pickupLabel: string | null;
  pickupMissing: boolean;
  covered: boolean;
  amount: number;
  currency: string;
  etaMinutes: number;
  toLabel: string;
};

export function useDeliveryActions() {
  async function quote(orderId: string, dropoffZone: string): Promise<DeliveryQuote | null> {
    const r = await apiSend('/api/v1/marketplace/deliveries/quote', 'POST', { orderId, dropoffZone });
    return r.success ? (r.data as DeliveryQuote) : null;
  }
  async function request(payload: {
    orderId: string;
    mode: 'SIMULATED' | 'HANDOFF';
    dropoffZone: string;
    dropoffAddress: string;
    recipientPhone: string;
  }): Promise<ActionResult> {
    return toResult(await apiSend('/api/v1/marketplace/deliveries', 'POST', payload));
  }
  async function act(deliveryId: string, body: Record<string, unknown>): Promise<ActionResult> {
    return toResult(await apiSend(`/api/v1/marketplace/deliveries/${deliveryId}`, 'POST', body));
  }
  return { quote, request, act };
}

// ── Actions ────────────────────────────────────────────────
export function useMarketplaceActions() {
  async function createItem(payload: Record<string, unknown>): Promise<ActionResult> {
    return toResult(await apiSend('/api/v1/marketplace', 'POST', payload));
  }
  async function updateItem(id: string, payload: Record<string, unknown>): Promise<ActionResult> {
    return toResult(await apiSend(`/api/v1/marketplace/${id}`, 'PATCH', payload));
  }
  async function archiveItem(id: string): Promise<ActionResult> {
    return toResult(await apiSend(`/api/v1/marketplace/${id}`, 'DELETE'));
  }
  async function order(
    id: string,
    body: { mode: 'WALLET' } | { mode: 'TONTINE'; installments: number }
  ): Promise<ActionResult> {
    return toResult(await apiSend(`/api/v1/marketplace/${id}/order`, 'POST', body));
  }
  return { createItem, updateItem, archiveItem, order };
}
