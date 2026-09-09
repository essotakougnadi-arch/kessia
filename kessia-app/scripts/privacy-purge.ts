// ============================================================
// KESSIA — Purge de rétention (RGPD art. 5-1-e, matrice §9)
//
//   npm run privacy:purge
//
// Exécute la même purge que le tick horaire (`runRetentionPurge`) :
// OTP, sessions expirées, notifications lues anciennes, journal
// d'audit au-delà de 5 ans. À planifier via cron si le tick
// applicatif n'est pas actif. N'effACE PAS de compte — voir
// `lib/privacy/erasure.ts` pour l'effacement encadré d'un compte.
// ============================================================

import { runRetentionPurge, RETENTION_DAYS } from '../lib/privacy/retention';
import prisma from '../lib/db/prisma';

async function main() {
  console.log('KESSIA — purge de rétention');
  console.log('Fenêtres (jours) :', RETENTION_DAYS);
  const started = Date.now();
  const result = await runRetentionPurge();
  console.log('Résultat :', result);
  console.log(`Terminé en ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main()
  .catch((e) => {
    console.error('Échec de la purge :', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
