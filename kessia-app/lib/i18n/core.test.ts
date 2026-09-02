import { describe, it, expect } from 'vitest';
import { makeTranslate, interpolate, resolve } from './core';
import { fr } from './messages/fr';
import { en } from './messages/en';

describe('interpolate', () => {
  it('remplace les {placeholders} présents et laisse les autres', () => {
    expect(interpolate('il y a {n} min', { n: 5 })).toBe('il y a 5 min');
    expect(interpolate('{a} et {b}', { a: 'x' })).toBe('x et {b}');
    expect(interpolate('sans var')).toBe('sans var');
  });
});

describe('resolve', () => {
  it('ne renvoie que des chaînes (pas les objets intermédiaires)', () => {
    expect(resolve(fr, 'nav.home')).toBe('Accueil');
    expect(resolve(fr, 'nav')).toBeUndefined();
    expect(resolve(fr, 'nav.inexistant')).toBeUndefined();
  });
});

describe('makeTranslate', () => {
  it('fr : renvoie la valeur française', () => {
    const t = makeTranslate('fr');
    expect(t('srvScore.band.TRES_FIABLE')).toBe('Très fiable');
  });

  it('en : renvoie la valeur anglaise pour la prose serveur (ADR 0027/0028)', () => {
    const t = makeTranslate('en');
    expect(t('srvScore.band.TRES_FIABLE')).toBe('Very reliable');
    expect(t('srvGrowth.category.BUSINESS')).toBe('Business');
    expect(t('srvOpps.tontineJoinAction')).toBe('See the tontine');
    expect(t('srvFees.line.withdrawal.fee')).toBe('0.5%');
  });

  it('interpolation via le 2e argument', () => {
    const t = makeTranslate('en');
    expect(t('srvScore.d.kycVerified', { level: 2 })).toBe('Identity verified (level 2).');
  });

  it('repli automatique : locale → fr → clé', () => {
    const t = makeTranslate('ee'); // éwé : quasi vide, retombe sur fr
    expect(t('srvScore.band.FIABLE')).toBe('Fiable');
    expect(t('cle.totalement.inexistante')).toBe('cle.totalement.inexistante');
  });
});

describe('cohérence en ⊆ fr pour la prose serveur', () => {
  const walk = (obj: unknown, prefix = ''): string[] => {
    if (typeof obj === 'string') return [prefix];
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj as Record<string, unknown>)
      .flatMap(([k, v]) => walk(v, prefix ? `${prefix}.${k}` : k));
  };

  it('toutes les clés srv* de en existent dans fr et sont non vides', () => {
    const enSrv = walk(en).filter((p) => p.startsWith('srv'));
    expect(enSrv.length).toBeGreaterThan(50);
    for (const path of enSrv) {
      expect(resolve(en, path), `en:${path} vide`).toBeTruthy();
      expect(resolve(fr, path), `fr:${path} absent`).toBeTruthy();
    }
  });
});
