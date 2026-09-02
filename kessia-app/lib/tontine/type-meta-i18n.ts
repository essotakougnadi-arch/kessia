'use client';
// ============================================================
// KESSIA — Métadonnées des types de tontine, localisées (§38)
//
// `type-meta.ts` reste la source de vérité (FR + logique de
// distribution, aussi utilisée côté serveur). Ce module ne fait
// que superposer les libellés traduits depuis le catalogue, avec
// repli automatique sur le FR d'origine.
// ============================================================

import type { TontineType } from '@prisma/client';
import { useT } from '@/lib/i18n';
import { TONTINE_TYPES, tontineTypeMeta, type TontineTypeMeta } from './type-meta';

export function useTontineTypeMeta() {
  const t = useT();
  return (type: TontineType): TontineTypeMeta => {
    const base = tontineTypeMeta(type);
    const k = base.key;
    return {
      ...base,
      label: t(`tontineType.${k}.label`, base.label),
      tagline: t(`tontineType.${k}.tagline`, base.tagline),
      description: t(`tontineType.${k}.description`, base.description),
      howItWorks: base.howItWorks.map((s, i) => t(`tontineType.${k}.step${i + 1}`, s)),
    };
  };
}

export function useTontineTypeList(): TontineTypeMeta[] {
  const localize = useTontineTypeMeta();
  return TONTINE_TYPES.map((x) => localize(x.key));
}
