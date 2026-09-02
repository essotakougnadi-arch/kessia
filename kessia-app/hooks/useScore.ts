// ============================================================
// KESSIA — useScore Hook (KESSIA Score §10, §22)
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet } from '@/lib/api/client';

export type ScoreFactor = {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
};

export type KessiaScore = {
  score: number;
  band: string;
  bandLabel: string;
  factors: ScoreFactor[];
  advice: string[];
  generatedAt: string;
};

export function useScore() {
  const token = useAuthStore((s) => s.accessToken);

  const { data, error, isLoading, mutate } = useSWR<KessiaScore>(
    token ? ['/api/v1/score', token] : null,
    ([u]: [string, string]) => apiGet(u),
    { revalidateOnFocus: false }
  );

  return {
    score: data ?? null,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}
