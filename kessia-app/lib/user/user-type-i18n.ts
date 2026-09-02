'use client';
// ============================================================
// KESSIA — Surcouche i18n des profils utilisateur (§38)
// `user-type.ts` reste FR (consommé côté serveur : registerSchema,
// génération de notifications…). Ce hook localise label / hint /
// firstSteps / aiPrompts pour l'affichage client (accueil, profil,
// assistant, inscription).
// ============================================================

import type { UserType } from '@prisma/client';
import { useT } from '@/lib/i18n';
import { userTypeMeta, MVP_USER_TYPES, USER_TYPES, type UserTypeMeta } from './user-type';

export function useUserTypeMeta() {
  const t = useT();

  const localize = (type: UserType): UserTypeMeta => {
    const base = userTypeMeta(type);
    return {
      ...base,
      label: t(`userType.${type}.label`, base.label),
      hint: t(`userType.${type}.hint`, base.hint),
      firstSteps: base.firstSteps.map((s, i) => ({
        ...s,
        label: t(`userType.${type}.step${i + 1}`, s.label),
      })),
      aiPrompts: base.aiPrompts.map((p, i) => t(`userType.${type}.prompt${i + 1}`, p)),
    };
  };

  return {
    get: localize,
    mvpList: MVP_USER_TYPES.map((m) => localize(m.key)),
    allList: USER_TYPES.map((m) => localize(m.key)),
  };
}
