'use client';
// ============================================================
// KESSIA — Surcouche i18n du catalogue de modules (§38)
// `catalog.ts` reste FR (consommé côté serveur par /admin/modules
// et les routes d'intérêt). Ce hook localise name/tagline/description
// pour l'affichage client (/explore).
// ============================================================

import { useT } from '@/lib/i18n';
import {
  LIVE_MODULES,
  UPCOMING_MODULES,
  type ModuleEntry,
  type ModuleStatus,
} from './catalog';

export function useModuleCatalog() {
  const t = useT();

  const localize = (m: ModuleEntry): ModuleEntry => ({
    ...m,
    name: t(`explore.modules.${m.key}.name`, m.name),
    tagline: t(`explore.modules.${m.key}.tagline`, m.tagline),
    description: t(`explore.modules.${m.key}.description`, m.description),
  });

  const statusLabel = (s: ModuleStatus): string => t(`explore.status.${s}`);

  return {
    live: LIVE_MODULES.map(localize),
    upcoming: UPCOMING_MODULES.map(localize),
    statusLabel,
  };
}
