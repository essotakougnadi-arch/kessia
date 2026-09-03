// ============================================================
// KESSIA — Mode démonstration
//
// Sur le déploiement public de démonstration, il n'y a pas de
// fournisseur SMS : les codes OTP ne partent nulle part. Ce mode
// les renvoie dans la réponse de l'API pour que l'inscription et la
// connexion par OTP restent testables en ligne.
//
// Garde-fou : n'est JAMAIS actif si un vrai fournisseur SMS est
// configuré (`SMS_PROVIDER` ≠ `DEV`). C'est un opt-in explicite,
// au même titre que `E2E_RATE_LIMIT_BYPASS` — jamais sur un
// déploiement réel avec de vrais utilisateurs.
// ============================================================

/** Le serveur peut-il exposer les codes OTP dans ses réponses ? */
export const DEMO_MODE =
  process.env.DEMO_MODE === '1' && (process.env.SMS_PROVIDER ?? 'DEV') === 'DEV';

let warned = false;

/**
 * Ajoute `demoOtp` à un objet de réponse quand le mode démo est actif.
 * Journalise un avertissement de sécurité au premier appel.
 */
export function withDemoOtp<T extends Record<string, unknown>>(payload: T, otp: string): T {
  if (!DEMO_MODE) return payload;
  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[KESSIA] DEMO_MODE actif — les codes OTP sont renvoyés dans les réponses API. ' +
        'Ne doit apparaître que sur un déploiement de démonstration.'
    );
  }
  return { ...payload, demoOtp: otp };
}
