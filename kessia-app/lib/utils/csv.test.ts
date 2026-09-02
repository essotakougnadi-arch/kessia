import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('génère un en-tête et des lignes séparés par « ; »', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(csv).toBe('﻿a;b\n1;x\n2;y');
  });

  it('échappe les valeurs contenant un séparateur, un guillemet ou un retour ligne', () => {
    const csv = toCsv([{ nom: 'Dupont; Fils', note: 'dit "bonjour"' }]);
    expect(csv).toContain('"Dupont; Fils";"dit ""bonjour"""');
  });

  it('retourne une chaîne vide sans lignes', () => {
    expect(toCsv([])).toBe('');
  });

  it('respecte l’ordre des colonnes fourni', () => {
    const csv = toCsv([{ a: 1, b: 2 }], ['b', 'a']);
    expect(csv.split('\n')[0]).toBe('﻿b;a');
  });
});
