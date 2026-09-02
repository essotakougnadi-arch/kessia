import { describe, it, expect } from 'vitest';
import { resolveProvider, listProviders } from './index';

describe('resolveProvider', () => {
  it('Mobile Money → provider Mobile Money simulé', () => {
    const p = resolveProvider('MOBILE_MONEY', 'INBOUND');
    expect(p?.name).toBe('simulated-mobile-money');
    expect(p?.simulated).toBe(true);
  });

  it('Bank → provider bancaire', () => {
    expect(resolveProvider('BANK_TRANSFER', 'OUTBOUND')?.name).toBe('simulated-bank');
  });

  it('QR interne n\'est pas marqué simulé', () => {
    expect(resolveProvider('QR', 'INBOUND')?.simulated).toBe(false);
  });

  it('CARD → aucun provider pour le MVP', () => {
    expect(resolveProvider('CARD', 'INBOUND')).toBeNull();
  });
});

describe('providers simulés → process()', () => {
  it('Mobile Money renvoie COMPLETED avec une référence', async () => {
    const p = resolveProvider('MOBILE_MONEY', 'INBOUND')!;
    const out = await p.process({
      userId: 'u', amount: 1000, currency: 'XOF', direction: 'INBOUND', method: 'MOBILE_MONEY',
    });
    expect(out.status).toBe('COMPLETED');
    expect(out.simulated).toBe(true);
    expect(out.externalRef).toMatch(/^MM-/);
  });

  it('Virement bancaire entrant → PENDING (attente compensation)', async () => {
    const p = resolveProvider('BANK_TRANSFER', 'INBOUND')!;
    const out = await p.process({
      userId: 'u', amount: 1000, currency: 'XOF', direction: 'INBOUND', method: 'BANK_TRANSFER',
    });
    expect(out.status).toBe('PENDING');
  });
});

describe('listProviders', () => {
  it('expose les 4 providers du MVP', () => {
    const names = listProviders().map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(['simulated-mobile-money', 'simulated-bank', 'cash-receipt', 'kessia-qr'])
    );
  });
});
