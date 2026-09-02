// ============================================================
// KESSIA — Service de paiement (registre + orchestration)
//
// Flux (cahier §6.3, §11) :
//   1. crée une PaymentTransaction (PENDING)
//   2. délègue au PaymentProvider
//   3. si COMPLETED → écriture ledger (source de vérité du solde)
//   4. met à jour la PaymentTransaction (COMPLETED / PENDING / FAILED)
// Le frontend ne modifie jamais un solde directement.
// ============================================================

import prisma from '@/lib/db/prisma';
import { createLedgerEntry } from '@/lib/ledger/ledger.service';
import type { PaymentMethod, TransactionType } from '@prisma/client';
import type { PaymentDirection, PaymentProvider } from './types';
import {
  CashReceiptProvider,
  QRProvider,
  SimulatedBankProvider,
  SimulatedMobileMoneyProvider,
} from './providers';

const PROVIDERS: PaymentProvider[] = [
  new SimulatedMobileMoneyProvider(),
  new SimulatedBankProvider(),
  new CashReceiptProvider(),
  new QRProvider(),
];

export function resolveProvider(method: PaymentMethod, direction: PaymentDirection): PaymentProvider | null {
  return PROVIDERS.find((p) => p.supports(method, direction)) ?? null;
}

export function listProviders() {
  return PROVIDERS.map((p) => ({ name: p.name, simulated: p.simulated, methods: p.methods }));
}

const LEDGER_TYPE: Record<PaymentDirection, TransactionType> = {
  INBOUND: 'DEPOSIT',
  OUTBOUND: 'WITHDRAWAL',
};

export type CreatePaymentInput = {
  userId: string;
  walletId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  direction: PaymentDirection;
  account?: string;
  description?: string;
};

export type CreatePaymentResult = {
  ok: boolean;
  error?: string;
  payment?: {
    id: string;
    status: string;
    provider: string;
    simulated: boolean;
    externalRef: string | null;
    ledgerEntryId: string | null;
    balanceAfter?: number;
  };
};

// ------------------------------------------------------------
// Finalisation d'un paiement PENDING (appelé par le webhook du
// fournisseur — cahier §44). Idempotent : rejouer le même événement
// ne produit pas de double écriture.
// ------------------------------------------------------------

export type FinalizeResult =
  | { ok: true; status: 'COMPLETED' | 'FAILED' | 'ALREADY_SETTLED'; payment: { id: string; userId: string; status: string } }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'INVALID_STATE' };

export async function settlePendingPayment(params: {
  reference: string; // externalRef ou id de la PaymentTransaction
  result: 'COMPLETED' | 'FAILED';
  externalRef?: string;
  failureReason?: string;
}): Promise<FinalizeResult> {
  const tx = await prisma.paymentTransaction.findFirst({
    where: { OR: [{ id: params.reference }, { externalRef: params.reference }] },
  });
  if (!tx) return { ok: false, error: 'Transaction de paiement introuvable.', code: 'NOT_FOUND' };

  // Idempotence : déjà réglée → no-op
  if (tx.status === 'COMPLETED' || tx.status === 'FAILED') {
    return { ok: true, status: 'ALREADY_SETTLED', payment: { id: tx.id, userId: tx.userId, status: tx.status } };
  }
  if (tx.status !== 'PENDING' && tx.status !== 'PROCESSING') {
    return { ok: false, error: `État inattendu: ${tx.status}.`, code: 'INVALID_STATE' };
  }

  if (params.result === 'FAILED') {
    await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'FAILED',
        externalRef: params.externalRef ?? tx.externalRef,
        failureReason: params.failureReason ?? 'Refusé par le fournisseur.',
      },
    });
    return { ok: true, status: 'FAILED', payment: { id: tx.id, userId: tx.userId, status: 'FAILED' } };
  }

  // COMPLETED → écriture ledger idempotente (clé dérivée de l'id de tx)
  const direction = tx.direction as PaymentDirection;
  const ledger = await createLedgerEntry({
    walletId: tx.walletId,
    type: LEDGER_TYPE[direction],
    direction: direction === 'INBOUND' ? 'CREDIT' : 'DEBIT',
    amount: Number(tx.amount),
    description: `${direction === 'INBOUND' ? 'Dépôt' : 'Retrait'} confirmé via ${tx.provider}`,
    externalReference: params.externalRef ?? tx.externalRef ?? undefined,
    idempotencyKey: `PAYTX_${tx.id}`,
    metadata: { paymentTransactionId: tx.id, provider: tx.provider, simulated: tx.simulated, source: 'webhook' },
  });

  if (!ledger.success) {
    return { ok: false, error: ledger.error ?? 'Écriture comptable impossible.', code: 'INVALID_STATE' };
  }

  await prisma.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      status: 'COMPLETED',
      externalRef: params.externalRef ?? tx.externalRef,
      ledgerEntryId: ledger.entryId,
    },
  });

  return { ok: true, status: 'COMPLETED', payment: { id: tx.id, userId: tx.userId, status: 'COMPLETED' } };
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const provider = resolveProvider(input.method, input.direction);
  if (!provider) {
    return { ok: false, error: `Aucun fournisseur pour ${input.method} (${input.direction}).` };
  }

  const tx = await prisma.paymentTransaction.create({
    data: {
      userId: input.userId,
      walletId: input.walletId,
      provider: provider.name,
      method: input.method,
      direction: input.direction,
      amount: input.amount,
      currency: input.currency,
      status: 'PROCESSING',
      simulated: provider.simulated,
      metadata: input.account ? { account: input.account } : undefined,
    },
  });

  let outcome;
  try {
    outcome = await provider.process({
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      direction: input.direction,
      method: input.method,
      account: input.account,
      description: input.description,
    });
  } catch (e) {
    await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: 'FAILED', failureReason: e instanceof Error ? e.message : 'Erreur fournisseur' },
    });
    return { ok: false, error: 'Le fournisseur de paiement est indisponible.' };
  }

  if (outcome.status === 'FAILED') {
    await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: 'FAILED', externalRef: outcome.externalRef, failureReason: outcome.failureReason },
    });
    return { ok: false, error: outcome.failureReason ?? 'Paiement refusé par le fournisseur.' };
  }

  // PENDING : le fournisseur confirmera plus tard (webhook). Pas d'écriture ledger.
  if (outcome.status === 'PENDING') {
    const updated = await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: 'PENDING', externalRef: outcome.externalRef },
    });
    return {
      ok: true,
      payment: {
        id: updated.id,
        status: updated.status,
        provider: provider.name,
        simulated: provider.simulated,
        externalRef: updated.externalRef,
        ledgerEntryId: null,
      },
    };
  }

  // COMPLETED → écriture ledger
  const ledger = await createLedgerEntry({
    walletId: input.walletId,
    type: LEDGER_TYPE[input.direction],
    direction: input.direction === 'INBOUND' ? 'CREDIT' : 'DEBIT',
    amount: input.amount,
    description:
      input.description ??
      `${input.direction === 'INBOUND' ? 'Dépôt' : 'Retrait'} via ${input.method}`,
    externalReference: outcome.externalRef,
    metadata: { paymentTransactionId: tx.id, provider: provider.name, simulated: provider.simulated },
  });

  if (!ledger.success) {
    await prisma.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: 'FAILED', externalRef: outcome.externalRef, failureReason: ledger.error },
    });
    return { ok: false, error: ledger.error ?? 'Écriture comptable impossible.' };
  }

  const done = await prisma.paymentTransaction.update({
    where: { id: tx.id },
    data: { status: 'COMPLETED', externalRef: outcome.externalRef, ledgerEntryId: ledger.entryId },
  });

  return {
    ok: true,
    payment: {
      id: done.id,
      status: done.status,
      provider: provider.name,
      simulated: provider.simulated,
      externalRef: done.externalRef,
      ledgerEntryId: ledger.entryId ?? null,
      balanceAfter: ledger.balanceAfter,
    },
  };
}
