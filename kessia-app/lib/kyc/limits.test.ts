import { describe, it, expect } from 'vitest';
import { tierFor, KYC_LIMITS } from './limits';

describe('tierFor', () => {
  it('non vérifié → palier 0', () => {
    expect(tierFor('NOT_STARTED', 0)).toBe(0);
    expect(tierFor('UNDER_REVIEW', 0)).toBe(0);
    expect(tierFor('ACTION_REQUIRED', 1)).toBe(0);
  });
  it('vérifié niveau 1 → palier 1', () => {
    expect(tierFor('VERIFIED', 1)).toBe(1);
    expect(tierFor('VERIFIED', 0)).toBe(1);
  });
  it('vérifié niveau 2 → palier 2', () => {
    expect(tierFor('VERIFIED', 2)).toBe(2);
  });
});

describe('KYC_LIMITS', () => {
  it('les plafonds croissent avec le niveau', () => {
    expect(KYC_LIMITS[0].perTransaction).toBeLessThan(KYC_LIMITS[1].perTransaction);
    expect(KYC_LIMITS[1].monthlyOutbound).toBeLessThan(KYC_LIMITS[2].monthlyOutbound);
  });
});
