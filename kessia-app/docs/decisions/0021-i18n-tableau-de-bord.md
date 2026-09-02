# ADR 0021 — i18n : accueil, wallet, tontines (§38)

**Statut :** accepté · **Date :** 2026-08-30

## Contexte
ADR 0020 a traduit le parcours d'authentification et la navigation. Suite
directe : les trois écrans du tableau de bord les plus consultés — **accueil,
wallet, liste des tontines**.

## Décision
Même méthode qu'ADR 0020 : chaînes dans `fr.ts` (source de vérité) + `en.ts`,
`useT()` câblé dans chaque composant client (y compris les sous-composants de
formulaire, qui appellent leur propre `useT()`).

### Écrans câblés
- `home-client.tsx` — en-tête, carte de solde, sections (Pour vous, Premiers
  pas, Services rapides, Score, Plan de croissance, Opportunités, Mes
  Tontines, Activités récentes), grille de services, cartes tontine, états
  vides. La grille `SERVICES` passe d'un `label` littéral à une `labelKey`
  résolue au rendu.
- `wallet-client.tsx` — en-tête, carte de solde + stats, actions rapides,
  historique + filtres, les 4 modales (dépôt, transfert, réception, retrait)
  et leurs sous-composants (`DepositForm`, `ReceivePanel`, `TransferForm`) :
  labels, placeholders, messages d'erreur, boutons, texte de partage.
- `tontine-client.tsx` — en-tête, résumé, alerte « mon tour », liste, cartes
  Créer / Rejoindre, section « les 4 types », modales et formulaires
  (`JoinTontineForm`, `CreateTontineForm`) : labels, erreurs de validation,
  boutons, textes d'aide (rotating / project / growth).

### Ajouts au catalogue
- Bloc `freq` partagé (`WEEKLY` / `BIWEEKLY` / `MONTHLY`) — remplace
  `TONTINE_FREQ_LABELS` de `lib/utils/format` dans ces écrans.
- Blocs `home`, `wallet`, `tontine` étoffés (≈ 130 clés au total).
- Collisions de portée réglées : les `.map((t) => …)` sur des tontines /
  transactions sont renommés (`tn`, `tx`) pour ne pas masquer la fonction
  `t` de `useT()`.

### Volontairement HORS périmètre
- **`lib/tontine/type-meta.ts`** (label, tagline, description, `howItWorks`
  des 4 types) reste en français : ce catalogue est consommé par ~6 écrans
  (home, tontine, tontine/[id], contrat, garantie…) et mérite sa propre passe.
- Les sorties des utilitaires de formatage (`describeTransaction`,
  `formatRelativeDate` → « il y a 2 h ») restent en français — elles
  concernent tous les écrans et seront traitées ensemble.

## Conséquences
- ✅ Accueil, wallet et liste des tontines s'affichent entièrement en anglais
  (hors métadonnées de type de tontine et libellés d'utilitaires).
- ✅ `tsc` + `lint` (0 warning) + `vitest` (109, dont `catalogs.test.ts`) +
  `build` + `playwright` (36) au vert. E2E inchangés (locale par défaut `fr`).
- ⏭️ Suite : `type-meta.ts`, puis business / KYC / profil / support / trust /
  growth / simulator / admin, puis la landing ; enfin les utilitaires de
  formatage et la relecture native de l'éwé.
