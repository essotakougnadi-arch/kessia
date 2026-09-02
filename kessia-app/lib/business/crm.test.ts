import { describe, it, expect } from 'vitest';
import { customerSegment } from './crm';

const DAY = 86_400_000;
const now = new Date('2026-06-01T00:00:00Z');

describe('customerSegment', () => {
  it('classe un PROSPECT déclaré', () => {
    expect(customerSegment({ type: 'PROSPECT', orderCount: 3, lastOrderAt: new Date(now.getTime() - DAY), now })).toBe('PROSPECT');
  });

  it('classe un client sans commande en PROSPECT', () => {
    expect(customerSegment({ type: 'CLIENT', orderCount: 0, lastOrderAt: null, now })).toBe('PROSPECT');
  });

  it('classe un client inactif au-delà de 90 jours', () => {
    expect(customerSegment({ type: 'CLIENT', orderCount: 4, lastOrderAt: new Date(now.getTime() - 100 * DAY), now })).toBe('INACTIF');
  });

  it('classe un client fidèle (>= 5 commandes)', () => {
    expect(customerSegment({ type: 'CLIENT', orderCount: 6, lastOrderAt: new Date(now.getTime() - 5 * DAY), now })).toBe('FIDELE');
  });

  it('classe un client régulier (>= 2 commandes)', () => {
    expect(customerSegment({ type: 'CLIENT', orderCount: 2, lastOrderAt: new Date(now.getTime() - 5 * DAY), now })).toBe('REGULIER');
  });

  it('classe un nouveau client (1 commande récente)', () => {
    expect(customerSegment({ type: 'CLIENT', orderCount: 1, lastOrderAt: new Date(now.getTime() - 5 * DAY), now })).toBe('NOUVEAU');
  });
});
