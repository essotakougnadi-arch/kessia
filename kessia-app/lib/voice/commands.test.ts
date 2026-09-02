import { describe, it, expect } from 'vitest';
import { matchVoiceCommand } from './commands';

describe('matchVoiceCommand', () => {
  it('reconnaît un ordre de navigation explicite', () => {
    expect(matchVoiceCommand('va au wallet')?.href).toBe('/wallet');
    expect(matchVoiceCommand('ouvre mes tontines')?.href).toBe('/tontine');
    expect(matchVoiceCommand('montre mon agenda')?.href).toBe('/calendar');
  });

  it('reconnaît une phrase courte sans verbe', () => {
    expect(matchVoiceCommand('mon score')?.href).toBe('/profile/score');
    expect(matchVoiceCommand('simulateurs')?.href).toBe('/simulator');
  });

  it('ignore une vraie question (pas de navigation)', () => {
    expect(matchVoiceCommand('comment fonctionne une tontine de croissance exactement')).toBeNull();
    expect(matchVoiceCommand('est-ce que je peux retirer de l argent le week-end')).toBeNull();
  });

  it('gère les actions paramétrées', () => {
    expect(matchVoiceCommand('recharger mon wallet')?.href).toBe('/wallet?action=deposit');
  });

  it('retourne null sur une phrase vide ou inconnue', () => {
    expect(matchVoiceCommand('')).toBeNull();
    expect(matchVoiceCommand('bonjour comment ça va')).toBeNull();
  });

  it('comprend l’anglais', () => {
    expect(matchVoiceCommand('open my wallet')?.href).toBe('/wallet');
    expect(matchVoiceCommand('go to my tontines')?.href).toBe('/tontine');
    expect(matchVoiceCommand('show me the growth plan')?.href).toBe('/growth');
  });

  it('reconnaît le retour arrière', () => {
    expect(matchVoiceCommand('retour')?.href).toBe('back');
    expect(matchVoiceCommand('go back')?.href).toBe('back');
    expect(matchVoiceCommand('reviens en arrière')?.href).toBe('back');
  });

  it('gère les nouvelles destinations', () => {
    expect(matchVoiceCommand('créer une tontine')?.href).toBe('/tontine?create=1');
    expect(matchVoiceCommand('ouvre le fonds de garantie')?.href).toBe('/tontine/garantie');
    expect(matchVoiceCommand('parler à l’assistant')?.href).toBe('/ai');
  });
});
