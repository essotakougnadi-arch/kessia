---
title: "KESSIA — Ticket : échecs CI e2e.yml (pré-existants, confirmés antérieurs à P0.1)"
date: "15 septembre 2026 (ouvert) — mis à jour pendant P0.2"
---

# Ticket — Échecs `e2e.yml` en CI (pré-existants)

**Statut : OUVERT.** Ouvert à la clôture de P0.1, suite à la découverte
documentée dans `P0_1_REMEDIATION_REPORT.md` §6/§7. Non bloquant pour P0.1
(non-régression démontrée par comparaison avec le commit `3786926`,
antérieur à tout changement P0.1).

## Constat

Le workflow GitHub Actions `e2e.yml` (Postgres **service container éphémère**
de CI, distinct de la base Postgres jetable locale) échoue de façon stable
sur les 3 derniers commits vérifiés (`3786926` — clôture P0.0 — puis les 2
commits P0.1) :

| Run (commit) | Résultat |
|---|---|
| `3786926` (clôture P0.0, **avant P0.1**) | 2 failed, 16 flaky, 31 passed |
| `c8991d5` (migration Next 15.5.24) | 2 failed, 13 flaky, 34 passed |
| `cca1d93` (précision doc P0.1) | 2 failed, 15 flaky, 32 passed |

**2 tests « failed » (non flaky) identiques sur les 3 runs** :
- `e2e/tontine.spec.ts:22` — « créer une tontine (type Achat) puis la
  retrouver dans la liste »
- `e2e/tontine.spec.ts:37` — « créer un plan d'Achat individuel (solo) puis
  le retrouver dans la liste »

**13 à 16 tests flaky**, symptôme dominant : `login +2289000000X → 500`
(erreur serveur sur `POST /api/v1/auth/login`, pas un simple 401/timeout
comme observé dans l'investigation locale de P0.1 — signature différente,
cohérente avec un environnement CI différent : service container Postgres
qui démarre à froid pour chaque run, vs. instance locale déjà chaude).

## Pistes de root-cause (à instruire, pas encore confirmées)

1. **Hypothèse principale (P0.2)** : le bug de collision `Session.token`
   (connu, réservé à P0.2 dès l'audit initial) provoque une erreur serveur
   lors de créations de session concurrentes ou rapprochées — plausible que
   ce soit exactement la cause des `500` sur `login` observés massivement en
   CI (où le service Postgres, plus lent à froid, augmente la fenêtre de
   course). **À vérifier empiriquement pendant P0.2** : si la correction de
   `Session.token` fait disparaître les `500` en CI, cause confirmée et
   traitée par P0.2 lui-même (dans son périmètre : « concurrence et
   idempotence des créations de session »).
2. **`tontine.spec.ts:22`/`:37`** : deux tests indépendants qui échouent de
   façon déterministe ensemble — piste : dépendance d'ordre/état partagé
   entre les deux tests (comme le pattern déjà résolu par l'ADR 0044 pour
   `support-attachments`/`marketplace-cart`), ou queue engorgée par les
   nombreux `500` de login en amont dans la même suite. **Hors périmètre
   P0.2** (P0.2 = auth uniquement, ne touche pas aux Tontines métier) —
   investiguer si la cause est un problème de **test** (fichier
   `e2e/tontine.spec.ts` lui-même, pas le code applicatif Tontine) ; si oui,
   correctif possible sans toucher au périmètre interdit. Si la cause
   s'avère être dans le code métier Tontine, **reporter à un ticket
   séparé**, hors P0.x.

## Périmètre de traitement

- **P0.2** traite le point 1 (`Session.token`) dans le cadre de son propre
  périmètre (createSession, concurrence des sessions). Le résultat sur les
  `500`/flaky de CI sera vérifié et rapporté dans
  `P0_2_REMEDIATION_REPORT.md`.
- **Point 2** (`tontine.spec.ts`) : investigation seulement pendant P0.2, sans
  toucher au code métier Tontine. Correction seulement si elle se limite au
  fichier de test E2E lui-même (isolation/ordre). Sinon, reste ouvert pour un
  ticket dédié post-P0.x.

## Clôture

Ce ticket sera mis à jour (statut, cause confirmée, correctif) à la clôture
de P0.2, puis fermé une fois `e2e.yml` vert de façon stable sur au moins 2
runs consécutifs — ou explicitement transféré à un ticket dédié si le
point 2 dépasse le périmètre P0.2.
