import { describe, it, expect, afterEach } from 'vitest';
import {
  formatNumber,
  formatCurrency,
  formatSignedAmount,
  describeTransaction,
  formatFrequency,
  formatRelativeDate,
  initials,
  setFormatMessages,
  TONTINE_FREQ_LABELS,
  type FormatMessages,
} from './format';

const EN: FormatMessages = {
  justNow: 'Just now',
  minutesAgo: '{n} min ago',
  today: 'Today {time}',
  yesterday: 'Yesterday {time}',
  freq: { WEEKLY: 'Weekly', BIWEEKLY: 'Fortnightly', MONTHLY: 'Monthly' },
  tx: {
    DEPOSIT: 'Top-up', WITHDRAWAL: 'Withdrawal', TRANSFER_IN: 'Transfer received',
    TRANSFER_OUT: 'Transfer sent', TONTINE_CONTRIBUTION: 'Tontine contribution',
    TONTINE_PAYOUT: 'Tontine payout', SALE_PAYMENT: 'Merchant payment', FEE: 'Service fee',
    REVERSAL: 'Reversal', REFUND: 'Refund', fallback: 'Transaction',
  },
};
const FR: FormatMessages = {
  justNow: "À l'instant",
  minutesAgo: 'Il y a {n} min',
  today: "Aujourd'hui {time}",
  yesterday: 'Hier {time}',
  freq: { WEEKLY: 'Hebdomadaire', BIWEEKLY: 'Bimensuel', MONTHLY: 'Mensuel' },
  tx: {
    DEPOSIT: 'Rechargement', WITHDRAWAL: 'Retrait', TRANSFER_IN: 'Transfert reçu',
    TRANSFER_OUT: 'Transfert envoyé', TONTINE_CONTRIBUTION: 'Cotisation tontine',
    TONTINE_PAYOUT: 'Gain tontine', SALE_PAYMENT: 'Paiement marchand', FEE: 'Frais de service',
    REVERSAL: 'Annulation', REFUND: 'Remboursement', fallback: 'Transaction',
  },
};

describe('formatNumber', () => {
  it('groupe les milliers en style FR', () => {
    expect(formatNumber(1500)).toBe('1 500');
    expect(formatNumber(1234567)).toBe('1 234 567');
  });
  it('arrondit', () => {
    expect(formatNumber(1499.6)).toBe('1 500');
  });
});

describe('formatCurrency', () => {
  it('XOF → FCFA', () => {
    expect(formatCurrency(25000, 'XOF')).toBe('25 000 FCFA');
  });
  it('devise inconnue → suffixe brut', () => {
    expect(formatCurrency(10, 'GHS')).toBe('10 GHS');
  });
});

describe('formatSignedAmount', () => {
  it('crédit → +, débit → -', () => {
    expect(formatSignedAmount(40000, 'CREDIT')).toBe('+40 000');
    expect(formatSignedAmount(15000, 'DEBIT')).toBe('-15 000');
    expect(formatSignedAmount(-15000, 'DEBIT')).toBe('-15 000');
  });
});

describe('describeTransaction', () => {
  it('mappe chaque type à une icône + libellé', () => {
    expect(describeTransaction('DEPOSIT')).toEqual({ icon: '⬆️', label: 'Rechargement' });
    expect(describeTransaction('TONTINE_CONTRIBUTION').label).toBe('Cotisation tontine');
  });
  it('utilise la description si fournie', () => {
    expect(describeTransaction('FEE', 'Frais retrait').label).toBe('Frais retrait');
  });
});

describe('initials', () => {
  it('prend la 1re lettre de chaque nom, en majuscule', () => {
    expect(initials('Kossi', 'Amétépé')).toBe('KA');
    expect(initials('ama', undefined)).toBe('A');
    expect(initials(undefined, undefined)).toBe('?');
  });
});

describe('TONTINE_FREQ_LABELS', () => {
  it('couvre les 3 fréquences', () => {
    expect(TONTINE_FREQ_LABELS.WEEKLY).toBe('Hebdomadaire');
    expect(TONTINE_FREQ_LABELS.BIWEEKLY).toBe('Bimensuel');
    expect(TONTINE_FREQ_LABELS.MONTHLY).toBe('Mensuel');
  });
});

describe('localisation via setFormatMessages (§38)', () => {
  afterEach(() => setFormatMessages(FR));

  it('bascule les libellés de transaction et de fréquence', () => {
    setFormatMessages(EN);
    expect(describeTransaction('DEPOSIT').label).toBe('Top-up');
    expect(formatFrequency('MONTHLY')).toBe('Monthly');
  });

  it('bascule les dates relatives, avec interpolation {n}', () => {
    setFormatMessages(EN);
    const now = new Date();
    expect(formatRelativeDate(now)).toBe('Just now');
    expect(formatRelativeDate(new Date(now.getTime() - 5 * 60_000))).toBe('5 min ago');
  });

  it('revient au français par défaut', () => {
    setFormatMessages(FR);
    expect(describeTransaction('DEPOSIT').label).toBe('Rechargement');
    expect(formatFrequency('WEEKLY')).toBe('Hebdomadaire');
  });
});
