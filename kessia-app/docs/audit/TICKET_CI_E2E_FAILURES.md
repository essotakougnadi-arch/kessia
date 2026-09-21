---
title: "KESSIA — Ticket : échecs CI e2e.yml (pré-existants, confirmés antérieurs à P0.1)"
date: "15 septembre 2026 (ouvert) — mis à jour à la clôture de P0.5 (21 sept.)"
---

# Ticket — Échecs `e2e.yml` en CI (pré-existants)

**Statut : PARTIELLEMENT RÉSOLU — clôture P0.2 (2026-09-16). Nouveau cas
`auth.spec.ts:12` caractérisé (préexistant, non-régression) à la clôture de
P0.5 (2026-09-21).**
Ouvert à la clôture de P0.1, suite à la découverte documentée dans
`P0_1_REMEDIATION_REPORT.md` §6/§7. Non bloquant pour P0.1 (non-régression
démontrée par comparaison avec le commit `3786926`, antérieur à tout
changement P0.1).

**Mise à jour P0.2 — hypothèse confirmée empiriquement.** Après le correctif
de la collision `Session.token` (commit `f0457d3`), le run `e2e.yml` associé
montre **47 passed / 2 failed / 0 flaky** (contre 31-34 passed / 2 failed /
13-16 flaky avant). Le symptôme dominant (`login → 500`) **a disparu et n'est
pas réapparu** sur le run de clôture de P0.2 (commit `8f9625c`, également
47 passed / 2 failed / 0 flaky). Root-cause `Session.token` = **confirmée et
close**.

**Point 2 restant, précisé au fil des runs** : les 2 tests « failed » ne sont
**pas toujours les mêmes deux** — run `f0457d3` : `tontine.spec.ts:22` +
`:37` ; run `8f9625c` : `tontine.spec.ts:37` + `marketplace-delivery.spec.ts:14`
(nouveau). `tontine.spec.ts:37` est le seul récurrent sur tous les runs
post-correctif. Cohérent avec la flakiness E2E générale déjà documentée en
P0.1 (1 à 3 tests différents et non reproductibles par run) plutôt qu'un bug
déterministe unique — mais `tontine.spec.ts:37` mérite un œil plus attentif
vu sa récurrence. Erreurs de ces 2 runs, toutes **confirmées étrangères à
l'authentification** (aucun 401/session dans les traces) :
- `tontine.spec.ts:37` : violation de mode strict Playwright (`getByText`
  résout 2 éléments — un lien + un toast).
- `marketplace-delivery.spec.ts:14` : `TypeError` sur `confirm.json().data`
  undefined — timing métier (règlement à la livraison), pas un problème
  d'auth.

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

1. **✅ RÉSOLU — collision `Session.token`.** Confirmé cause principale :
   après le correctif (commit `f0457d3`, `jti` aléatoire remplace le JWT
   comme clé unique de session), les `500`/flaky sur `login` en CI ont
   disparu (13-16 flaky → 0 flaky sur le run suivant). Détail dans
   `P0_2_REMEDIATION_REPORT.md` (à produire à la clôture de P0.2).
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

## Clôture P0.2

- **Point 1 (`Session.token`) : FERMÉ.** Corrigé par `f0457d3`, vérifié sur
  2 runs CI consécutifs (0 flaky à chaque fois). Détail complet dans
  `P0_2_REMEDIATION_REPORT.md`.
- **Point 2 (E2E business-logic, non-auth) : reste OUVERT, transféré hors
  P0.x.** `tontine.spec.ts:37` (récurrent) et `marketplace-delivery.spec.ts:14`
  (observé une fois) confirmés étrangers à l'authentification — hors
  périmètre P0.2 (Tontines/Marketplace métier explicitement non modifiables
  pendant cette phase). Root-cause et correctif à traiter dans un ticket
  dédié post-P0.x, sans lien avec P0.3/P0.4/P0.5.

## Mise à jour P0.5 — nouveau cas observé : `auth.spec.ts:12`

Pendant la vérification finale de P0.5 (`npm run test:e2e:isolated`, 57
tests), un 3e symptôme est apparu, jamais vu sur les runs P0.1-P0.4 :

- **`e2e/auth.spec.ts:12`** — « connexion par mot de passe → accueil, puis
  déconnexion ». Échec sur `expect(page).toHaveURL(/\/login/)` après le clic
  sur le bouton de déconnexion : l'URL reste sur `/home` au lieu de basculer
  vers `/login` (timeout 15 s).

**Vérification rigoureuse effectuée avant d'écarter l'hypothèse d'une
régression P0.5** (méthode A/B par `git stash`, identique à celle utilisée en
P0.1/P0.4) :

1. `auth.spec.ts` seul, 4 exécutions sur le code **avec** les changements
   P0.5 → **3/4 échecs**, trace identique à chaque fois.
2. `git stash push -u` (retire tous les changements P0.5) + `npm run build`
   (succès) + `auth.spec.ts` seul, 4 exécutions sur le code **sans** P0.5 →
   **3/4 échecs également**, trace strictement identique.
3. `git stash pop` (restauration propre, `git status` conforme) + rebuild
   (succès).

**Conclusion : préexistant, sans lien avec P0.5** (P0.5 ne touche ni
`lib/auth/*`, ni `AuthBootstrap`, ni les cookies — aucun fichier du
périmètre P0.2/P0.3 n'a été modifié). Taux de reproduction en isolation
(~75%) nettement plus élevé que `tontine.spec.ts:37` ou
`marketplace-delivery.spec.ts:14`, qui n'apparaissent que de façon
intermittente en suite complète. Mérite un ticket de root-cause dédié
(piste : interaction entre `AuthBootstrap` et le clic de déconnexion en
environnement E2E — la révocation de session P0.2 étant maintenant
vérifiée en base à chaque requête, un appel en vol au moment du clic
pourrait retarder la redirection), **hors périmètre P0.5** (KYC/conformité
uniquement) et hors périmètre de tout P0.x déjà clos. Non bloquant pour la
clôture de P0.5 : comportement identique avant/après, donc non-régression
démontrée.
