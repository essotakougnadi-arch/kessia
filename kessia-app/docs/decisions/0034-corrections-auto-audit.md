# ADR 0034 — Corrections de l'auto-audit (PDF, i18n §38, KPI, sécurité)

**Statut :** accepté · **Date :** 2026-09-01

## Contexte
Auto-audit du travail des ADR 0031→0033 : note 16/20. Quatre faiblesses
précises identifiées, toutes corrigées ici.

## Décision

### 1 — Le PDF est maintenant validé par un vrai lecteur

Le générateur `lib/pdf/mini-pdf.ts` n'avait jamais été ouvert par un
lecteur PDF réel — seulement des assertions `contains` sur le texte.

- **Ajout `pdf-lib` en `devDependency`** (test uniquement — aucune
  dépendance runtime, le générateur reste sans dépendance).
- `mini-pdf.test.ts` gagne un bloc **« intégrité binaire »** (7 tests) :
  chaque offset de la table `xref` pointe bien sur `N 0 obj` ; `trailer
  /Size` == nombre d'entrées xref ; l'objet 1 est le `/Catalog` et
  référence `/Pages 2 0 R` ; le `/Length` déclaré de **chaque** flux de
  contenu == taille réelle des octets ; `/Count` de l'objet `Pages` ==
  nombre réel d'objets `Page` ; **`pdf-lib` charge, lit la pagination et
  les dimensions A4, puis re-sérialise** la facture, le reçu et un
  document multi-pages sans erreur (le `save()` reconstruit tout le
  graphe d'objets → échoue sur un xref ou un flux corrompu).
- Vérifié hors CI : `pdf-lib` ouvre `facture-demo.pdf` (3,8 ko, 1 page,
  595,3 × 841,9 pt) et `recu-demo.pdf` (2,3 ko) — dimensions A4 exactes,
  re-sérialisation OK.

### 2 — §38 : les deux derniers écrans traduits, la revendication tient

`tontine-detail-client.tsx` et `calendar-client.tsx` (+ la vue serveur
`lib/calendar/aggregate.ts`) contenaient encore ~65 chaînes FR en dur
alors que « §38 = 🟢 » était affirmé partout.

- Nouveaux blocs de catalogue **`tontineDetail.*`** (~55 clés),
  **`calendar.*`** (~15 clés) et **`srvCalendar.*`** (4 clés, titres
  d'événements côté serveur) — FR source + EN.
- Les trois fichiers passent par `useT()` / `serverT()`. `aggregate.ts`
  localise les titres « Cotisation — … / Facture … / Relancer … » via
  `serverT()` (cookie `kessia-locale`).
- `catalogs.test.ts` (en/ee ⊆ fr, pas de valeur vide) reste vert.
- **§38 reste donc 🟢** : espace membre + back-office + prose serveur
  FR/EN, sans chaîne en dur connue. Hors périmètre inchangé : `/legal/*`
  (après validation juridique FR) et la relecture native éwé.

### 3 — Les KPI §54 ont une couverture automatisée

Nouveau `test/integration/platform.itest.ts` (2 tests, base réelle) :

- **Contrat de forme + invariants** : toutes les clés présentes et bien
  typées ; pourcentages ∈ [0, 100] ; `last7d ≤ last30d`,
  `active7d ≤ active30d`, `verified ≤ total`, `activated ≤ total` ;
  `Σ kycFunnel == total`, `Σ byStatus == total tontines` ;
  `netInflow == dépôts − retraits` ; `answerMix` somme à 0 ou ≈ 100 ;
  `timeseries` = exactement 30 buckets jour ordonnés, non négatifs.
- **Réactivité** : créer un utilisateur puis une écriture `DEPOSIT`
  `COMPLETED` fait bouger `users.total` **et** `users.activated` de
  +1 chacun, et `wallet.totalHeld` / `finance.depositVolume30d` du
  montant exact.

### 4 — Deux décisions de sécurité tracées pour revue externe

`docs/security/overview.md` gagne une section **« Décisions à valider par
une revue sécurité externe »** :

- **Repli cookie GET-only de `withAuth`** (ADR 0032) : pourquoi
  (téléchargement PDF par lien), périmètre du risque (strictement `GET`,
  pas de surface CSRF en écriture), points à challenger (exfiltration par
  balise, `SameSite`, cookie de téléchargement dédié `Strict`).
- **`SELECT … FOR UPDATE` global sur le ledger** (ADR 0031) : pourquoi
  (TOCTOU / double débit), impact (sérialisation par wallet),
  points à challenger (contention sur wallets « chauds », interblocage si
  un futur chemin verrouille hors ordre trié, `maxWait`). **Bloquant
  pilote** : test de charge + métriques `pg_locks` sur l'APM.

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**143**, +8 PDF) + `build` +
  **29 tests d'intégration** (dont `platform` ; escrow rejoué après une
  coupure passagère du pooler) + **38 E2E** + `db:seed` au vert.
- ✅ La revendication « §38 = 🟢 » est désormais exacte.
- ✅ Le générateur PDF a un filet de sécurité contre les régressions de
  structure (xref / offsets / longueurs de flux).
- ⏳ Les deux mécanismes sécurité restent **à confirmer par un audit
  tiers** avant le pilote — c'est écrit noir sur blanc dans la doc.
