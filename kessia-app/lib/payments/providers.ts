// ============================================================
// KESSIA — Implémentations PaymentProvider (MVP : simulées)
// ============================================================

import { generateSecureToken } from '@/lib/utils/crypto';
import type { PaymentMethod } from '@prisma/client';
import type { PaymentDirection, PaymentIntent, PaymentOutcome, PaymentProvider } from './types';

function ref(prefix: string): string {
  return `${prefix}-${Date.now()}-${generateSecureToken(4).toUpperCase()}`;
}

/**
 * Mobile Money simulé. Représente Flooz / TMoney en attendant les
 * intégrations réelles (API opérateurs + sandbox).
 */
export class SimulatedMobileMoneyProvider implements PaymentProvider {
  readonly name = 'simulated-mobile-money';
  readonly simulated = true;
  readonly methods: PaymentMethod[] = ['MOBILE_MONEY'];

  supports(method: PaymentMethod, _direction: PaymentDirection): boolean {
    return this.methods.includes(method);
  }

  async process(intent: PaymentIntent): Promise<PaymentOutcome> {
    // MVP : crédit/débit instantané. En production, statut PENDING puis
    // webhook opérateur → COMPLETED / FAILED.
    return {
      status: 'COMPLETED',
      provider: this.name,
      simulated: true,
      externalRef: ref('MM'),
      metadata: { account: intent.account, note: 'Transaction simulée (démo).' },
    };
  }
}

/** Virement bancaire simulé. */
export class SimulatedBankProvider implements PaymentProvider {
  readonly name = 'simulated-bank';
  readonly simulated = true;
  readonly methods: PaymentMethod[] = ['BANK_TRANSFER'];

  supports(method: PaymentMethod): boolean {
    return this.methods.includes(method);
  }

  async process(intent: PaymentIntent): Promise<PaymentOutcome> {
    // Un virement réel est asynchrone → on renvoie PENDING pour les
    // dépôts (attente de compensation), COMPLETED pour les retraits.
    return {
      status: intent.direction === 'INBOUND' ? 'PENDING' : 'COMPLETED',
      provider: this.name,
      simulated: true,
      externalRef: ref('BNK'),
      metadata: { note: 'Virement simulé (démo).' },
    };
  }
}

/** Encaissement / décaissement via un agent (reçu). */
export class CashReceiptProvider implements PaymentProvider {
  readonly name = 'cash-receipt';
  readonly simulated = true;
  readonly methods: PaymentMethod[] = ['CASH'];

  supports(method: PaymentMethod): boolean {
    return this.methods.includes(method);
  }

  async process(_intent: PaymentIntent): Promise<PaymentOutcome> {
    return {
      status: 'COMPLETED',
      provider: this.name,
      simulated: true,
      externalRef: ref('CASH'),
      metadata: { note: 'Reçu agent simulé (démo).' },
    };
  }
}

/** Paiement par QR entre membres KESSIA (interne, pas de fournisseur externe). */
export class QRProvider implements PaymentProvider {
  readonly name = 'kessia-qr';
  readonly simulated = false;
  readonly methods: PaymentMethod[] = ['QR'];

  supports(method: PaymentMethod): boolean {
    return this.methods.includes(method);
  }

  async process(_intent: PaymentIntent): Promise<PaymentOutcome> {
    return { status: 'COMPLETED', provider: this.name, simulated: false, externalRef: ref('QR') };
  }
}
