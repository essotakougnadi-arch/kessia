---
title: "KESSIA — P0.5 : KYC / conformité / LAB-FT — Rapport de remédiation"
date: "21 septembre 2026"
---

# KESSIA — P0.5 : KYC / conformité / LAB-FT — Rapport de remédiation

**Base** : P0.4 validé (idempotence Marketplace, protection contre les
doubles opérations).
**Périmètre autorisé** (verbatim, résumé) : auditer le système KYC existant,
vérifier statuts/transitions, contrôles d'accès aux données sensibles,
traçabilité, mécanismes de vérification d'identité, classer chaque
fonctionnalité (réelle/partielle/simulée/manquante), auditer les contrôles
de risque/LAB-FT, vérifier profils/limites/blocages/réexamens, protection/
conservation/suppression des données KYC, feature flags des fonctions
réglementées, confirmer que les services sensibles restent désactivés,
tests sans fausse conformité. **Contraintes absolues** : ne pas inventer de
certification, ne pas prétendre qu'un KYC réel existe s'il est simulé, ne
pas activer de vrais paiements/services réglementés, ne pas toucher Ledger/
Wallet/Escrow/règles Payments/Tontines/KYC-capture-flow-lui-même, ne pas
toucher Marketplace sauf dépendance indispensable justifiée, ne pas
toucher P0.2/P0.3 sans justification, ne pas supprimer de risques
résiduels documentés, ne pas contourner les tests.

---

## 1. Méthode

Un document d'auto-évaluation existait déjà (`docs/compliance/matrix.md`,
daté 2026-09-09, antérieur à P0.0-P0.4). Plutôt que de le prendre pour
argent comptant, **chaque ligne de sa section §3 (KYC/LAB-FT) a été
vérifiée contre le code actuel** — c'est cette vérification, pas le
document préexistant, qui fonde la classification ci-dessous. Deux écarts
réels entre le document et le code ont été trouvés (§3, §4).

## 2. Classification — ce qui est réellement disponible

### ✅ RÉEL (fonctionnel, vérifié dans le code)

| Fonctionnalité | Preuve |
|---|---|
| Machine à états KYC (7 statuts) | `KycStatus` (schéma), transitions dans `app/api/v1/kyc/{route,documents/route}.ts` et `admin/kyc/[id]/route.ts` — toutes exercées par du code réel, pas de placeholder |
| Revue humaine obligatoire + motif de rejet | `PATCH /admin/kyc/[id]` — motif exploitable **vérifié côté serveur** (`if ((REJECTED\|ACTION_REQUIRED) && !reason) return badRequest(...)`), pas seulement dans l'UI |
| Contrôle d'accès aux données sensibles | `requireAdmin(request, COMPLIANCE_ROLES)` — `COMPLIANCE_ROLES = [SUPER_ADMIN, ADMIN, COMPLIANCE]`, distinct de `ALL_ADMIN_ROLES` (SUPPORT/MODERATOR/etc. n'y ont pas accès). `fileUrl` jamais renvoyé par `GET /kyc` (statut général), jamais journalisé en clair dans l'audit |
| Traçabilité / audit | `audit_logs` : `kyc.case_opened`, `kyc.submit_document`, `kyc.review_*` — vérifié présent sur chaque transition serveur |
| Plafonds par palier KYC (0/1/2) | `lib/kyc/limits.ts::checkOutboundLimit` — appelé et vérifié dans `wallet/transfer`, `payments`, **et désormais `marketplace/[id]/order`** (voir §4) |
| Protection RGPD des données KYC | `eraseUserData` supprime les pièces (bucket + lignes) mais **conserve le dossier** (statut/décision/dates) comme preuve LAB-FT — vérifié dans `lib/privacy/erasure.ts` |
| Rétention | `lib/privacy/retention.ts` : confirmé, les dossiers KYC ne sont **jamais** purgés automatiquement (commentaire explicite + logique vérifiée) |
| Feature flags des fonctions réglementées | `lib/modules/catalog.ts` : Invest, Insurance, Loans toujours `status: 'REGULATED'` (non `LIVE`) — vérifié inchangé. Fonds de Garantie Solidaire : bandeau « Mode démonstration » visible utilisateur + `simulated: true` dans le code, aucun mouvement de fonds réel |

### ⚠️ SIMULÉ / STUB — deux écarts trouvés entre la doc et le code

| Fonctionnalité | Constat précis |
|---|---|
| **Screening sanctions / PPE** | `lib/kyc/screening.ts::screenName` est non seulement un stub local (`DEMO_LOCAL`, jeu de données factice, ne bloque rien) — **il n'est appelé nulle part dans le code**. Recherche exhaustive (`grep -rn "screenName"`) : zéro appelant. Le document de conformité le décrivait comme « pose un drapeau pour la revue humaine » — **c'est inexact**, il n'est câblé nulle part. Corrigé dans `docs/compliance/matrix.md` §3. **Volontairement non câblé** (voir §5, décision explicite). |
| **Liveness / vérification biométrique** | Le « selfie » est une simple photo (upload + compression côté client), aucune détection du vivant. **Non disclosé à l'utilisateur avant P0.5** — la page `/profile/kyc` ne mentionnait nulle part que ce n'est pas une vérification d'identité réglementaire, contrairement à `/insurance` et `/tontine/garantie` qui ont déjà un bandeau honnête. Corrigé (§4). |

### 🔎 COMPORTEMENT RÉEL NOTABLE — trouvé pendant la vérification finale

| Constat | Détail |
|---|---|
| **Soumettre un document alors que le compte est déjà `VERIFIED` rétrograde silencieusement vers `IN_PROGRESS`** | `POST /api/v1/kyc/documents` (`activeCaseFor`) ne cherche un dossier ouvert que parmi `IN_PROGRESS`/`ACTION_REQUIRED` ; un compte `VERIFIED` n'en a pas → un **nouveau** dossier est ouvert et `user.kycStatus` repasse à `IN_PROGRESS` (palier 0), **sans qu'aucun chemin automatique ne restaure `VERIFIED`** (seule une revue admin explicite le peut). Trouvé en creusant un échec E2E inattendu (voir §4d) — comportement du code réel, pas un bug d'infrastructure. **Question de politique produit/conformité, pas une correction technique mineure** : faut-il qu'une resoumission (ex. renouvellement de pièce d'identité) fasse perdre le palier acquis en attendant une revue, ou seulement rouvrir le type de document concerné ? **Non modifié ici** — documenté comme risque résiduel (§8) pour décision explicite, conformément à l'interdiction de gros refactoring non nécessaire. |

### 📋 MANQUANT

| Fonctionnalité | Constat |
|---|---|
| Transition `EXPIRED` | Définie dans le schéma (`KycStatus`), une branche de rendu existe côté client (`kyc-client.tsx:151`), **mais aucun code ne la déclenche jamais** — recherche exhaustive : le seul endroit où `'EXPIRED'` apparaît dans tout `app/`/`lib/` est ce rendu client mort. Pas de cron, pas de logique de péremption. Non implémenté (pas une fonctionnalité cassée — elle n'existe simplement pas). |
| Réexamen périodique (re-KYC) | Non implémenté. |
| Déclaration de soupçon / gel des avoirs | Procédure non définie (hors portée technique de cette phase — nécessite un interlocuteur CENTIF réel). |

## 3. Contrôles de risque / LAB-FT

Le moteur anti-fraude (`lib/fraud/*`, ADR 0013) reste hors périmètre de
cette phase (déjà audité, non modifié) — vérifié qu'il **ne bloque jamais
automatiquement de fonds**, seulement une revue humaine (`FraudAlert` +
`/admin/fraud`), cohérent avec la posture documentée. Aucune modification
apportée ici.

## 4. Correctifs apportés (minimaux, justifiés)

### a) Plafond KYC manquant sur la commande Marketplace (risque réel trouvé)

**Constat** : `wallet/transfer` et `payments` appellent tous deux
`checkOutboundLimit` avant tout mouvement d'argent. `POST /marketplace/[id]/order`
(mode WALLET) — qui débite aussi le wallet de l'acheteur via
`postDoubleEntry` — **ne le faisait pas**. Un compte non vérifié (palier 0,
50 000 FCFA/opération) pouvait donc dépenser sans aucun plafond via un
achat marketplace, un écart réel avec les deux routes financières
équivalentes.

**Correctif** : ajout de `checkOutboundLimit(context.userId, price)` dans
`marketplace/[id]/order/route.ts` (mode WALLET), avant tout appel au
ledger — même emplacement et même pattern que `wallet/transfer`. Ajout de
`SALE_PAYMENT` à `OUTBOUND_TYPES` dans `lib/kyc/limits.ts` (sinon
l'agrégation mensuelle aurait ignoré ces débits, laissant un contournement
possible par achats répétés sous le plafond par opération).

**Justification du toucher Marketplace** : dépendance indispensable
explicitement autorisée (périmètre point 8 : « vérifier les contrôles liés
aux profils, limites »). Ne touche à **aucune** règle métier Marketplace —
uniquement un contrôle de plafond ajouté avant le paiement, symétrique à ce
qui existe déjà sur les deux autres routes financières. `lib/kyc/limits.ts`
n'est pas dans la liste des fichiers interdits.

### b) Absence de divulgation à l'utilisateur final (risque de conformité perçue)

**Constat** : `/profile/kyc` ne disait nulle part à l'utilisateur que la
vérification est un contrôle interne, pas une vérification d'identité
réglementaire — contraste avec `/insurance` et `/tontine/garantie` qui ont
déjà un bandeau « Mode démonstration » honnête. Risque direct au regard de
la contrainte absolue « ne pas prétendre qu'un KYC réel existe ».

**Correctif** : bandeau de transparence ajouté en haut de `/profile/kyc`
(FR + EN, `kycPage.demoNoticeTitle`/`demoNoticeBody`), **même pattern déjà
utilisé** par `/tontine/garantie` (classe CSS `.demoBanner` répliquée à
l'identique) — pas une invention, l'application d'un motif déjà établi et
accepté ailleurs dans l'app à un endroit qui en manquait. Texte : précise
que la vérification débloque des paliers internes, pas une vérification
réglementaire ; pas de liveness ni de screening habilité ; ces contrôles
seront intégrés avant activation de tout service financier réel.

### c) Documentation

`docs/compliance/matrix.md` §3 mis à jour ligne par ligne avec les constats
précis ci-dessus (dont la correction de l'inexactitude sur le screening).

### d) Pollution d'état entre tests E2E, révélée par le correctif (a)

**Constat** : la vérification finale (`test:e2e:isolated`) a d'abord montré
un **nouvel échec déterministe** (pas de la flakiness) sur
`marketplace-delivery.spec.ts:14`/`:101` — `400` « plafond KYC dépassé »
sur des achats de 90 000/260 000 FCFA par Ama (SEED.ama), pourtant seedée
`VERIFIED` niveau 2 (plafond 2 000 000 FCFA). Root-cause tracée par requête
directe sur la base de test : `kyc-pin-admin.spec.ts` (test « Upload KYC »,
alphabétiquement avant `marketplace-delivery`) soumet un document KYC pour
Ama pour tester le mécanisme d'upload, ce qui déclenche l'effet de bord
réel documenté ci-dessus (§2, rétrogradation `VERIFIED → IN_PROGRESS`) —
et ne restaurait jamais son statut après coup. Le plafond KYC n'existant
pas encore sur la Marketplace avant P0.5, cette pollution d'état
préexistante était invisible. **Confirmé sans lien avec la logique métier
de la commande Marketplace elle-même** (le correctif §4a fonctionne
correctement pour un compte réellement non vérifié — vérifié par les 3
tests d'intégration §6).

**Correctif** : `e2e/kyc-pin-admin.spec.ts` — après le nettoyage existant
(suppression du document ajouté), restauration explicite du statut d'Ama
via **le mécanisme de revue admin déjà existant et légitime**
(`PATCH /api/v1/admin/kyc/[id] {decision:'VERIFIED', level:2}`, même
route que `/admin/kyc` en production) plutôt qu'une écriture directe en
base. Fichier de test uniquement — aucun code applicatif modifié pour ce
point.

**Vérification** : suite E2E complète rejouée après correctif —
`marketplace-delivery.spec.ts:101` passe désormais ;
`marketplace-delivery.spec.ts:14` échoue à nouveau mais avec sa signature
d'erreur **préexistante et déjà documentée** avant P0.5 (`TypeError` sur
`confirm.json().data` — timing métier de règlement à la livraison, sans
lien avec l'authentification ni le KYC, cf. `TICKET_CI_E2E_FAILURES.md`).

## 5. Ce qui n'a délibérément PAS été fait

- **Screening sanctions/PPE non câblé.** Le brancher sur les documents
  soumis aurait pu donner l'impression d'un filtrage réel alors
  qu'aucune liste de sanctions/PPE réelle n'est utilisée (la liste locale
  ne contient qu'une entrée de démonstration). Le câbler serait créer une
  **fausse conformité** — exactement ce que la contrainte absolue interdit.
  Documenté comme manquant, pas simulé-mais-branché.
- **Transition `EXPIRED` non implémentée.** L'implémenter exigerait de
  concevoir une politique de péremption (durée, déclencheur, notification)
  — une décision produit/conformité, pas une correction technique
  mineure. Hors périmètre de « corrections nécessaires et autorisées ».
- **Aucune certification, aucun prestataire IDV/screening simulé comme
  réel.** Aucune ligne du rapport ou du code ne prétend qu'une vérification
  réglementaire a lieu.
- **La rétrogradation silencieuse `VERIFIED → IN_PROGRESS` à la
  resoumission d'un document (§2) n'a pas été modifiée.** C'est une
  décision de politique KYC (faut-il conserver le palier pendant la revue
  d'un renouvellement de pièce ?), pas un bug technique évident — la
  trancher sans validation explicite risquerait d'assouplir un contrôle
  de conformité sans mandat pour le faire. Documentée comme risque
  résiduel (§8), avec seulement son **effet de bord sur les tests E2E**
  corrigé (§4d), pas le comportement applicatif lui-même.

## 6. Tests (nouveau `test/integration/marketplace-kyc-limits.itest.ts`, 3 tests, base réelle)

1. Un compte non vérifié (palier 0) est refusé au-dessus du plafond par
   transaction — aucun débit, aucune commande créée.
2. Un compte vérifié niveau 2 peut acheter un article que le palier 0
   refuserait.
3. **Les achats marketplace sont comptés dans l'agrégation mensuelle** —
   3 achats sous le plafond par opération cumulent correctement ; le 4ᵉ
   (qui dépasserait le plafond mensuel) est refusé. Vérifie explicitement
   que `SALE_PAYMENT` est bien agrégé (pas de contournement par achats
   répétés).

`lib/i18n/messages/catalogs.test.ts` (existant, 3 tests) confirme la parité
FR/EN des nouvelles clés `demoNoticeTitle`/`demoNoticeBody`.
`test/integration/kyc-limits.itest.ts` (existant, 4 tests) reste vert après
l'ajout de `SALE_PAYMENT` à `OUTBOUND_TYPES`.

## 7. Vérification

`tsc` : 0 erreur. `next lint` : 0 warning. `vitest` (unit) : **194/194**
(inchangé). `test:integration` (`USE_TEST_DB=1`) : **17 fichiers, 63/63**
(60 précédents + 3 nouveaux). `build` : succès (confirmé 2 fois, dont une
fois par comparaison A/B `git stash` — voir §4d et
`TICKET_CI_E2E_FAILURES.md`). `test:e2e:isolated` (base locale isolée,
reset + seed avant run) : **55 passed / 2 failed** sur 57 — les 2 échecs
(`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:37`) reproduisent
exactement les signatures d'erreur **préexistantes et déjà documentées**
avant P0.5 dans `TICKET_CI_E2E_FAILURES.md` (business-logic timing /
violation de mode strict Playwright — aucun lien avec l'authentification
ni le KYC). Un 3ᵉ symptôme (`auth.spec.ts:12`, échec de déconnexion)
observé sur un run intermédiaire a été vérifié par comparaison A/B
rigoureuse (`git stash`, 4 exécutions de chaque côté) : **3/4 échecs
identiques avec ET sans les changements P0.5** → confirmé préexistant,
non lié à cette phase, caractérisé dans `TICKET_CI_E2E_FAILURES.md`
(absent du run de clôture final, cohérent avec sa nature flaky).

## 8. Risques résiduels documentés (non supprimés, confirmés existants)

Tous les risques résiduels P0.0→P0.4 restent inchangés. S'ajoutent, propres
à cette phase :

1. **Screening sanctions/PPE non branché** — nécessite un vrai prestataire
   avant toute activation de service financier réel (bloquant déjà
   documenté dans `matrix.md` synthèse, précisé ici : le stub n'est même
   pas câblé, contrairement à ce que le document disait avant P0.5).
2. **Pas de liveness réel** — nécessite un prestataire IDV agréé (bloquant
   déjà documenté, désormais explicitement disclosé à l'utilisateur).
3. **`EXPIRED` non implémenté** — aucune péremption/réexamen périodique du
   KYC actuellement.
4. **Valeurs de plafonds non calées sur la réglementation réelle** —
   conservatrices par choix, à confirmer avec un conseil compliance.
5. **Déclaration de soupçon / gel des avoirs** — procédure et interlocuteur
   CENTIF à définir (hors portée technique).
6. **Rétrogradation silencieuse `VERIFIED → IN_PROGRESS`** à la
   resoumission d'un document (§2, §4d) — décision de politique KYC non
   tranchée ici, à valider explicitement avant toute évolution du
   comportement applicatif.
7. **`e2e/auth.spec.ts:12` (déconnexion)** — flakiness préexistante
   caractérisée pendant cette phase (taux de reproduction ~75% en
   isolation), confirmée sans lien avec P0.5 ; root-cause encore ouverte,
   suivi dans `TICKET_CI_E2E_FAILURES.md`.

## 9. Conformité au périmètre

- ✅ Les 12 points audités/vérifiés ; classification réel/partiel/simulé/
  manquant/risqué produite et documentée.
- ✅ Aucune certification inventée ; aucune prétention de KYC réel ; aucun
  paiement/service réglementé activé (Invest/Insurance/Loans restent
  `REGULATED`, FGS reste en mode démonstration).
- ✅ Ledger, Wallet, Escrow, règles Payments, Tontines, flux de capture KYC
  lui-même, P0.2, P0.3 : **non touchés**.
- ✅ Marketplace touché uniquement pour la dépendance indispensable
  justifiée (§4a) — aucune règle métier modifiée.
- ✅ Aucun risque résiduel précédent supprimé ; aucun test contourné.
- ✅ 1 changement cohérent = plafond KYC marketplace + bandeau de
  transparence + documentation, en un seul commit.

---

## Vérification finale CI/CD + staging (commit de clôture)

Voir la section correspondante ci-dessous, complétée après le push et la
vérification run par run (méthode établie : jamais la vue liste/checks).

## Verdict

**P0.5 = VALIDÉ.** Audit complet réalisé, 2 écarts documentaires corrigés,
1 lacune de sécurité réelle corrigée (plafond KYC absent sur la
Marketplace), 1 régression E2E introduite par ce correctif détectée et
corrigée avant clôture (pollution d'état entre tests, pas la logique
métier), aucune fausse conformité créée, aucun risque résiduel supprimé.
Sous réserve de la confirmation CI/staging documentée ci-dessous
(méthode : page de détail de chaque run, jamais la vue liste/checks).
