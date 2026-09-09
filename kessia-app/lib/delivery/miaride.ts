// ============================================================
// KESSIA — Adaptateur Miaride (ADR 0042)
//
// Miaride = plateforme togolaise de coursier moto/voiture + VTC.
// v1 SIMULÉ : aucun vrai coursier n'est affecté. Les statuts avancent
// tout seuls (bandeau « aperçu » côté UI). Le mode HANDOFF, lui, est
// bien réel : on prépare le bon et on renvoie l'acheteur vers Miaride.
//
// Config (facultative — placeholders sûrs par défaut) :
//   MIARIDE_ENABLED        "1" pour activer l'option (déf. activé)
//   MIARIDE_DISPATCH_URL   base du lien de commande (wa.me ou web)
//   MIARIDE_TRACKING_BASE  base des URLs de suivi
// ============================================================

import type { DeliveryStatus } from '@prisma/client';
import { estimateFee, type FeeEstimate } from './zones';
import type { DeliveryBrief, DeliveryProvider, DeliveryQuoteInput, SimulatedCourier } from './types';

const DISPATCH_URL = process.env.MIARIDE_DISPATCH_URL || 'https://wa.me/22890000000';
const TRACKING_BASE = process.env.MIARIDE_TRACKING_BASE || 'https://miaride.app/suivi/';
const ENABLED = process.env.MIARIDE_ENABLED !== '0';

const COURIER_NAMES = [
  'Mensah T.', 'Sena A.', 'Dodji K.', 'Elom G.', 'Fofo B.', 'Nyuiadzi P.', 'Akakpo R.', 'Bawa L.',
];

function ref(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `MIA-${s}`;
}

// Ordre de progression d'une course simulée. On s'arrête à IN_TRANSIT :
// « livré » est confirmé par l'acheteur (l'app ne peut pas le savoir seule)
// ou poussé par un vrai webhook Miaride.
const FLOW: DeliveryStatus[] = ['REQUESTED', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'];

export class MiarideProvider implements DeliveryProvider {
  readonly name = 'Miaride';
  readonly kind = 'MIARIDE' as const;
  readonly simulated = true;
  readonly enabled = ENABLED;

  quote(input: DeliveryQuoteInput): FeeEstimate {
    return estimateFee(input.fromZone, input.toZone);
  }

  createSimulated(_brief: DeliveryBrief): SimulatedCourier {
    const providerRef = ref();
    return {
      providerRef,
      trackingUrl: this.trackingUrlFor(providerRef),
      courierName: `${COURIER_NAMES[Math.floor(Math.random() * COURIER_NAMES.length)]} · moto`,
      status: 'COURIER_ASSIGNED',
    };
  }

  nextStatus(current: DeliveryStatus, sellerReady: boolean): DeliveryStatus | null {
    if (current === 'DELIVERED' || current === 'CANCELLED') return null;
    // Le coursier ne récupère pas tant que le vendeur n'a pas confirmé.
    if (current === 'COURIER_ASSIGNED' && !sellerReady) return null;
    const i = FLOW.indexOf(current);
    if (i < 0 || i >= FLOW.length - 1) return null;
    return FLOW[i + 1];
  }

  buildHandoffLink(brief: DeliveryBrief): string {
    const brief_lines = [
      'Livraison KESSIA Marketplace',
      `Enlèvement : ${brief.pickupLabel}`,
      `Livraison : ${brief.dropoffAddress} (${brief.dropoffZoneLabel})`,
      `Destinataire : ${brief.recipientPhone}`,
      `Colis : ${brief.itemTitle} — valeur ~${Math.round(brief.itemValue).toLocaleString('fr-FR')} ${brief.currency}`,
    ];
    const text = encodeURIComponent(brief_lines.join('\n'));
    if (DISPATCH_URL.includes('wa.me') || DISPATCH_URL.includes('api.whatsapp.com')) {
      const sep = DISPATCH_URL.includes('?') ? '&' : '?';
      return `${DISPATCH_URL}${sep}text=${text}`;
    }
    const sep = DISPATCH_URL.includes('?') ? '&' : '?';
    return `${DISPATCH_URL}${sep}brief=${text}`;
  }

  trackingUrlFor(providerRef: string): string {
    return `${TRACKING_BASE}${encodeURIComponent(providerRef)}`;
  }
}
