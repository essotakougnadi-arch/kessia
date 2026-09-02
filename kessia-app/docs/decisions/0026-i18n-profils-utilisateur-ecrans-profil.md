# ADR 0026 — i18n : profils utilisateur + écrans profil secondaires (§38)

**Statut :** accepté · **Date :** 2026-08-31

## Contexte
Dernier lot i18n côté membre. Deux blocs restaient FR en dur :
1. **`lib/user/user-type.ts`** — les 5 profils MVP (label, hint, `firstSteps`,
   `aiPrompts`), affichés sur l'accueil (carte « Premiers pas »), l'assistant
   (questions suggérées) et le profil (badge + modale de choix de type).
2. **Les 5 écrans profil secondaires** : `/profile/{kyc, score, security,
   notifications, privacy}`.

## Décision
Même méthode. `fr.ts` + `en.ts`, `useT()` par composant.

### `user-type.ts` — surcouche par hook
`lib/user/user-type-i18n.ts` (nouveau) : `useUserTypeMeta()` renvoie
`{ get(type), mvpList, allList }` — chaque `UserTypeMeta` a ses `label` /
`hint` / `firstSteps[].label` / `aiPrompts[]` résolus via `userType.<KEY>.*`,
repli sur la valeur FR. `user-type.ts` reste FR (consommé par `registerSchema`,
`elevateRole`, la génération de notifications côté serveur).
Écrans basculés : `home-client`, `ai-client`, `profile-client`.

### Écrans câblés
- `kyc-client.tsx` — les 7 états (non démarré, en cours, action requise,
  rejeté, en revue, vérifié, expiré), les 3 zones d'upload, conseils photo,
  note de sécurité. `ID_TYPES` / `DOC_LABEL` remplacés par
  `kycPage.docType.*` + helper `docLabel(t, type)`.
- `score-client.tsx` — chrome (titres, disclaimer, « Mis à jour le »).
- `security-client.tsx` — mot de passe, 2FA (setup / backup / disable),
  sessions actives.
- `notifications-client.tsx` — `ITEMS` → clés `notifPrefs.items.*`.
- `privacy-client.tsx` — consentements, export RGPD, suppression de compte ;
  `fmtDate` local délègue à `formatDate()` (ADR 0023).

### Volontairement HORS périmètre
- **Prose calculée côté serveur** : `score.bandLabel` / `factors[].label` /
  `factors[].detail` / `advice[]` (source `lib/score/`), libellés de
  consentement (`consents[].label`) et contenu d'archive (`exportIncludes[]`)
  fournis par les hooks `useScore` / `usePrivacy`, motif de rejet KYC
  (`rejectionReason`, saisi par un agent), messages de toast des hooks.
- `user-type.ts` lui-même.
- Back-office `/admin/*`. Éwé.

## Conséquences
- ✅ **Plus aucun texte FR en dur dans un écran destiné au membre** (hors
  prose analytique générée côté serveur).
- ✅ `tsc` + `lint` (0 warning) + `vitest` (112, dont `catalogs.test.ts`) +
  `build` + `playwright` (36) + `db:seed` au vert. E2E : `navigation.spec` +
  `support-attachments` ont flaké sous charge (pooler) puis sont repassés au
  vert en isolation — pas une régression.
- ⏭️ Reste : le back-office `/admin/*`, et la prose analytique côté serveur
  (une i18n serveur), et l'éwé natif.
