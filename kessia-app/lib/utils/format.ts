// ============================================================
// KESSIA — Helpers de formatage (montants, dates, transactions)
// ============================================================

import type { Direction, TontineFrequency, TransactionType } from '@prisma/client';

// ── Libellés localisables ───────────────────────────────────
// Ces helpers sont des fonctions pures (pas des hooks) : le provider i18n
// pousse la traduction courante via `setFormatMessages()` (§38). Défaut = FR ;
// côté serveur (ex. back-office), le singleton n'est jamais muté → reste FR.

export type FormatMessages = {
  justNow: string;
  minutesAgo: string; // contient {n}
  today: string; // contient {time}
  yesterday: string; // contient {time}
  freq: Record<TontineFrequency, string>;
  tx: Record<TransactionType, string> & { fallback: string };
};

const FR_MESSAGES: FormatMessages = {
  justNow: "À l'instant",
  minutesAgo: 'Il y a {n} min',
  today: "Aujourd'hui {time}",
  yesterday: 'Hier {time}',
  freq: { WEEKLY: 'Hebdomadaire', BIWEEKLY: 'Bimensuel', MONTHLY: 'Mensuel' },
  tx: {
    DEPOSIT: 'Rechargement',
    WITHDRAWAL: 'Retrait',
    TRANSFER_IN: 'Transfert reçu',
    TRANSFER_OUT: 'Transfert envoyé',
    TONTINE_CONTRIBUTION: 'Cotisation tontine',
    TONTINE_PAYOUT: 'Gain tontine',
    SALE_PAYMENT: 'Paiement marchand',
    FEE: 'Frais de service',
    REVERSAL: 'Annulation',
    REFUND: 'Remboursement',
    fallback: 'Transaction',
  },
};

let MESSAGES: FormatMessages = FR_MESSAGES;
export function setFormatMessages(m: FormatMessages) {
  MESSAGES = m;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** @deprecated Utiliser `t('freq.<FREQ>')` en composant, ou `formatFrequency()`. */
export const TONTINE_FREQ_LABELS: Record<TontineFrequency, string> = FR_MESSAGES.freq;

export function formatFrequency(freq: TontineFrequency): string {
  return MESSAGES.freq[freq] ?? FR_MESSAGES.freq[freq];
}

// Locale de formatage — pilotée par le provider i18n (§38). Défaut FR.
let FORMAT_LOCALE = 'fr-FR';
export function setFormatLocale(intlLocale: string) {
  FORMAT_LOCALE = intlLocale || 'fr-FR';
}

const CURRENCY_LABELS: Record<string, string> = {
  XOF: 'FCFA',
  XAF: 'FCFA',
  EUR: '€',
  USD: '$',
};

/**
 * Formate un montant : 135750 → "135 750"
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(FORMAT_LOCALE, { maximumFractionDigits: 0 }).format(
    Math.round(value)
  );
}

/**
 * Formate un montant avec devise : (135750, 'XOF') → "135 750 FCFA"
 */
export function formatCurrency(value: number, currency = 'XOF'): string {
  return `${formatNumber(value)} ${CURRENCY_LABELS[currency] ?? currency}`;
}

/**
 * Montant signé pour l'affichage d'une transaction : "+40 000" / "-15 000"
 */
export function formatSignedAmount(value: number, direction: Direction): string {
  const sign = direction === 'CREDIT' ? '+' : '-';
  return `${sign}${formatNumber(Math.abs(value))}`;
}

/**
 * Date relative courte, localisée via `setFormatMessages` (défaut FR).
 * < 1 min → "À l'instant" · < 1 h → "Il y a 12 min" · aujourd'hui → "Aujourd'hui 14:32"
 * hier → "Hier 09:15" · sinon → "23 août 17:40" (le jour/mois suit la locale Intl)
 */
export function formatRelativeDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);

  const time = date.toLocaleTimeString(FORMAT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffMin < 1) return MESSAGES.justNow;
  if (diffMin < 60) return fill(MESSAGES.minutesAgo, { n: diffMin });

  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) return fill(MESSAGES.today, { time });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return fill(MESSAGES.yesterday, { time });

  if (diffH < 24 * 7) {
    return `${date.toLocaleDateString(FORMAT_LOCALE, { weekday: 'short' })} ${time}`;
  }

  return `${date.toLocaleDateString(FORMAT_LOCALE, { day: 'numeric', month: 'short' })} ${time}`;
}

/**
 * Date longue : "1 septembre 2026"
 */
export function formatDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(FORMAT_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Icône + libellé lisible pour un type de transaction.
 */
const TX_ICONS: Record<TransactionType, string> = {
  DEPOSIT: '⬆️',
  WITHDRAWAL: '💸',
  TRANSFER_IN: '➡️',
  TRANSFER_OUT: '↗️',
  TONTINE_CONTRIBUTION: '🔄',
  TONTINE_PAYOUT: '🎉',
  SALE_PAYMENT: '🏪',
  FEE: '🧾',
  REVERSAL: '↩️',
  REFUND: '↩️',
};

export function describeTransaction(
  type: TransactionType,
  description?: string | null
): { icon: string; label: string } {
  const icon = TX_ICONS[type] ?? '💰';
  const label = description || MESSAGES.tx[type] || MESSAGES.tx.fallback;
  return { icon, label };
}

/**
 * Initiales à partir d'un prénom / nom : ("Kossi", "Amavi") → "KA"
 */
export function initials(firstName?: string | null, lastName?: string | null): string {
  const a = firstName?.trim()?.[0] ?? '';
  const b = lastName?.trim()?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}
