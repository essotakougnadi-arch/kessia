// ============================================================
// KESSIA — Livraison marketplace : contrat fournisseur (ADR 0042)
//
// Un `DeliveryProvider` encapsule un partenaire coursier. v1 : Miaride
// (simulé). Le jour du vrai partenariat, seul l'adaptateur change.
// ============================================================

import type { DeliveryStatus } from '@prisma/client';
import type { FeeEstimate } from './zones';

export type DeliveryQuoteInput = {
  /** clé LOME_ZONES du vendeur */
  fromZone: string | null;
  /** clé LOME_ZONES de l'acheteur */
  toZone: string | null;
};

export type DeliveryBrief = {
  itemTitle: string;
  itemValue: number;
  currency: string;
  /** quartier + ville du vendeur */
  pickupLabel: string;
  /** adresse texte de l'acheteur */
  dropoffAddress: string;
  /** libellé du quartier de l'acheteur */
  dropoffZoneLabel: string;
  recipientPhone: string;
  sellerPhone?: string | null;
};

export type SimulatedCourier = {
  providerRef: string;
  trackingUrl: string;
  courierName: string;
  status: DeliveryStatus;
};

export interface DeliveryProvider {
  readonly name: string;
  readonly kind: 'MIARIDE';
  readonly simulated: boolean;
  /** true si le module est activé (config partenaire) */
  readonly enabled: boolean;

  /** Estimation tarifaire (délègue à zones.estimateFee). */
  quote(input: DeliveryQuoteInput): FeeEstimate;

  /** SIMULATED : « affecte » un coursier fictif. */
  createSimulated(brief: DeliveryBrief): SimulatedCourier;

  /**
   * Étape suivante d'une livraison simulée, ou `null` si aucune
   * progression possible (état terminal, ou en attente que le vendeur
   * marque le colis prêt).
   */
  nextStatus(current: DeliveryStatus, sellerReady: boolean): DeliveryStatus | null;

  /** HANDOFF : lien pré-rempli vers Miaride pour commander soi-même. */
  buildHandoffLink(brief: DeliveryBrief): string;

  /** URL publique de suivi d'un code fournisseur. */
  trackingUrlFor(providerRef: string): string;
}
