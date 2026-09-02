import { describe, it, expect } from 'vitest';
import { buildAgreementTerms } from './agreement';

const members = [
  { userId: 'u1', orderPosition: 1, joinedAt: new Date('2026-01-01'), user: { firstName: 'Kossi', lastName: 'A' } },
  { userId: 'u2', orderPosition: 2, joinedAt: new Date('2026-01-02'), user: { firstName: 'Ama', lastName: 'D' } },
  { userId: 'u3', orderPosition: 3, joinedAt: new Date('2026-01-03'), user: { firstName: 'Sena', lastName: 'L' } },
];

function base(type: 'CLASSIC_ROTATING' | 'PROJECT' | 'GROWTH' | 'PURCHASE', totalRounds: number) {
  return {
    id: 't1', name: 'Groupe Test', description: null, type,
    amount: 25_000, currency: 'XOF', frequency: 'MONTHLY' as const,
    startDate: new Date('2026-02-01'), totalRounds, rules: null,
  };
}

describe('buildAgreementTerms', () => {
  it('tontine tournante : un bénéficiaire par tour, dans l’ordre', () => {
    const t = buildAgreementTerms(base('CLASSIC_ROTATING', 3), members, new Date('2026-01-15'));
    expect(t.tontine.distribution).toBe('rotating');
    expect(t.finance.potPerRound).toBe(75_000);
    expect(t.calendar.rounds).toHaveLength(3);
    expect(t.calendar.rounds[0].beneficiary).toBe('Kossi A');
    expect(t.calendar.rounds[2].beneficiary).toBe('Sena L');
  });

  it('tontine projet : une collecte, versée à l’organisateur', () => {
    const t = buildAgreementTerms(base('PROJECT', 1), members, new Date('2026-01-15'));
    expect(t.tontine.distribution).toBe('project');
    expect(t.calendar.rounds).toHaveLength(1);
    expect(t.calendar.rounds[0].beneficiary).toContain('organisateur');
  });

  it('tontine croissance : restitution en fin de cycle, engagement total = mise × tours', () => {
    const t = buildAgreementTerms(base('GROWTH', 3), members, new Date('2026-01-15'));
    expect(t.tontine.distribution).toBe('growth');
    expect(t.finance.engagementTotal).toBe(75_000);
    expect(t.rules.distribution).toContain('bloquée');
  });

  it('le contrat liste tous les membres avec leur position', () => {
    const t = buildAgreementTerms(base('PURCHASE', 3), members);
    expect(t.members.map((m) => m.position)).toEqual([1, 2, 3]);
    expect(t.members[0].name).toBe('Kossi A');
  });

  it('achat individuel : distribution solo, aucun versement pendant le plan, déblocage en fin', () => {
    const solo = [members[0]];
    const t = buildAgreementTerms(
      { ...base('PURCHASE', 6), purchaseMode: 'SOLO' as const, purchaseItem: 'Presse à jus', amount: 30_000 },
      solo,
      new Date('2026-01-15')
    );
    expect(t.tontine.distribution).toBe('solo');
    expect(t.calendar.rounds).toHaveLength(6);
    expect(t.calendar.rounds[0].beneficiary).toContain('Aucun versement');
    expect(t.calendar.rounds[5].beneficiary).toContain('déblocage');
    expect(t.rules.distribution).toContain('séquestre');
    expect(t.finance.engagementTotal).toBe(180_000);
  });

  it('les règles personnalisées sont reprises', () => {
    const t = buildAgreementTerms({ ...base('CLASSIC_ROTATING', 3), rules: 'Pénalité 5% par jour de retard.' }, members);
    expect(t.rules.retard).toBe('Pénalité 5% par jour de retard.');
    expect(t.rules.personnalisees).toBe('Pénalité 5% par jour de retard.');
  });
});
