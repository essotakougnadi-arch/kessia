// ============================================================
// KESSIA — useDiscover Hook
// Fil public de découverte (tontines publiques ouvertes).
// Fonctionne connecté OU déconnecté : fetch simple, pas de jeton.
// ============================================================

'use client';

import useSWR from 'swr';
import type { PurchaseMode, TontineFrequency, TontineType } from '@prisma/client';
import type { MarketItem } from './useMarketplace';

export type DiscoverTontine = {
  id: string;
  name: string;
  description: string | null;
  type: TontineType;
  purchaseMode: PurchaseMode;
  purchaseItem: string | null;
  amount: number;
  targetAmount: number | null;
  currency: string;
  frequency: TontineFrequency;
  maxMembers: number;
  totalRounds: number;
  memberCount: number;
  seatsLeft: number;
  hasConditions: boolean;
  createdByFirstName: string;
  createdAt: string;
};

type DiscoverData = { tontines: DiscoverTontine[]; items: MarketItem[] };

async function fetchDiscover(url: string): Promise<DiscoverData> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json();
  if (!json?.success) throw new Error(json?.message ?? 'Échec du chargement.');
  return json.data as DiscoverData;
}

export function useDiscover() {
  const { data, error, isLoading, mutate } = useSWR<DiscoverData>(
    '/api/v1/discover',
    fetchDiscover,
    { revalidateOnFocus: false }
  );

  return {
    tontines: data?.tontines ?? [],
    items: data?.items ?? [],
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}
