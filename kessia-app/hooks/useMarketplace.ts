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
  settlement: 'IMMEDIATE' | 'ON_DELIVERY';
  createdAt: string;
  sellerId: string;
  sellerName: string | null;
  businessName: string | null;
};

export type DeliveryStatus =
  | 'SCHEDULED' | 'REQUESTED' | 'COURIER_ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

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
  dropoffArea: string;
  pickupLabel: string;
  extraItemCount: number;
  sellerReadyAt: string | null;
  deliveredAt: string | null;
};

export type MyPurchase = {
  id: string;
  mode: 'WALLET' | 'TONTINE';
  status: string;
  settlement: 'IMMEDIATE' | 'ON_DELIVERY';
  amount: number;
  currency: string;
  tontineId: string | null;
  tontineStatus: string | null;
  createdAt: string;
  sellerId: string;
  item: { id: string; title: string; hasImage: boolean };
  deliverable: boolean;
  pickupMissing: boolean;
  scheduleable: boolean;
  scheduledActivatable: boolean;
  awaitingReceipt: boolean;
  delivery: DeliveryInfo | null;
  coveredByDeliveryId: string | null;
};

export type MySale = {
  id: string;
  settlement: 'IMMEDIATE' | 'ON_DELIVERY';
  status: string;
  item: { title: string };
  delivery: DeliveryInfo;
};

export type DeliveryAddress = {
  id: string;
  label: string;
  area: string;
  areaLabel: string | null;
  address: string;
  recipientPhone: string;
  isDefault: boolean;
};

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
    alsoOrderIds?: string[];
    mode: 'SIMULATED' | 'HANDOFF';
    schedule?: boolean;
    addressId?: string;
    dropoffZone?: string;
    dropoffAddress?: string;
    recipientPhone?: string;
    saveAddress?: boolean;
    saveAddressLabel?: string;
  }): Promise<ActionResult> {
    return toResult(await apiSend('/api/v1/marketplace/deliveries', 'POST', payload));
  }
  async function act(deliveryId: string, body: Record<string, unknown>): Promise<ActionResult> {
    return toResult(await apiSend(`/api/v1/marketplace/deliveries/${deliveryId}`, 'POST', body));
  }
  return { quote, request, act };
}

// ── Carnet d'adresses de livraison (ADR 0045) ──────────────
export function useDeliveryAddresses() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data, isLoading, mutate } = useSWR<{ addresses: DeliveryAddress[] }>(
    accessToken ? ['/api/v1/marketplace/addresses', accessToken] : null,
    ([url]: [string, string]) => apiGet(url),
    { revalidateOnFocus: false },
  );
  async function create(payload: Omit<DeliveryAddress, 'id' | 'areaLabel' | 'isDefault'> & { isDefault?: boolean }): Promise<ActionResult> {
    const r = toResult(await apiSend('/api/v1/marketplace/addresses', 'POST', payload));
    if (r.success) mutate();
    return r;
  }
  async function update(id: string, payload: Partial<DeliveryAddress>): Promise<ActionResult> {
    const r = toResult(await apiSend(`/api/v1/marketplace/addresses/${id}`, 'PATCH', payload));
    if (r.success) mutate();
    return r;
  }
  async function remove(id: string): Promise<ActionResult> {
    const r = toResult(await apiSend(`/api/v1/marketplace/addresses/${id}`, 'DELETE'));
    if (r.success) mutate();
    return r;
  }
  return { addresses: data?.addresses ?? [], isLoading, refresh: () => mutate(), create, update, remove };
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
