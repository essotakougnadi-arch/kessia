// ============================================================
// KESSIA — Icônes des « entrées » dérivées de données
//
// Les services (insights, opportunités, notifications, agenda)
// posent un `icon` emoji au moment de la création. Pour le rendu
// on préfère une icône Lucide : ces mappeurs purs traduisent
// l'identifiant / la catégorie en nom d'icône du registre.
// Pas d'I/O, sûrs côté client comme serveur.
// ============================================================

import type { NotificationCategory, TransactionType } from '@prisma/client';
import type { IconName } from '@/components/ui/Icon';

/** Insight (`lib/insights/insights.service.ts`) → icône, d'après son `id`. */
export function insightIconName(id: string): IconName {
  if (id.startsWith('kyc')) return 'shield';
  if (id.startsWith('contrib')) return 'alarm-clock';
  if (id.startsWith('low-balance')) return 'trending-down';
  if (id.startsWith('enable-2fa')) return 'lock';
  if (id === 'score-high' || id.startsWith('biz-strong')) return 'trophy';
  if (id.startsWith('biz')) return 'business';
  if (id.startsWith('score')) return 'trending-up';
  if (id.startsWith('welcome')) return 'wave';
  return 'star';
}

/** Opportunité (`lib/opportunities/engine.ts`) → icône, d'après son `id`. */
export function opportunityIconName(id: string): IconName {
  if (id.includes('quotes')) return 'document';
  if (id.includes('reactivate')) return 'tontines';
  if (id.includes('restock')) return 'package';
  if (id.includes('thin')) return 'scale';
  if (id.includes('goal')) return 'target';
  if (id.startsWith('score')) return 'trending-up';
  if (id.startsWith('simulate')) return 'simulator';
  return 'star';
}

/** Type de transaction wallet → icône. */
export function transactionIconName(type: TransactionType): IconName {
  switch (type) {
    case 'DEPOSIT': return 'topup';
    case 'WITHDRAWAL': return 'withdraw';
    case 'TRANSFER_IN': return 'receive';
    case 'TRANSFER_OUT': return 'send';
    case 'TONTINE_CONTRIBUTION': return 'tontines';
    case 'TONTINE_PAYOUT': return 'celebrate';
    case 'SALE_PAYMENT': return 'business';
    case 'FEE': return 'receipt';
    case 'REVERSAL':
    case 'REFUND': return 'receive';
    default: return 'wallet';
  }
}

/** Priorité admin (`lib/admin/copilot.ts`) → icône, d'après son `id`. */
export function adminPriorityIconName(id: string): IconName {
  switch (id) {
    case 'fraud': return 'shield-alert';
    case 'kyc': return 'shield';
    case 'tickets': return 'message';
    case 'guarantee': return 'support';
    case 'late': return 'alarm-clock';
    case 'suspended': return 'cross';
    default: return 'star';
  }
}

/** Catégorie de notification → icône. */
export function notificationIconName(cat: NotificationCategory): IconName {
  switch (cat) {
    case 'SECURITY': return 'shield';
    case 'PAYMENT': return 'check';
    case 'TONTINE': return 'tontines';
    case 'BUSINESS': return 'chart';
    case 'SUPPORT': return 'message';
    case 'PROMOTION': return 'gift';
    case 'SYSTEM':
    default: return 'ai';
  }
}

