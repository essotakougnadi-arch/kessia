// ============================================================
// KESSIA — Élévation de rôle (cahier des charges §4, §45)
//
// Un compte grand public commence en `USER`. Créer une tontine en
// fait un `TONTINE_MANAGER` ; créer une entreprise un `BUSINESS_OWNER`.
// Ces rôles portent l'identité et adaptent les tableaux de bord ; ils
// ne donnent aucun accès au back-office.
//
// Ne descend jamais un rôle et ne touche jamais un rôle privilégié.
// ============================================================

import prisma from '@/lib/db/prisma';
import type { UserRole } from '@prisma/client';

const RANK: Partial<Record<UserRole, number>> = {
  USER: 0,
  TONTINE_MANAGER: 1,
  BUSINESS_OWNER: 2,
};

/** Fait passer le rôle à `target` si c'est une promotion et que le compte est grand public. Ne lève jamais. */
export async function elevateRole(userId: string, target: 'BUSINESS_OWNER' | 'TONTINE_MANAGER'): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) return;
    const current = RANK[user.role];
    const next = RANK[target];
    if (current === undefined || next === undefined) return; // rôle privilégié → on ne touche pas
    if (next <= current) return; // pas une promotion
    await prisma.user.update({ where: { id: userId }, data: { role: target } });
  } catch (e) {
    console.error('[ROLES] échec élévation', target, e);
  }
}
