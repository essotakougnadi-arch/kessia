// ============================================================
// KESSIA — Garde RBAC back-office (cahier des charges §45)
// ============================================================

import type { NextRequest } from 'next/server';
import { withAuthAndRole, type AuthContext } from '@/lib/auth/middleware';
import type { UserRole } from '@prisma/client';

export const ALL_ADMIN_ROLES: UserRole[] = [
  'SUPER_ADMIN', 'ADMIN', 'COMPLIANCE', 'FINANCE', 'OPERATIONS', 'SUPPORT', 'MODERATOR', 'CONTENT_MANAGER', 'ANALYST',
];

export const COMPLIANCE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'COMPLIANCE'];
export const FINANCE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'FINANCE'];
export const SUPPORT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'OPERATIONS'];

export async function requireAdmin(
  request: NextRequest,
  roles: UserRole[] = ALL_ADMIN_ROLES
): Promise<{ error: Response | null; context: AuthContext | null }> {
  const { error, context } = await withAuthAndRole(request, roles);
  return { error, context };
}
