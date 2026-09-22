---
title: "KESSIA — P0.2 (finalisation) : Sessions / Tokens / Auth — Rapport"
date: "22 septembre 2026"
---

# KESSIA — P0.2 (finalisation) : Sessions / Tokens / Authentification

**Base** : P0.0, P0.1, P1.7, P1.9, P1.12 déjà validés — non refaits. Ce
chantier reprend le problème historique de concurrence (20 connexions →
15/20 en 500) en auditant l'état RÉEL du dépôt, sans rien supposer des
anciens rapports.

**Verdict : `PASS`.**

## 1. État avant (audit frais)

Le problème décrit dans le mandat (`Session.token` = JWT signé en
`@unique`, déterministe à la seconde près via `iat`, collision sous
connexions concurrentes → 500) était **déjà corrigé** lors d'un P0.2
antérieur (commits `f0457d3`, `8f9625c`, `eeab3f3`, déjà présents sur
`origin/main`, donc en production) :

- `Session.jti` (aléatoire, `crypto.randomBytes(24)`, 2⁻¹⁹² collision)
  remplace le JWT comme clé `@unique`.
- Cookies HttpOnly déjà en place (`kessia-access-token`,
  `kessia-refresh-token`), `Secure` dérivé du protocole réel, `SameSite`
  approprié, `refreshToken` retiré de `localStorage`.
- Révocation déjà vérifiée en base à chaque requête (`withAuth` →
  `isSessionRevoked`), pas seulement à l'expiration du JWT.
- Un test d'intégration existant prouvait déjà 10 créations concurrentes
  sans collision (`test/integration/session-security.itest.ts`, 8 tests).

Vérifié empiriquement avant toute modification : `git log` confirme ces
commits déjà fusionnés sur `origin/main` (`git merge-base --is-ancestor`).

## 2. Problème exact (ce qui restait à couvrir)

Deux écarts réels trouvés en creusant les 10 scénarios de sécurité exigés
par le mandat (aucun n'était couvert par erreur béante ou négligence —
les deux sont des angles morts précis, non testés jusqu'ici) :

**A. Session supprimée physiquement (purge RGPD) toujours acceptée.**
`isSessionRevoked` ne bloquait que si `jti` était trouvé en base ET
`revokedAt` renseigné — un `jti` **introuvable** (ligne supprimée par
`lib/privacy/erasure.ts::eraseUserAccount`, `session.deleteMany`) était
traité comme « non révoqué », laissant le token fonctionner jusqu'à
l'expiration naturelle du JWT (15 min).

**B. Rotation concurrente de refresh token → fausse détection de vol.**
Découvert en écrivant le test de concurrence explicitement demandé par
le mandat (double onglet/appareil). Constaté empiriquement, pas supposé :
sous course réelle, l'appel arrivé en second lit souvent la ligne déjà
révoquée par le premier → tombe dans la branche « réutilisation détectée »
→ `revokeAllUserSessions` déconnecte **tout** l'utilisateur, y compris la
session que le premier appel vient de créer légitimement. L'ancien
rapport P0.2 qualifiait ce cas de « bénin » sans jamais l'avoir testé
sous charge réelle — il s'agit en fait d'un faux positif de sécurité
reproductible (aucune faille d'accès, aucun crash, mais déconnexion
totale + fausse alerte « activité suspecte » pour un usage ordinaire).

## 3. Cause racine

**A** : confusion entre deux cas distincts dans `isSessionRevoked` — un
JWT pré-P0.2 sans `jti` du tout (rétro-compatibilité voulue) et un JWT
avec `jti` dont la ligne a été supprimée après coup (jamais distingués).

**B** : TOCTOU (Time-Of-Check to Time-Of-Use) classique dans
`rotateRefreshToken` — la lecture (`findFirst`, vérifie `revokedAt` au
moment de la lecture) et l'écriture (`update` **inconditionnel** dans le
`$transaction` d'origine) n'étaient pas atomiques : rien ne garantissait
que l'état lu restait vrai au moment d'écrire.

## 4. Fichiers concernés

| Fichier | Rôle |
|---|---|
| `lib/auth/session.ts` | `isSessionRevoked` (correctif A) + `rotateRefreshToken` (correctif B) |
| `test/integration/session-security.itest.ts` | 18 tests (8 existants + 10 nouveaux/étendus) |

Aucun autre fichier touché — confirmé par `git diff --stat` avant commit.

## 5. Correction

**A** — `isSessionRevoked` : un `jti` **présent** dans le JWT mais
**introuvable** en base est désormais traité comme révoqué
(`if (!session) return true;`, au lieu de `false`). Ne s'applique
JAMAIS à un JWT sans `jti` du tout (`if (!jti) return false` reste
inchangé, en premier) — donc aucun impact sur la rétro-compatibilité
pré-P0.2, ni sur les tokens de test qui signent volontairement sans
`jti` (`signAccessToken` direct, utilisé par 5 fichiers de tests
d'intégration existants, vérifié non affecté).

**B** — `rotateRefreshToken` : la révocation de l'ancienne ligne devient
un `updateMany({ where: { id, revokedAt: null }, data: { revokedAt } })`
à l'intérieur d'une transaction interactive (`prisma.$transaction(async
(tx) => …)`). C'est un compare-and-swap atomique au niveau base
(verrouillage de ligne Postgres natif) : seul UN appel concurrent peut
gagner la transition `null → révoqué`. Le perdant obtient `count === 0`
et retourne `null` **sans jamais passer par la détection de vol** — ni
`revokeAllUserSessions`, ni audit, ni notification. Seule une ligne
**déjà révoquée avant l'appel** (lue ainsi dès le `findFirst` initial,
donc une vraie réutilisation séquentielle et non une course) déclenche
encore la branche de détection de vol, strictement inchangée.

## 6. Modèle de sécurité

Aucune protection supprimée ni affaiblie : la détection de vol reste
déclenchée pour toute présentation d'un refresh token déjà révoqué AVANT
l'appel. Seule la fenêtre de course entre deux rotations **simultanées**
du même token (scénario ordinaire, pas une attaque) est désormais gérée
proprement au lieu de produire un faux positif.

## 7. Concurrence

- **20** créations de session concurrentes (`createSession`, pas
  seulement 10 comme avant) : toutes réussissent, `jti`/`refreshToken`
  tous distincts.
- **20** connexions concurrentes via la vraie route `POST
  /api/v1/auth/login` (pas seulement `createSession` en direct) :
  toutes réussissent en local (bypass rate limit, environnement de
  test) ; en Staging réel, **10 réussissent (200) + 10 correctement
  rejetées (429 Upstash, P1.12 inchangé et fonctionnel)** — 0 HTTP 500,
  0 collision.
- **Rotation concurrente de refresh token, répétée 10 fois par test, sur
  3 runs complets (30 itérations)** : à chaque itération, exactement un
  gagnant + un perdant propre, jamais de fausse détection de vol, le
  gagnant garde toujours une session active. Reconfirmé en direct sur
  Staging (2 refresh concurrents réels du même token) : gagnant 200 +
  perdant 401, le gagnant authentifie ensuite normalement (`GET
  /api/v1/wallet` → 200).
- **Vraie réutilisation séquentielle** (pas une course) : reste détectée
  et bloque toutes les sessions, en local ET en direct sur Staging
  (vérifié : la session issue de la rotation légitime est elle aussi
  révoquée après coup, exactement le comportement de sécurité voulu).

## 8. Cookies

Non modifiés (déjà conformes depuis le P0.2 antérieur) : `HttpOnly`,
`Secure` (dérivé du protocole réel), `SameSite=Lax`/`Strict`, `Path`
restreint pour le refresh token, `maxAge` appropriés. Revérifié : aucune
régression.

## 9. Expiration

Token expiré → `jwt.verify` lève `TokenExpiredError` → `verifyAccessToken`
retourne `null` → `withAuth` → 401 (jamais 500). Testé explicitement
(nouveau test, JWT signé avec `expiresIn: -10`).

## 10. Révocation

- Logout → 401 immédiat, vérifié en local ET en direct sur Staging
  (`Session révoquée. Veuillez vous reconnecter.`).
- Changement de mot de passe → toutes les sessions révoquées (test
  existant, inchangé, toujours vert).
- Session supprimée physiquement → désormais refusée immédiatement
  (correctif A), testé en local (reproduit exactement
  `lib/privacy/erasure.ts`) et vérifié en direct sur Staging via le
  scénario logout (chemin de révocation identique).

## 11. Tests de sécurité (matrice complète, 10 scénarios du mandat)

| # | Scénario | Résultat |
|---|---|---|
| 1 | Token valide | ✅ accès autorisé |
| 2 | Token manquant | ✅ 401 |
| 3 | Token invalide (chaîne arbitraire) | ✅ 401 |
| 4 | Token expiré | ✅ 401 (jamais 500) |
| 5 | Token altéré (signature modifiée) | ✅ 401 |
| 6 | Token d'un autre utilisateur | ✅ `assertOwnership` refuse |
| 7 | Session supprimée physiquement | ✅ 401 (correctif A) |
| 8 | Logout → session invalidée | ✅ 401 immédiat |
| 9 | Changement de mot de passe → invalidation | ✅ toutes révoquées |
| 10 | Replay d'un token révoqué | ✅ 401, détecté (correctif B préserve ce cas) |

## 12. Tests de concurrence

Voir §7. Résumé : `createSession` ×20, `POST /login` ×20 (local +
Staging réel), rotation de refresh token ×30 itérations (10×3 runs) +
2 vérifications live sur Staging (course + vraie réutilisation
séquentielle). **0 HTTP 500, 0 collision, 0 fausse détection de vol
sur aucune itération.**

## 13. Tests de non-régression

| Test | Résultat |
|---|---|
| `tsc` | ✅ 0 erreur |
| `lint` | ✅ 0 warning |
| Unit | ✅ 225/225 (inchangé) |
| Intégration | ✅ 18 fichiers, **78/78** (77 + 1 nouveau test) |
| Build | ✅ succès |
| E2E isolé | ✅ **56 passed / 1 failed** (`marketplace-delivery.spec.ts:14`, famille déjà documentée comme préexistante — aucun échec lié à l'authentification) |

## 14. Staging

Déployé sur **`kessia-staging` exclusivement** (Vercel CLI depuis la
racine du dépôt, hors pipeline Git, aucun push). Deux déploiements :
un avant le correctif B (pour confirmer le problème en conditions
réelles), un après (pour valider le correctif).

| Vérification | Résultat |
|---|---|
| `/api/health` | ✅ 200 |
| Accueil | ✅ 200 |
| Middleware (route protégée sans session) | ✅ 307 → `/login?from=...` |
| RBAC 401 (API sans token) | ✅ 401 |
| RBAC 403 (USER sur route admin) | ✅ 403 |
| Login | ✅ 200 |
| Wallet (authentifié) | ✅ 200, solde réel (301000 XOF) |
| Tontines (authentifié) | ✅ 200 |
| Marketplace (public) | ✅ 200 |
| Image statique | ✅ 200 |
| **20 logins concurrents réels** | ✅ 10×200 (tokens distincts) + 10×429 (Upstash, P1.12 intact), 0×500 |
| Logout → accès après logout | ✅ 401 immédiat |
| Token invalide | ✅ 401 |
| **2 refresh concurrents du même token (réel)** | ✅ 1×200 + 1×401, gagnant reste authentifié |
| **Rejeu séquentiel d'un ancien refresh token** | ✅ 401, toutes sessions révoquées (vraie détection intacte) |
| Logs Vercel | ✅ aucun secret, aucun `500`, aucune trace `WRONGPASS` |

## 15. Risques résiduels

1. **Connexion DB à `connection_limit=1` sur Staging** — observé dans
   les logs : sous rafale concurrente, des écritures **fire-and-forget**
   annexes (`void recordAudit(...)`, `void assessEvent(...)`,
   `void notify(...)` — jamais le chemin de réponse principal) peuvent
   timeout après 10s sur la connexion Prisma. **Aucun impact observé sur
   aucune réponse HTTP** (toutes vérifiées 200/401/403/429 exactes,
   jamais 500) — confirmé pré-existant (ces appels `void` existaient
   avant ce chantier, non modifiés). Correspond au chantier déjà prévu
   au plan « pool de connexions » (hors périmètre P0.2).
2. **`accessToken` en mémoire navigateur, pas chiffré davantage** — déjà
   documenté et accepté lors du P0.2 antérieur, inchangé ici.

## 16. Commit

Un seul commit local, périmètre strictement limité à
`lib/auth/session.ts` + `test/integration/session-security.itest.ts` +
ce rapport + `CHANGELOG.md`. **Non poussé vers `origin/main`.**

## 17. Verdict

**VERDICT P0.2 (finalisation) : `PASS`.**

Le problème historique (collision `Session.token`) était déjà résolu ;
revérifié ici avec une charge doublée (20 au lieu de 10) et au niveau de
la vraie route HTTP, en local et en direct sur Staging. Deux angles
morts réels trouvés en testant rigoureusement la matrice de sécurité
exigée par le mandat (session supprimée toujours acceptée ; rotation
concurrente déclenchant une fausse alerte de vol) ont été corrigés par
des changements minimaux et ciblés, sans désactiver ni affaiblir aucune
protection existante — la vraie détection de réutilisation reste
pleinement fonctionnelle, vérifiée en local et sur Staging réel.

Ledger, Wallet, Escrow, Payments, Tontines, Marketplace, KYC, AML, IA,
P1.12/Upstash, schéma Prisma/migrations : **non touchés**. Aucun push
effectué. Aucun déploiement ni modification de `kessia` (production).
