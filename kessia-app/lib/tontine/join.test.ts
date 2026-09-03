import { describe, it, expect } from 'vitest';
import { describeJoinability } from './join';

const base = {
  isPublic: true,
  status: 'PENDING' as const,
  memberCount: 2,
  maxMembers: 6,
  isCreator: false,
};

describe('describeJoinability', () => {
  it('autorise une demande sur une tontine publique ouverte non pleine', () => {
    expect(describeJoinability(base)).toEqual({ code: 'CAN_REQUEST', canRequest: true });
  });

  it('bloque le créateur', () => {
    expect(describeJoinability({ ...base, isCreator: true }).canRequest).toBe(false);
  });

  it('bloque un membre actif ou déjà approuvé', () => {
    expect(describeJoinability({ ...base, memberStatus: 'ACTIVE' }).code).toBe('ALREADY_MEMBER');
    expect(describeJoinability({ ...base, requestStatus: 'APPROVED' }).code).toBe('REQUEST_APPROVED');
  });

  it('bloque une demande déjà en attente', () => {
    expect(describeJoinability({ ...base, requestStatus: 'PENDING' })).toEqual({
      code: 'REQUEST_PENDING',
      canRequest: false,
    });
  });

  it('autorise une nouvelle demande après un refus', () => {
    expect(describeJoinability({ ...base, requestStatus: 'REJECTED' }).canRequest).toBe(true);
  });

  it('bloque un ancien membre retiré', () => {
    expect(describeJoinability({ ...base, memberStatus: 'REMOVED' }).code).toBe('REMOVED');
  });

  it('bloque si privée, déjà démarrée ou pleine', () => {
    expect(describeJoinability({ ...base, isPublic: false }).code).toBe('NOT_PUBLIC');
    expect(describeJoinability({ ...base, status: 'ACTIVE' }).code).toBe('NOT_OPEN');
    expect(describeJoinability({ ...base, memberCount: 6 }).code).toBe('FULL');
  });
});
