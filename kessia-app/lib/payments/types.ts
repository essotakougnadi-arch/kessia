// ============================================================
// KESSIA — Abstraction PaymentProvider (cahier des charges §6.3)
//
//   PaymentProvider
//   ├── MobileMoneyProvider   (simulé pour le MVP)
//   ├── BankProvider          (simulé pour le MVP)
//   ├── QRProvider            (interne)
//   └── CashReceiptProvider   (agent / reçu)
//
// Les fournisseurs réels (opérateurs Mobile Money, banques) seront
// branchés via leurs API officielles + sandbox. Aucun faux paiement
// ne doit être présenté comme réel : `simulated` est explicite.
// ============================================================

import type { PaymentMethod } from '@prisma/client';

export type PaymentDirection = 'INBOUND' | 'OUTBOUND';

export type PaymentIntent = {
  userId: string;
  amount: number;
  currency: string;
  direction: PaymentDirection;
  method: PaymentMethod;
  /** téléphone / IBAN / référence agent selon le fournisseur */
  account?: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentOutcome = {
  /** COMPLETED → le ledger peut être crédité/débité immédiatement */
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  provider: string;
  simulated: boolean;
  externalRef?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly name: string;
  readonly simulated: boolean;
  readonly methods: PaymentMethod[];
  supports(method: PaymentMethod, direction: PaymentDirection): boolean;
  process(intent: PaymentIntent): Promise<PaymentOutcome>;
}
