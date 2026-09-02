import { describe, it, expect } from 'vitest';
import { assessFraud, type FraudInputs } from './rules';

const base: FraudInputs = {
  context: 'transfer',
  newDevice: false,
  deviceTrusted: true,
  outboundLast10min: 0,
  outboundLast1h: 0,
  distinctRecipients24h: 1,
  amount: 10_000,
  maxOutbound30d: 50_000,
  balanceBefore: 200_000,
  daysSinceLastActivity: 2,
  recentFailedLogins: 0,
  accountAgeDays: 200,
  hourOfDay: 14,
  inboundLast1hAmount: 0,
  firstTransferToRecipient: false,
  transfersNearLimit24h: 0,
  avgDailyOutbound: 1,
};

describe('assessFraud', () => {
  it('un transfert habituel ne déclenche pas d’alerte', () => {
    const r = assessFraud(base);
    expect(r.alert).toBe(false);
    expect(r.riskLevel).toBe('LOW');
  });

  it('vélocité + nouvel appareil → alerte', () => {
    const r = assessFraud({ ...base, newDevice: true, deviceTrusted: false, outboundLast10min: 3 });
    expect(r.alert).toBe(true);
    expect(r.signals.map((s) => s.type)).toEqual(expect.arrayContaining(['new_device', 'velocity']));
  });

  it('montant très supérieur à l’habitude + quasi-vidage → risque élevé', () => {
    const r = assessFraud({ ...base, amount: 190_000, maxOutbound30d: 50_000, balanceBefore: 200_000 });
    expect(r.signals.map((s) => s.type)).toEqual(expect.arrayContaining(['amount_anomaly', 'drain']));
    expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(r.riskLevel);
  });

  it('compte dormant qui bouge soudain', () => {
    const r = assessFraud({ ...base, daysSinceLastActivity: 90 });
    expect(r.signals.some((s) => s.type === 'dormant')).toBe(true);
  });

  it('login : seuls les signaux appareil et échecs de connexion comptent', () => {
    const r = assessFraud({ ...base, context: 'login', amount: 0, outboundLast10min: 9, recentFailedLogins: 6, newDevice: true, deviceTrusted: false });
    const types = r.signals.map((s) => s.type);
    expect(types).toContain('failed_logins');
    expect(types).toContain('new_device');
    expect(types).not.toContain('velocity');
  });

  it('le score est borné à 100', () => {
    const r = assessFraud({
      ...base, newDevice: true, deviceTrusted: false, outboundLast10min: 5, distinctRecipients24h: 8,
      amount: 500_000, maxOutbound30d: 10_000, balanceBefore: 500_000, daysSinceLastActivity: 120,
      accountAgeDays: 1, recentFailedLogins: 8,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.riskLevel).toBe('CRITICAL');
  });

  it('passe-passe : fonds reçus puis renvoyés à l’identique dans l’heure', () => {
    const r = assessFraud({ ...base, amount: 80_000, inboundLast1hAmount: 82_000 });
    expect(r.signals.some((s) => s.type === 'pass_through')).toBe(true);
  });

  it('structuration : plusieurs transferts frôlant le plafond en 24 h', () => {
    const r = assessFraud({ ...base, transfersNearLimit24h: 3 });
    expect(r.signals.some((s) => s.type === 'structuring')).toBe(true);
    expect(r.alert).toBe(true);
  });

  it('nouveau bénéficiaire + montant élevé → signal ciblé', () => {
    const r = assessFraud({ ...base, firstTransferToRecipient: true, amount: 150_000, balanceBefore: 200_000 });
    expect(r.signals.some((s) => s.type === 'new_recipient_high_value')).toBe(true);
  });

  it('accélération : bien plus de transferts que l’habitude du compte', () => {
    const r = assessFraud({ ...base, avgDailyOutbound: 1, outboundLast1h: 4 });
    expect(r.signals.some((s) => s.type === 'velocity_accel')).toBe(true);
  });

  it('heure creuse : opération importante en pleine nuit', () => {
    const r = assessFraud({ ...base, hourOfDay: 3, amount: 120_000 });
    expect(r.signals.some((s) => s.type === 'odd_hour')).toBe(true);
  });
});
