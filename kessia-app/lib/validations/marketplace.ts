// ============================================================
// KESSIA — Schémas de validation Zod (Marketplace, §16)
// ============================================================

import { z } from 'zod';
import { LOME_ZONES } from '@/lib/delivery/zones';

const ZONE_KEYS = LOME_ZONES.map((z) => z.key) as [string, ...string[]];

export const MARKETPLACE_CATEGORIES = [
  'EQUIPEMENT',
  'MATIERE_PREMIERE',
  'PRODUIT_FINI',
  'SERVICE',
  'AGRICOLE',
  'ALIMENTATION_BOISSONS',
  'VETEMENTS_ACCESSOIRES',
  'AUTRE',
] as const;

// data-URI image compressée côté client (comme le KYC). ~2,7 Mo max.
const imageDataUri = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Image invalide.')
  .max(2_700_000, 'Image trop lourde (compressez-la).');

export const createItemSchema = z.object({
  title: z.string().trim().min(3, 'Titre trop court').max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(MARKETPLACE_CATEGORIES).optional(),
  price: z.number().positive('Prix invalide').max(50_000_000),
  city: z.string().trim().max(80).optional(),
  imageUrl: imageDataUri.optional(),
  payableByTontine: z.boolean().default(false),
  tontineInstallments: z.number().int().min(2).max(24).optional(),
  stock: z.number().int().min(1).max(9999).default(1),
  businessId: z.string().cuid().optional(),
  pickupZone: z.enum(ZONE_KEYS).optional(),
  settlement: z.enum(['IMMEDIATE', 'ON_DELIVERY']).default('IMMEDIATE'),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(MARKETPLACE_CATEGORIES).optional(),
  price: z.number().positive().max(50_000_000).optional(),
  city: z.string().trim().max(80).optional(),
  imageUrl: imageDataUri.optional(),
  payableByTontine: z.boolean().optional(),
  tontineInstallments: z.number().int().min(2).max(24).nullable().optional(),
  stock: z.number().int().min(0).max(9999).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  pickupZone: z.enum(ZONE_KEYS).nullable().optional(),
  settlement: z.enum(['IMMEDIATE', 'ON_DELIVERY']).optional(),
});

export const orderSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('WALLET') }),
  z.object({
    mode: z.literal('TONTINE'),
    installments: z.number().int().min(2).max(24),
  }),
]);

export type OrderInput = z.infer<typeof orderSchema>;

// ── Livraison (ADR 0042) ─────────────────────────────────────
export const deliveryQuoteSchema = z.object({
  orderId: z.string().cuid(),
  dropoffZone: z.enum(ZONE_KEYS),
});

export const requestDeliverySchema = z.object({
  orderId: z.string().cuid(),
  // Panier multi-articles : autres commandes du même vendeur regroupées
  // sous cette livraison (mêmes enlèvement / dépôt).
  alsoOrderIds: z.array(z.string().cuid()).max(20).optional(),
  mode: z.enum(['SIMULATED', 'HANDOFF']),
  // Achat par tontine : la livraison est enregistrée mais reste
  // SCHEDULED tant que l'achat n'est pas finalisé.
  schedule: z.boolean().optional(),
  // Adresse : soit une entrée du carnet, soit saisie libre.
  addressId: z.string().cuid().optional(),
  dropoffZone: z.enum(ZONE_KEYS).optional(),
  dropoffAddress: z.string().trim().min(5, 'Adresse trop courte').max(240).optional(),
  recipientPhone: z.string().trim().min(8, 'Téléphone invalide').max(20).optional(),
  // Enregistrer l'adresse saisie dans le carnet.
  saveAddress: z.boolean().optional(),
  saveAddressLabel: z.string().trim().min(1).max(40).optional(),
}).refine(
  (v) => !!v.addressId || (!!v.dropoffZone && !!v.dropoffAddress && !!v.recipientPhone),
  { message: 'Adresse de livraison incomplète.' },
);

export const trackingCodeSchema = z.object({
  code: z.string().trim().min(3).max(40),
});

// ── Carnet d'adresses de livraison (ADR 0045) ────────────────
export const createAddressSchema = z.object({
  label: z.string().trim().min(1, 'Nom requis').max(40),
  area: z.enum(ZONE_KEYS),
  address: z.string().trim().min(5, 'Adresse trop courte').max(240),
  recipientPhone: z.string().trim().min(8, 'Téléphone invalide').max(20),
  isDefault: z.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();
