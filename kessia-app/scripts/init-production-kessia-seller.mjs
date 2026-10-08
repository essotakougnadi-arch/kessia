#!/usr/bin/env node
// ============================================================
// KESSIA — Initialisation du compte vendeur officiel « KESSIA Shop »
// en base de PRODUCTION (chantier « vraies données métier »)
//
//   node scripts/init-production-kessia-seller.mjs
//
// Opération UNIQUE et DÉLIBÉRÉE, additive uniquement : crée le compte
// User + UserProfile + Wallet + Business du vendeur officiel KESSIA
// s'il n'existe pas encore. AUCUN deleteMany/update destructeur. Ne
// doit s'exécuter QUE via .github/workflows/init-production-data.yml
// (environment "production", approbation native GitHub) — jamais
// depuis un poste local avec les identifiants de production en main.
//
// Idempotent : si le compte existe déjà (par téléphone OU email),
// ce script ne fait rien et sort en succès (exit 0). Une incohérence
// (téléphone et email pointant vers deux comptes différents) est
// signalée et bloque l'exécution — jamais résolue automatiquement.
//
// Dry-run : si DRY_RUN=1, affiche l'aperçu complet de ce qui SERAIT
// créé et s'arrête avant toute écriture. Aucune transaction ouverte
// dans ce mode.
//
// Toutes les valeurs métier (prénom, nom, email, secteur, ville…)
// sont des décisions explicites validées avec l'utilisateur — aucune
// n'est inventée. Seul le mot de passe provient d'un secret GitHub
// d'environnement (PRODUCTION_KESSIA_SELLER_PASSWORD, jamais commité,
// jamais journalisé, jamais affiché dans l'aperçu).
// ============================================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { isProductionDatabaseUrl, redactUrl } from './guard-db-command.mjs';

// ---- Identité métier (modifiable ici si elle évolue — relecture/PR,
//      jamais un secret) -------------------------------------------
const SELLER_PHONE = '+22879329602';
const SELLER_FIRST_NAME = 'KESSIA';
const SELLER_LAST_NAME = 'Shop';
const SELLER_EMAIL = 'kessiaadministration@gmail.com';

const BUSINESS_NAME = 'KESSIA';
const BUSINESS_SECTOR = 'FinTech et Coopérative numérique';
const BUSINESS_DESCRIPTION =
  'Marketplace officiel de KESSIA : produits et services proposés directement par KESSIA.';
const BUSINESS_PHONE = '+22879329602';
const BUSINESS_CITY = 'Lomé';

const BCRYPT_ROUNDS = 12; // identique à app/api/v1/auth/register/route.ts

/**
 * Mirroir volontairement local de lib/utils/crypto.ts::normalizePhone —
 * ce script Node autonome (hors build Next.js) ne peut pas résoudre
 * l'alias de chemin `@/`. Logique strictement identique.
 */
function normalizePhone(phone, countryCode = '+228') {
  let normalized = phone.replace(/[\s\-()./]/g, '');
  if (normalized.startsWith('00')) normalized = '+' + normalized.slice(2);
  if (!normalized.startsWith('+')) normalized = countryCode + normalized;
  return normalized;
}

/** Masque un numéro/adresse pour l'affichage — jamais la valeur complète dans les logs. */
function maskIdentifier(value) {
  if (typeof value !== 'string' || value.length <= 4) return '***';
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function refuse(reason) {
  console.error(`::error::REFUS — ${reason}`);
  process.exit(1);
}

async function main() {
  // Garde d'exécution — ce script ne doit tourner que dans le
  // workflow dédié, jamais sur un poste local avec les identifiants
  // de production chargés dans l'environnement.
  if (process.env.GITHUB_ACTIONS !== 'true') {
    refuse(
      "ce script ne doit s'exécuter que via .github/workflows/init-production-data.yml (GitHub Actions), jamais localement."
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    refuse('DATABASE_URL est requis et absent de l\'environnement.');
  }
  if (!isProductionDatabaseUrl(databaseUrl)) {
    refuse(
      `la cible résolue (${redactUrl(databaseUrl)}) n'est pas reconnue comme la base de PRODUCTION — exécution refusée pour éviter une création dans le mauvais environnement.`
    );
  }

  const password = process.env.SELLER_PASSWORD;
  if (!password) {
    refuse('SELLER_PASSWORD est requis (secret PRODUCTION_KESSIA_SELLER_PASSWORD) et absent de l\'environnement.');
  }

  const dryRun = process.env.DRY_RUN === '1';
  const phone = normalizePhone(SELLER_PHONE);

  const prisma = new PrismaClient();
  try {
    const [existingByPhone, existingByEmail] = await Promise.all([
      prisma.user.findUnique({ where: { phone } }),
      prisma.user.findUnique({ where: { email: SELLER_EMAIL } }),
    ]);

    if (existingByPhone && existingByEmail && existingByPhone.id !== existingByEmail.id) {
      refuse(
        `incohérence détectée — le téléphone (${maskIdentifier(phone)}) et l'email (${maskIdentifier(SELLER_EMAIL)}) correspondent à deux comptes DIFFÉRENTS. Aucune résolution automatique : intervention humaine requise.`
      );
    }

    const existing = existingByPhone ?? existingByEmail;
    if (existing) {
      console.log(
        `OK — compte vendeur officiel déjà existant (id=${existing.id}). Idempotent : aucune action effectuée.`
      );
      return;
    }

    console.log('--- Aperçu de la création prévue ---');
    console.log(`User.phone              = ${maskIdentifier(phone)}`);
    console.log(`User.firstName          = ${SELLER_FIRST_NAME}`);
    console.log(`User.lastName           = ${SELLER_LAST_NAME}`);
    console.log(`User.email              = ${maskIdentifier(SELLER_EMAIL)}`);
    console.log('User.role               = USER (défaut schéma)');
    console.log('User.isPhoneVerified    = false (défaut schéma)');
    console.log('User.termsAcceptedAt    = null (défaut schéma)');
    console.log('User.kycStatus/kycLevel = NOT_STARTED / 0 (défauts schéma)');
    console.log('UserProfile.userType    = SME');
    console.log('Wallet.kind/balance     = USER / 0 (défauts schéma)');
    console.log(`Business.name           = ${BUSINESS_NAME}`);
    console.log(`Business.sector         = ${BUSINESS_SECTOR}`);
    console.log(`Business.description    = ${BUSINESS_DESCRIPTION}`);
    console.log(`Business.phone          = ${maskIdentifier(BUSINESS_PHONE)}`);
    console.log(`Business.city           = ${BUSINESS_CITY}`);
    console.log('Business.logo           = null');
    console.log('Business.status         = ACTIVE (défaut schéma)');
    console.log(`Mode                    = ${dryRun ? 'DRY-RUN (aucune écriture)' : 'ÉCRITURE RÉELLE'}`);

    if (dryRun) {
      console.log('DRY_RUN=1 — aperçu uniquement, aucune transaction ouverte, rien écrit.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { user, business } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          phone,
          firstName: SELLER_FIRST_NAME,
          lastName: SELLER_LAST_NAME,
          email: SELLER_EMAIL,
          passwordHash,
          // role, isPhoneVerified, isEmailVerified, kycStatus, kycLevel,
          // termsAcceptedVersion, termsAcceptedAt : aucune valeur
          // forcée — défauts du schéma, décision explicite (aucune
          // vérification/acceptation fictive).
        },
      });

      await tx.userProfile.create({
        data: {
          userId: createdUser.id,
          userType: 'SME',
          userTypeSetAt: new Date(),
        },
      });

      await tx.wallet.create({
        data: { userId: createdUser.id },
      });

      const createdBusiness = await tx.business.create({
        data: {
          userId: createdUser.id,
          name: BUSINESS_NAME,
          sector: BUSINESS_SECTOR,
          description: BUSINESS_DESCRIPTION,
          phone: BUSINESS_PHONE,
          city: BUSINESS_CITY,
        },
      });

      return { user: createdUser, business: createdBusiness };
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'admin.bootstrap.create_official_seller',
          entity: 'User',
          entityId: user.id,
          metadata: {
            businessId: business.id,
            businessName: BUSINESS_NAME,
            sector: BUSINESS_SECTOR,
            source: 'init-production-kessia-seller.mjs',
          },
        },
      });
    } catch (auditError) {
      // Même politique que lib/audit/audit.service.ts::recordAudit —
      // un échec d'audit ne doit jamais annuler l'opération métier
      // déjà commise (déjà en base à ce stade).
      console.error('Échec de l\'écriture d\'audit (non bloquant) :', auditError);
    }

    console.log(
      `OK — compte vendeur officiel créé (User.id=${user.id}, Business.id=${business.id}).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error('::error::Échec inattendu —', err);
    process.exit(1);
  });
}
