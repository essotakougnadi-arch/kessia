// ============================================================
// KESSIA — Fuzzing (fast-check) des schémas Zod Marketplace
//
// Phase 7 de l'audit (cahier des charges/master prompt) : « fuzzing Zod,
// jamais fait ». Les tests par exemple existants couvrent des valeurs
// choisies à la main ; ceci couvre l'espace d'entrée bien plus largement
// (NaN, Infinity, chaînes adverses, tailles extrêmes) pour prouver que
// les bornes métier (prix, stock, taille d'image) tiennent VRAIMENT,
// pas seulement sur les cas déjà pensés. Propriété commune à tous les
// cas : `safeParse` ne doit jamais lever, et un succès doit toujours
// respecter les bornes déclarées du schéma.
// ============================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createItemSchema, imageDataUri } from './marketplace';

describe('Fuzzing — createItemSchema (prix/stock)', () => {
  it('safeParse ne lève jamais, et un succès respecte toujours les bornes prix/stock déclarées', () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ minLength: 0, maxLength: 200 }),
          price: fc.oneof(
            fc.double({ noNaN: false, min: -1e12, max: 1e12 }), // inclut NaN, ±Infinity possibles via oneof ci-dessous
            fc.constant(Number.NaN),
            fc.constant(Number.POSITIVE_INFINITY),
            fc.constant(Number.NEGATIVE_INFINITY),
            fc.constant(0),
            fc.constant(-0),
          ),
          stock: fc.oneof(
            fc.integer({ min: -1_000_000, max: 1_000_000 }),
            fc.double(),
            fc.constant(Number.NaN),
          ),
        }),
        (input) => {
          let result: ReturnType<typeof createItemSchema.safeParse>;
          expect(() => { result = createItemSchema.safeParse(input); }).not.toThrow();
          result = createItemSchema.safeParse(input);
          if (result.success) {
            // Un prix accepté doit être fini, strictement positif, et borné.
            expect(Number.isFinite(result.data.price)).toBe(true);
            expect(result.data.price).toBeGreaterThan(0);
            expect(result.data.price).toBeLessThanOrEqual(50_000_000);
            // Un stock accepté doit être un entier fini dans la plage déclarée.
            expect(Number.isInteger(result.data.stock)).toBe(true);
            expect(result.data.stock).toBeGreaterThanOrEqual(1);
            expect(result.data.stock).toBeLessThanOrEqual(9999);
          }
        }
      ),
      { numRuns: 2000 }
    );
  });

  it('NaN/Infinity/-Infinity/0/négatif sont TOUJOURS rejetés pour price (jamais acceptés par accident)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, -0.0001]) {
      const r = createItemSchema.safeParse({ title: 'x', price: bad });
      expect(r.success, `price=${bad} ne doit jamais être accepté`).toBe(false);
    }
  });
});

describe('Fuzzing — imageDataUri', () => {
  it('safeParse ne lève jamais sur une chaîne arbitraire, et un succès respecte toujours le format et la taille déclarés', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        expect(() => imageDataUri.safeParse(input)).not.toThrow();
        const result = imageDataUri.safeParse(input);
        if (result.success) {
          expect(result.data.length).toBeLessThanOrEqual(2_700_000);
          expect(/^data:image\/(jpeg|png|webp);base64,/.test(result.data)).toBe(true);
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('une chaîne dépassant 2 700 000 caractères est toujours rejetée, même avec un en-tête valide', () => {
    const tooLarge = 'data:image/png;base64,' + 'A'.repeat(2_700_000);
    expect(imageDataUri.safeParse(tooLarge).success).toBe(false);
  });

  it('rejette tout type MIME hors jpeg/png/webp (pas de contournement par casse/espace/type voisin)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('gif', 'svg+xml', 'bmp', 'JPEG', 'PNG', ' png', 'png ', 'image/png', ''),
        (mime) => {
          const r = imageDataUri.safeParse(`data:image/${mime};base64,AAAA`);
          expect(r.success).toBe(false);
        }
      )
    );
  });
});
