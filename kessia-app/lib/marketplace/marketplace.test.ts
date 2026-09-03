import { describe, it, expect } from 'vitest';
import { installmentAmount, describeBuyability } from './marketplace';

describe('installmentAmount', () => {
  it('prix ÷ versements, arrondi, plancher 1', () => {
    expect(installmentAmount(180_000, 6)).toBe(30_000);
    expect(installmentAmount(100_000, 3)).toBe(33_333);
    expect(installmentAmount(10, 20)).toBe(1);
  });
  it('0 pour des entrées invalides', () => {
    expect(installmentAmount(0, 6)).toBe(0);
    expect(installmentAmount(1000, 1)).toBe(0);
  });
});

describe('describeBuyability', () => {
  const base = {
    status: 'ACTIVE' as const,
    stock: 3,
    isSeller: false,
    payableByTontine: true,
    price: 50_000,
  };

  it('OK pour un achat wallet avec solde suffisant', () => {
    expect(describeBuyability({ ...base, mode: 'WALLET', buyerBalance: 60_000 })).toEqual({ code: 'OK', ok: true });
  });
  it('refuse le vendeur, le stock nul, l’article archivé', () => {
    expect(describeBuyability({ ...base, mode: 'WALLET', isSeller: true }).code).toBe('IS_SELLER');
    expect(describeBuyability({ ...base, mode: 'WALLET', stock: 0 }).code).toBe('OUT_OF_STOCK');
    expect(describeBuyability({ ...base, mode: 'WALLET', status: 'ARCHIVED' }).code).toBe('NOT_ACTIVE');
  });
  it('refuse la tontine si l’article ne l’autorise pas', () => {
    expect(describeBuyability({ ...base, mode: 'TONTINE', payableByTontine: false }).code).toBe('TONTINE_NOT_ALLOWED');
  });
  it('refuse le wallet si solde insuffisant', () => {
    expect(describeBuyability({ ...base, mode: 'WALLET', buyerBalance: 10_000 }).code).toBe('INSUFFICIENT_BALANCE');
  });
  it('autorise la tontine sans regarder le solde', () => {
    expect(describeBuyability({ ...base, mode: 'TONTINE' }).ok).toBe(true);
  });
});
