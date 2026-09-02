// ============================================================
// KESSIA — Anti-fraude : règles (cahier des charges §32)
//
// PUR et déterministe. À partir de signaux mesurés (appareil,
// vélocité, montants, ancienneté, comportement dans le temps),
// calcule un score de risque et la liste des signaux déclenchés.
// AUCUNE décision automatique de blocage : le score alimente une
// file d'alertes revue par un humain.
// ============================================================

export type FraudRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FraudSignal = {
  type: string;
  label: string;
  weight: number;
};

export type FraudInputs = {
  context: 'login' | 'transfer' | 'payment' | 'withdrawal';
  /** appareil jamais vu pour ce compte */
  newDevice: boolean;
  deviceTrusted: boolean;
  /** transferts sortants dans les 10 dernières minutes */
  outboundLast10min: number;
  /** transferts sortants dans la dernière heure */
  outboundLast1h: number;
  /** destinataires distincts dans les dernières 24 h */
  distinctRecipients24h: number;
  /** montant de l'opération en cours (0 pour un login) */
  amount: number;
  /** plus gros transfert sortant des 30 derniers jours */
  maxOutbound30d: number;
  /** solde avant l'opération */
  balanceBefore: number;
  /** jours depuis la dernière opération confirmée */
  daysSinceLastActivity: number;
  /** échecs de connexion consécutifs récents */
  recentFailedLogins: number;
  /** ancienneté du compte en jours */
  accountAgeDays: number;

  // ── Signaux comportementaux (dans le temps) ──
  /** heure locale de l'opération (0–23) */
  hourOfDay: number;
  /** montant reçu dans la dernière heure (0 si aucun crédit) */
  inboundLast1hAmount: number;
  /** 1ʳᵉ opération sortante vers ce destinataire */
  firstTransferToRecipient: boolean;
  /** transferts sortants des 24 h dont le montant frôle le plafond mensuel KYC */
  transfersNearLimit24h: number;
  /** nombre moyen de transferts sortants par jour (30 j) */
  avgDailyOutbound: number;
};

export type FraudAssessment = {
  score: number;
  riskLevel: FraudRiskLevel;
  signals: FraudSignal[];
  /** true si une alerte doit être créée (revue humaine) */
  alert: boolean;
};

function level(score: number): FraudRiskLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

export function assessFraud(i: FraudInputs): FraudAssessment {
  const signals: FraudSignal[] = [];
  const add = (type: string, label: string, weight: number) => signals.push({ type, label, weight });

  if (i.newDevice && !i.deviceTrusted) {
    add('new_device', 'Appareil jamais utilisé sur ce compte', i.context === 'login' ? 15 : 25);
  }

  if (i.context !== 'login') {
    if (i.outboundLast10min >= 3) {
      add('velocity', `${i.outboundLast10min} transferts en moins de 10 minutes`, 30);
    } else if (i.outboundLast10min === 2) {
      add('velocity', 'Deux transferts rapprochés', 12);
    }

    if (i.distinctRecipients24h >= 5) {
      add('fan_out', `${i.distinctRecipients24h} destinataires différents en 24 h`, 25);
    }

    if (i.amount > 0 && i.maxOutbound30d > 0 && i.amount >= i.maxOutbound30d * 3) {
      add('amount_anomaly', 'Montant très supérieur à l’habitude du compte', 25);
    }

    if (i.balanceBefore > 0 && i.amount >= i.balanceBefore * 0.9) {
      add('drain', 'Opération vidant la quasi-totalité du solde', 20);
    }

    if (i.daysSinceLastActivity >= 60 && i.amount > 0) {
      add('dormant', 'Compte dormant depuis 60 jours puis mouvement de fonds', 20);
    }

    if (i.accountAgeDays <= 3 && i.amount >= 100_000) {
      add('new_account_large', 'Compte très récent, opération importante', 20);
    }

    // ── Comportemental ──

    // Passe-passe : reçu puis renvoyé ~le même montant dans l'heure.
    if (
      i.inboundLast1hAmount > 0 &&
      i.amount > 0 &&
      Math.abs(i.amount - i.inboundLast1hAmount) <= i.inboundLast1hAmount * 0.15
    ) {
      add('pass_through', 'Fonds reçus puis renvoyés presque à l’identique dans l’heure', 30);
    }

    // Structuration (« smurfing ») : plusieurs opérations frôlant le plafond.
    if (i.transfersNearLimit24h >= 3) {
      add('structuring', `${i.transfersNearLimit24h} transferts frôlant le plafond en 24 h`, 30);
    } else if (i.transfersNearLimit24h === 2) {
      add('structuring', 'Deux transferts proches du plafond en 24 h', 12);
    }

    // Nouveau bénéficiaire + montant élevé : profil d'arnaque à l'ingénierie sociale.
    if (
      i.firstTransferToRecipient &&
      i.amount > 0 &&
      ((i.balanceBefore > 0 && i.amount >= i.balanceBefore * 0.5) ||
        (i.maxOutbound30d > 0 && i.amount >= i.maxOutbound30d * 2))
    ) {
      add('new_recipient_high_value', 'Premier envoi vers ce bénéficiaire, montant élevé', 22);
    }

    // Accélération : bien plus de transferts dans l'heure que la moyenne quotidienne.
    if (i.avgDailyOutbound >= 0.5 && i.outboundLast1h >= Math.max(3, i.avgDailyOutbound * 2)) {
      add('velocity_accel', 'Rythme de transferts très supérieur à l’habitude du compte', 18);
    }

    // Heure creuse (1 h – 5 h) combinée à un montant non négligeable.
    if (i.hourOfDay >= 1 && i.hourOfDay <= 5 && i.amount >= 50_000) {
      add('odd_hour', 'Opération importante en pleine nuit', 12);
    }
  }

  if (i.recentFailedLogins >= 5) {
    add('failed_logins', `${i.recentFailedLogins} échecs de connexion récents`, 20);
  }

  const score = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));
  const riskLevel = level(score);
  return { score, riskLevel, signals, alert: score >= 30 };
}
