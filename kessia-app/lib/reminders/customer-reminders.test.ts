import { describe, it, expect } from 'vitest';
import { isReminderDue } from './customer-reminders';

const now = new Date('2026-06-15T09:00:00Z');
const past = new Date('2026-06-14T09:00:00Z');
const future = new Date('2026-06-20T09:00:00Z');

describe('isReminderDue', () => {
  it('faux si aucune relance prévue', () => {
    expect(isReminderDue(null, null, now)).toBe(false);
  });
  it('faux si l’échéance est future', () => {
    expect(isReminderDue(future, null, now)).toBe(false);
  });
  it('vrai si échéance passée et jamais notifiée', () => {
    expect(isReminderDue(past, null, now)).toBe(true);
  });
  it('faux si déjà notifiée pour cette échéance', () => {
    expect(isReminderDue(past, new Date('2026-06-14T10:00:00Z'), now)).toBe(false);
  });
  it('vrai si une nouvelle échéance (postérieure à la dernière notif) est due', () => {
    // relance re-programmée puis re-échue
    expect(isReminderDue(new Date('2026-06-13T00:00:00Z'), new Date('2026-06-10T00:00:00Z'), now)).toBe(true);
  });
});
