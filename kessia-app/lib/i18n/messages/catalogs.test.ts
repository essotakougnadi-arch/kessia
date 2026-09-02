import { describe, it, expect } from 'vitest';
import { fr } from './fr';
import { en } from './en';
import { ee } from './ee';

type Node = { [k: string]: string | Node };

function paths(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Node).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? [p] : paths(v, p);
  });
}

const frPaths = new Set(paths(fr));

describe('catalogues i18n', () => {
  it('toutes les clés de en/ee existent dans fr (source de vérité)', () => {
    const strays = (name: string, cat: unknown) =>
      paths(cat).filter((p) => !frPaths.has(p)).map((p) => `${name}:${p}`);
    expect([...strays('en', en), ...strays('ee', ee)]).toEqual([]);
  });

  it('en couvre entièrement le parcours d’authentification', () => {
    const authKeys = [...frPaths].filter((p) => p.startsWith('auth.'));
    const enPaths = new Set(paths(en));
    expect(authKeys.filter((p) => !enPaths.has(p))).toEqual([]);
  });

  it('aucune valeur vide dans fr et en', () => {
    const emptyIn = (cat: unknown) =>
      paths(cat).filter((p) => {
        const v = p.split('.').reduce<unknown>((a, k) => (a as Node)?.[k], cat);
        return v === '';
      });
    expect(emptyIn(fr)).toEqual([]);
    expect(emptyIn(en)).toEqual([]);
  });
});
