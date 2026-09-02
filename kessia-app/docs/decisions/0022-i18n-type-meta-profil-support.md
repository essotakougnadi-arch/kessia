# ADR 0022 — i18n : métadonnées de type de tontine, profil, support (§38)

**Statut :** accepté · **Date :** 2026-08-30

## Contexte
ADR 0020 (authentification + navigation) et ADR 0021 (accueil, wallet, liste
des tontines) ont posé le socle i18n. Restait le point explicitement laissé
« hors périmètre » par ADR 0021 : **`lib/tontine/type-meta.ts`**, consommé par
une demi-douzaine d'écrans, plus deux écrans très visités encore intégralement
en français — **profil** et **support** (y compris les pièces jointes de
ticket ajoutées par ADR 0018).

## Décision
Même méthode : `fr.ts` source de vérité + `en.ts` miroir, `useT()` câblé dans
chaque composant client (sous-composants de formulaire compris).

### `type-meta.ts` — surcouche par hook, source FR intacte
`lib/tontine/type-meta.ts` reste en français : il est **aussi consommé côté
serveur** par l'orchestrateur de tontines (libellés des notifications). On
ajoute donc un module client `lib/tontine/type-meta-i18n.ts` :

- `useTontineTypeMeta()` → `(type) => TontineTypeMeta` dont `label`, `tagline`,
  `description` et `howItWorks[]` sont résolus via `tontineType.<KEY>.*`, avec
  la valeur FR de `type-meta.ts` en repli.
- `useTontineTypeList()` → les 4 métadonnées localisées, pour les sélecteurs.

Écrans basculés sur ces hooks : `tontine-client.tsx` (liste + section « les 4
types » + `CreateTontineForm`), `tontine/[id]/tontine-detail-client.tsx`.

### Écrans câblés
- `profile-client.tsx` — badges, carte KESSIA Score (`score.*` + notation
  dérivée en clés), bannière KYC avec interpolation
  (`profile.kycTitle` `{status}`, `profile.kycVerifiedSub` `{level}`,
  `profile.docsSubmitted` `{count}`), statistiques, bannière IA
  (`profile.aiGreeting` `{name}`), menu (`profile.menu.*`), modales de choix
  de type de compte et de thème (`profile.theme.*`). Les constantes
  `KYC_LABEL` / `THEME_LABEL` sont supprimées au profit de `t()`.
- `support-client.tsx` — en-tête, canaux de contact, ouverture de ticket,
  liste des tickets (`support.status.*`, `support.cat.*`), FAQ
  (`support.faqItems.q1..q5`), `CreateTicketForm` (catégories, sujet,
  description, erreurs de validation, boutons) et `TicketThread` (métadonnées,
  états vides, ticket fermé, champ de réponse).
- `components/support/TicketAttachments.tsx` — titre, états de chargement /
  vide, bouton joindre, case « interne », indice de format, action
  « retirer » (`support.attachments.*`, `removeAria` avec `{name}`).

### Ajouts au catalogue (`fr.ts` + `en.ts`)
- `tontineType.{CLASSIC_ROTATING,PROJECT,GROWTH,PURCHASE}` : `label`,
  `tagline`, `description`, `step1..step4`.
- `kyc.status.*` (7 états) — partagé profil + parcours KYC.
- Bloc `profile` (≈ 40 clés, dont `score.*`, `menu.*`, `theme.*`).
- Bloc `support` étoffé (≈ 55 clés, dont `status`, `cat`, `faqItems`,
  `attachments`).

### Volontairement HORS périmètre
- `lib/tontine/type-meta.ts` lui-même (inchangé — repli FR + usage serveur).
- `lib/user/user-type.ts` (`userTypeMeta().label`) — reste FR, traité avec
  business / explorer.
- Le reste des écrans profil secondaires (`/profile/kyc`, `/profile/score`,
  `/profile/security`…) et l'écran admin support — passe ultérieure.
- Sorties des utilitaires de formatage (`formatRelativeDate`,
  `describeTransaction`) — toujours FR, traitées globalement plus tard.
- Éwé : `tontineType`, `profile`, `support` retombent en FR ; le vocabulaire
  financier / KYC doit être relu par un locuteur natif avant d'être publié.

## Conséquences
- ✅ Profil, support et les métadonnées des 4 types de tontines s'affichent
  entièrement en anglais.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (109, dont `catalogs.test.ts`) +
  `build` + `playwright` (36) + `db:seed` au vert. E2E inchangés (locale par
  défaut `fr`).
- ⏭️ Suite : business / explorer / growth / simulator / trust / admin, écrans
  profil secondaires, landing, puis utilitaires de formatage et relecture
  native de l'éwé.
