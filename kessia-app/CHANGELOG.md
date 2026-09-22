# Changelog — KESSIA App

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Le projet suit la feuille de route par phases du cahier des charges (§52).

## [Non publié] — Phase 0 — P0.3 : sécurité webhooks — course de réclamation sous concurrence

Audit exhaustif (mots-clés webhook/callback/HMAC sur tout le dépôt) :
exactement 2 endpoints webhook (`payments/webhooks/[provider]`,
`marketplace/deliveries/webhooks/miaride`), déjà solides (HMAC-SHA256 +
horodatage, comparaison temps constant, fail-closed en production —
vérifié en direct sur Staging : 401 systématique, aucun secret
configuré). En testant rigoureusement la concurrence exigée par le
mandat (20 requêtes du même événement), un vrai problème trouvé et
corrigé. Voir `docs/audit/P0_3_WEBHOOK_SECURITY_REPORT.md`.

### Corrigé
- **Idempotence webhook non atomique sous concurrence réelle.**
  `recordWebhookAttempt` (`lib/webhooks/journal.ts`) rouvrait sans
  condition une ligne `WebhookEvent` en statut `processing`/`failed` —
  sous 20 requêtes vraiment concurrentes du même événement, 7 appels
  sur 20 obtenaient `duplicate: false` et déclenchaient tous la logique
  métier en parallèle. **Aucune faille financière** : la contrainte
  `LedgerEntry.idempotencyKey @unique` a absorbé le risque (solde
  toujours correct, une seule écriture réelle) ; le vrai problème était
  une erreur Prisma brute renvoyée en 400 aux appels perdants (fuite
  mineure de détail interne + réponse non idempotente). Corrigé par une
  réclamation atomique conditionnelle (`updateMany` avec compare-and-swap
  au niveau base, même mécanisme que le correctif P0.2 sur la rotation
  de refresh token) — un `processing` récent (< 60 s) est traité comme
  « en cours de traitement par un concurrent » sans aucune écriture, un
  `processing` ancien ou `failed` déclenche une réclamation atomique où
  un seul concurrent peut gagner.

### Tests
`test/integration/webhook-security.itest.ts` : 9 → 17 tests. Ajout de 4
tests de concurrence (20× même événement / 20× événements différents,
pour chaque webhook), payload altéré après signature, signature absente
et secret absent en production pour Miaride (déjà présents côté
paiement).

### Vérification
`tsc` 0 · `lint` 0 · unit **225/225** · intégration **86/86** · build OK
· E2E **55 passed / 2 failed** (préexistants documentés). **Staging** :
fail-closed vérifié en direct sur les 2 webhooks (401 sans secret
configuré), P0.2 (login/wallet/logout) et P1.12 (Upstash, 429 avec
délai réel calculé) revérifiés non-régressés, aucun secret dans les
logs.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, Payments (logique métier), Tontines,
Marketplace (métier), KYC, AI, RBAC, Sessions/Tokens (P0.2), rate
limiting P1.12/Upstash, migrations Prisma.

## [Non publié] — Phase 0 — P0.2 (finalisation) : sessions/tokens — course de rotation & session supprimée

Audit frais du mandat historique (20 connexions concurrentes → 500) :
déjà corrigé par un P0.2 antérieur, déjà en production (`Session.jti`
aléatoire au lieu du JWT en `@unique`). Revérifié avec une charge
doublée (20, pas 10) et au niveau de la vraie route `/login`. En testant
rigoureusement la matrice de sécurité complète du mandat, deux angles
morts réels trouvés et corrigés. Voir
`docs/audit/P0_2_SESSIONS_TOKENS_AUTH_REPORT.md` pour le détail complet.

### Corrigé
- **Session supprimée physiquement (purge RGPD) restait acceptée**
  jusqu'à l'expiration naturelle du JWT (15 min) au lieu d'être refusée
  immédiatement. `lib/auth/session.ts::isSessionRevoked` traite
  désormais un `jti` présent mais introuvable en base comme révoqué —
  sans impact sur la rétro-compatibilité des JWT pré-P0.2 (sans `jti` du
  tout), qui reste inchangée.
- **Rotation concurrente de refresh token (double onglet/appareil)
  déclenchait une fausse détection de vol.** Course TOCTOU dans
  `rotateRefreshToken` : la lecture de `revokedAt` et son écriture
  n'étaient pas atomiques, si bien que l'appel concurrent arrivé en
  second lisait souvent la ligne déjà révoquée par le premier et
  déclenchait `revokeAllUserSessions`, déconnectant l'utilisateur
  légitime de partout avec une fausse alerte « activité suspecte ».
  Corrigé par un `updateMany` conditionnel (`WHERE revokedAt IS NULL`)
  dans une transaction interactive — compare-and-swap atomique au
  niveau base. Le perdant d'une course légitime obtient désormais `null`
  proprement, sans jamais déclencher la détection de vol. La vraie
  réutilisation séquentielle (token déjà révoqué avant l'appel) continue
  d'être détectée et bloquée à l'identique — aucune protection
  affaiblie.

### Tests
`test/integration/session-security.itest.ts` : 18 tests (8 existants +
10 nouveaux/étendus). Notamment : 20 créations de session concurrentes,
20 connexions concurrentes via la vraie route `/login`, rotation de
refresh token concurrente répétée 10× par test (30 itérations sur 3
runs, 0 fausse détection), matrice complète des 10 scénarios de
sécurité du mandat (token manquant/invalide/expiré/altéré/d'un autre
utilisateur/session supprimée/révoqué/replay).

### Vérification
`tsc` 0 erreur · `lint` 0 warning · unit **225/225** · intégration
**78/78** · build OK · E2E isolé **56 passed / 1 failed** (échec
préexistant documenté, sans lien avec l'authentification). **Staging**
(`kessia-staging`, Vercel CLI, hors pipeline Git) : matrice complète
vérifiée en direct dont 20 logins concurrents réels (10×200 + 10×429
Upstash, 0×500), 2 refresh concurrents réels (1 gagnant reste
authentifié, 1 perdant propre), rejeu séquentiel d'un ancien refresh
token toujours détecté et bloqué. Aucun secret dans les logs.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, Payments, Tontines, Marketplace, KYC/AML, IA,
rate limiting P1.12/Upstash (revérifié fonctionnel, non modifié),
schéma Prisma/migrations.

## [Non publié] — Phase 0 — P0.1 (finalisation) : sécurité Next.js

Audit frais de l'état actuel (sans supposer des anciens rapports) :
`next` déjà à `15.5.24` (migration antérieure déjà validée), mais
`eslint-config-next` resté sur `14.2.35` — jamais aligné, portant une
vulnérabilité **HIGH** réelle (`glob`, injection de commande,
GHSA-5j98-mcp5-4vw2). Voir
`docs/audit/P0_1_NEXTJS_SECURITY_MIGRATION_REPORT.md` pour le rapport
complet.

### Corrigé
- **`eslint-config-next` obsolète et vulnérable** (`14.2.35` →
  `15.5.24`, alignement exact sur `next`, version stable existante hors
  de la plage vulnérable). Devdependency de lint uniquement, aucun
  impact runtime. `next` lui-même **inchangé** (déjà à la cible,
  **pas** de passage à Next 16).

### Vérification
`tsc` 0 erreur · `lint` 0 warning (nouveau ruleset inclus) · `vitest`
unit **225/225** · `test:integration` **68/68** · `build` OK ·
`test:e2e:isolated` **54 passed / 3 failed** (3 échecs correspondant
chacun à une signature déjà documentée comme préexistante) · `npm
audit` : **8 → 5** vulnérabilités (0 restante liée à Next.js ; les 5
restantes sont liées à l'outillage de test `vitest`/`vite`, hors
périmètre). **Staging** (`kessia-staging`, via Vercel CLI, hors
pipeline Git) : health/accueil/middleware/RBAC 401+403/login/Wallet/
Tontines/Marketplace/images/logs — tous vérifiés OK.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, Payments, Tontines, Marketplace, KYC/AML, IA,
Webhooks (P0.3), P0.2 (sessions/tokens/cookies/révocation), Prisma/
PostgreSQL, rate limiting (P1.12)/Upstash, CSP/HSTS (Lot C de P1.9).
Seuls `package.json` et `package-lock.json` modifiés.

## [Non publié] — Phase 1 — P1.12 : Rate limiting distribué (Upstash) & garde fail-closed — NON DÉPLOYÉ

**⚠️ Ce changement est committé mais volontairement NON poussé vers `origin
main`.** Upstash n'est configuré ni en Staging ni en Production (vérifié :
aucune référence dans `staging.yml`/`vercel.json`/`smoke.mjs`, aucune
variable dans `.env.local`/`.env.test`). Un push vers `main` déclenche à
la fois `staging.yml` et le déploiement continu Vercel de la production
(`kessia-dun.vercel.app`) — les deux étant déclenchés par le même
événement `push: branches: [main]`, il n'existe aucun moyen de déployer
sur Staging seul. Pousser maintenant activerait le fail-closed sur
`login`/`register`/`2FA`/`PIN`/`OTP`/`changement de mot de passe` **en
production**, sans Upstash pour les servir : ces routes deviendraient
inutilisables pour de vrais utilisateurs. Voir
`docs/audit/P1_12_REMEDIATION_REPORT.md` pour le détail complet et ce
qui reste à faire avant un déploiement.

### Corrigé
- **Rate limiting inefficace en production.** `lib/security/rate-limit.ts`
  retombait silencieusement sur un compteur en mémoire quand Upstash
  n'est pas configuré — sans protection anti-brute-force réelle en
  environnement serverless (chaque invocation peut tourner sur une
  instance différente). Upstash n'étant configuré nulle part
  aujourd'hui, `login`/`register`/`2FA`/`PIN`/OTP/changement de mot de
  passe n'ont actuellement **aucune** protection anti-brute-force
  distribuée effective sur le déploiement en ligne.

### Ajouté
- **Garde fail-closed** (nouvelle logique interne à
  `lib/security/rate-limit.ts`, aucun autre fichier touché) : en
  production, si Upstash est absent **ou** en erreur, les routes
  d'authentification (identifiées par le seul préfixe `auth.` du nom
  déjà passé à `enforceRateLimit` — `auth.login`, `auth.register`,
  `auth.2fa`, `auth.pin_verify`, `auth.request-otp`,
  `auth.verify-otp`, `auth.change-password`) refusent explicitement
  (429, message générique, aucun détail interne) plutôt que de
  retomber silencieusement sur le compteur mémoire. Les 18 autres
  routes (wallet, marketplace, KYC, IA…) gardent leur repli mémoire
  existant, strictement inchangé. Hors production (dev/test/CI),
  comportement strictement inchangé — jamais de fail-closed, pas de
  dépendance obligatoire à Upstash.
- Configuration d'exécution (`NODE_ENV`, présence Upstash, bypass E2E)
  désormais relue à chaque appel plutôt que figée au chargement du
  module — permet de tester tous les environnements sans réimporter le
  module ; comportement observable inchangé.

### Tests
`lib/security/rate-limit.test.ts` étendu à 16 tests (4 existants
inchangés + 12 nouveaux) : Upstash opérationnel (respect de
`limit`/`windowMs`, dépassement → 429), Upstash absent en production
sur route protégée → fail-closed, Upstash absent en dev/test → mémoire
inchangée, erreur fournisseur Upstash → fail-closed sur route protégée
/ repli mémoire sur route non protégée, aucun secret ni détail interne
dans les réponses, isolation stricte des compteurs entre utilisateurs,
bypass E2E toujours prioritaire.

### Vérification
`tsc` 0 erreur · `lint` 0 warning · `vitest` unit **225/225** (213
précédents + 12 nouveaux) · `test:integration` **18 fichiers, 68/68**
(inchangé) · `build` OK · `test:e2e:isolated` **54 passed / 3 failed**
— 3 échecs correspondant chacun à une signature déjà documentée comme
préexistante, `E2E_RATE_LIMIT_BYPASS=1` confirmé neutraliser
entièrement le nouveau fail-closed (aucun nouvel échec lié à
l'authentification). **Staging/Production : non vérifiés — non
déployés, voir avertissement ci-dessus.**

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, règles métier Payments/Tontines/Marketplace,
KYC/AML, IA, P0.2 (sessions/tokens/cookies/`createSession`/refresh/
révocation), P0.3, CSP/HSTS (Lot C de P1.9), schéma Prisma/migrations,
contrats API métier. Aucun des 25 fichiers appelant `enforceRateLimit`
n'a été modifié — la garde est identifiée uniquement par le préfixe du
nom déjà transmis (`auth.*`).

### Variables manquantes (bloquantes pour le déploiement)
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — absentes de
Staging et de Production. Tant qu'elles ne sont pas configurées et
vérifiées, ce commit reste local, non poussé.

## [Non publié] — Phase 1 — P1.9 (Lot B) : Garde contre les commandes de base de données destructives

Inspection préalable de `package.json`, `prisma/seed.ts`, `scripts/`, les
workflows CI/CD et l'usage des variables d'environnement — présentée
avant toute modification. **Découverte critique** : `prisma/seed.ts`
efface (`deleteMany`) la quasi-totalité des tables — y compris les
utilisateurs — avant de réensemencer ; `.env`/`.env.local` pointent
aujourd'hui sur le projet Supabase de production/démo (pas de base
locale/dev séparée). `npm run db:seed` lancé par erreur en l'état
détruirait donc irréversiblement les données réelles.

### Ajouté
- Nouveau `scripts/guard-db-command.mjs` — refuse l'exécution d'une
  commande si `DATABASE_URL` (résolu exactement comme Prisma CLI :
  `process.env`, puis `.env`, jamais `.env.local`) contient la référence
  du projet Supabase de production connue — même motif que la garde déjà
  en place et prouvée en CI (`staging.yml`, `e2e.yml`,
  `integration.yml`). N'affiche jamais l'URL complète (identifiants
  compris) dans ses messages, y compris en cas de refus.
- `package.json` : `db:seed`, `db:push`, `db:migrate`,
  `db:migrate:deploy`, `db:studio` passent désormais par cette garde.
  `db:test:reset`, `db:generate`, `db:backup`, `privacy:purge`
  volontairement non concernés (déjà protégé autrement, sans connexion
  DB, non destructif, ou destiné à tourner en production).
- `docs/development/testing.md` : section dédiée expliquant la garde et
  son périmètre.

### Tests
Nouveau `scripts/guard-db-command.test.ts` (10 tests) : détection d'une
URL de production connue, acceptation des URLs locale/test/staging,
traitement sûr d'une URL malformée ou absente (jamais d'exception),
non-exposition des identifiants dans les messages, résolution
`process.env` puis `.env`. Vérification manuelle non destructive
supplémentaire : une cible de production simulée est bloquée (code de
sortie 1, aucun secret dans le message, commande jamais exécutée) ; une
cible sûre est correctement exécutée.

### Vérification
`tsc` 0 erreur · `lint` 0 warning · `vitest` unit **213/213** (203
précédents + 10 nouveaux) · `test:integration` **18 fichiers, 68/68**
(inchangé — `db:seed` de `db-test-reset.mjs` appelle `tsx` directement,
hors périmètre de cette garde, sans impact) · `build` OK ·
`test:e2e:isolated` **53 passed / 4 failed** — les 4 échecs
(`auth.spec.ts:12`, `marketplace-delivery.spec.ts:14`,
`tontine.spec.ts:22`, `tontine.spec.ts:37`) correspondent chacun
individuellement à une signature déjà documentée comme préexistante
dans `TICKET_CI_E2E_FAILURES.md` (dont `auth.spec.ts:12`, déjà vérifié
préexistant par comparaison A/B `git stash` en P0.5) ; aucun des
fichiers modifiés par ce lot n'est sur leur chemin de code.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, Payments, Tontines métier, Marketplace, KYC, AI,
authentification/sessions (P0.2), P0.3. Aucune donnée réelle supprimée
ou modifiée. Lot C (CSP/HSTS) reste hors périmètre. Base locale/dev
séparée explicitement non créée (décision validée : garde stricte
seule pour l'instant).

## [Non publié] — Phase 1 — P1.9 (Lot A) : Secrets & configuration — correctifs sûrs et additifs

Audit en lecture seule préalable (variables d'environnement, `.env*`,
workflows CI/CD, `next.config.js`, usages de `SUPABASE_SERVICE_ROLE_KEY`,
journalisation) — rapport complet présenté avant toute modification.
**Aucun secret n'a été trouvé committé** dans l'historique git (vérifié
en entier). Ce lot ne traite que les correctifs à risque de régression
quasi nul, validés explicitement ; le reste (environnement local isolé,
clé Supabase Storage à portée réduite, CSP/HSTS) reste hors périmètre.

### Corrigé
- **`images.remotePatterns` grand ouvert** (`next.config.js`,
  `{hostname:'**'}`) : la route framework `/_next/image` proxifiait
  n'importe quelle URL https fournie en paramètre, indépendamment de
  l'usage applicatif (SSRF/déni de service potentiel). Passé à `[]` —
  confirmé qu'aucune image distante n'est servie par l'app (KYC/
  avatars/marketplace passent par data-URI ou URLs signées Supabase).
- **Bloc `serverActions.allowedOrigins` inerte** retiré de
  `next.config.js` — confirmé 0 occurrence de `'use server'` dans tout
  le code, résidu de configuration sans usage.
- **Aucune rédaction des secrets dans les logs.** `lib/logger.ts` :
  nouvelle fonction `redact()` (+ application récursive à tout objet
  journalisé) qui masque les identifiants d'une chaîne de connexion
  (`scheme://user:pass@host` → `scheme://***@host`) et la valeur des
  champs `password`/`secret`/`token`/`apiKey`. Motivation concrète : une
  erreur Prisma de connexion peut embarquer `DATABASE_URL` (mot de passe
  compris) dans son message — sans rédaction, un incident DB transitoire
  pouvait faire fuiter le mot de passe vers les logs Vercel.
- **`scripts/db-backup.mjs`** : en cas d'échec de `pg_dump`,
  `e.message` (qui peut inclure la commande complète, donc
  `DATABASE_URL`) n'est plus journalisé — seul un message générique +
  le code de sortie le sont désormais.
- **Aucune garde contre `DEMO_MODE=1` en production.** Nouveau
  `lib/config/env.ts` : validation minimale (variables critiques
  signalées si absentes en production, sans bloquer) + blocage explicite
  d'une seule combinaison dangereuse — `DEMO_MODE=1` en
  `NODE_ENV=production` sans `ALLOW_DEMO_IN_PRODUCTION=1` (opt-in nommé,
  même convention que `E2E_RATE_LIMIT_BYPASS`). Ce module n'est pas
  câblé dans le cycle de démarrage de l'application dans ce lot (hors
  périmètre) — il est complet et testé, prêt à être importé.

### Tests
Nouveaux `lib/logger.test.ts` (3 tests) et `lib/config/env.test.ts`
(6 tests) — rédaction des chaînes de connexion et des champs sensibles,
blocage/autorisation de `DEMO_MODE` selon l'opt-in, non-blocage hors
production.

### Vérification
`tsc` 0 erreur · `lint` 0 warning · `vitest` unit **203/203** (194
précédents + 9 nouveaux) · `test:integration` **18 fichiers, 68/68**
(inchangé) · `build` OK · `test:e2e:isolated` **54 passed / 3 failed** —
les 3 échecs (`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:22`,
`tontine.spec.ts:37`) correspondent chacun individuellement à des
signatures déjà documentées comme préexistantes dans
`TICKET_CI_E2E_FAILURES.md` ; aucun fichier modifié par ce lot n'est sur
le chemin de code de ces tests (secrets/config vs. tontines/marketplace-
livraison) — non-régression confirmée.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, Payments, Tontines métier, Marketplace, KYC, AI,
P0.2 (sessions/tokens/cookies/refresh/révocation/`createSession`), P0.3.
Lot B (environnement local isolé, clé Supabase Storage à portée
réduite, nettoyage `.env.local`) et Lot C (CSP/HSTS) explicitement
laissés de côté — voir rapport pour le détail.

### Risques résiduels (nouveaux, propres à ce lot)
`lib/config/env.ts` n'est pas encore importé/câblé dans le cycle de
démarrage réel de l'application — la protection contre `DEMO_MODE=1` en
production n'est donc pas encore active tant qu'aucun point d'entrée ne
l'importe. Lot B et Lot C restent ouverts (voir audit initial).

## [Non publié] — Phase 1 — P1.7 : Concurrence Tontines (activation, adhésion, cron)

### Corrigé
- **Double activation d'une tontine** : `activateTontine()` lisait le
  statut hors verrou avant sa propre transaction (démarrage manuel
  organisateur + auto-activation au dernier membre pouvaient toutes deux
  passer avant qu'aucune n'écrive). Restructuré autour d'un `SELECT ...
  FOR UPDATE` sur la ligne tontine en tête de transaction (même schéma
  que le verrou de stock Marketplace, P0.4), statut et membres relus à
  l'intérieur du verrou.
- **Dépassement de `maxMembers` / collision de position à l'adhésion** :
  `POST /tontine/[id]/members` lisait le compte de membres et calculait
  la position hors verrou. Capacité et position désormais revérifiées
  dans la même transaction verrouillée que la création du membre.
- **Double exécution concurrente du cron** : `cron.yml` (GitHub Actions,
  horaire) et Vercel Cron (quotidien) appellent la même route sans
  coordination entre eux. Nouveau verrou consultatif Postgres
  `pg_try_advisory_xact_lock` (transaction-scoped — pas la variante
  session-scoped, dangereuse sous pooling de connexions) : un tick déjà
  en cours fait sortir le second appel en no-op tracé (`skipped: true`),
  jamais une erreur.

### Vérifié comme déjà protégé (aucun nouveau verrou ajouté)
`settleContribution()` (cotisation) et `checkAndAdvanceRound()`
(versement de fin de tour) utilisent déjà des clés d'idempotence Ledger
stables — même mécanique `@unique`/`P2002` que partout ailleurs. Un test
de concurrence réelle le prouve plutôt que de le supposer.

### Tests
Nouveau `test/integration/tontine-concurrency.itest.ts` (5 tests,
`Promise.all`, base réelle) : double démarrage manuel, adhésions
concurrentes sans dépassement, adhésions concurrentes dépassant la
capacité, double invocation du cron, preuve de non-régression sur la
cotisation. Rejoué 4× d'affilée avant intégration : 0 flakiness. Les 4
suites tontine préexistantes restent vertes sans modification.

### Vérification
`tsc` 0 erreur · `lint` 0 warning · `vitest` unit **194/194** (inchangé) ·
`test:integration` (`USE_TEST_DB=1`) **18 fichiers, 68/68** (5 nouveaux) ·
`build` OK · `test:e2e:isolated` **55 passed / 2 failed** — tally
identique à la référence de clôture P0.5, mêmes 2 échecs préexistants déjà
documentés, aucune régression. **Rapport complet** :
`docs/audit/P1_7_REMEDIATION_REPORT.md`.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, règles métier Payments, `settleContribution()`,
`checkAndAdvanceRound()`, P0.2, P0.3, Marketplace.

### Risques résiduels
Double requête d'adhésion strictement concurrente du **même** utilisateur
non couverte par le nouveau verrou (protège la capacité/position
collective, pas l'idempotence par utilisateur) — déjà sans risque
d'intégrité grâce à la contrainte `@@unique([tontineId, userId])`
existante, hors périmètre explicite de ce chantier. Détail complet dans
`P1_7_REMEDIATION_REPORT.md`.

## [Non publié] — Phase 0 — P0.5 : KYC / conformité / LAB-FT — audit et corrections ciblées

### Audit (contre le code actuel, pas seulement la documentation)
Chaque ligne de `docs/compliance/matrix.md` §3 (KYC/LAB-FT) vérifiée dans le
code. **Confirmé réel** : machine à états KYC (7 statuts), revue humaine
avec motif obligatoire **vérifié côté serveur**, accès aux pièces
strictement réservé à `COMPLIANCE_ROLES`, `fileUrl` jamais exposé hors
back-office conformité, plafonds par palier appliqués côté serveur, audit
complet, effacement RGPD qui conserve le dossier (preuve LAB-FT) tout en
supprimant les pièces, rétention KYC jamais auto-purgée, modules
réglementés (Invest/Insurance/Loans) toujours désactivés.

**2 écarts réels trouvés entre la documentation et le code** :
- Le stub de screening sanctions/PPE (`lib/kyc/screening.ts`) n'est **appelé
  nulle part** — pas même branché pour poser un drapeau, contrairement à ce
  que le document décrivait.
- La page `/profile/kyc` ne disait nulle part à l'utilisateur que la
  vérification est un contrôle interne, pas une vérification d'identité
  réglementaire (pas de liveness, pas de screening réel) — contraste avec
  `/insurance`/`/tontine/garantie` qui ont déjà ce type de bandeau.

**Manquant confirmé** : la transition de statut `EXPIRED` est définie dans
le schéma et a une branche d'affichage côté client, mais **rien ne la
déclenche jamais** — dead code, pas une fonctionnalité cassée.

**Comportement réel notable trouvé pendant la vérification finale** :
soumettre un document KYC alors que le compte est déjà `VERIFIED`
rétrograde silencieusement `kycStatus` → `IN_PROGRESS` (perte du palier),
sans chemin automatique de retour à `VERIFIED` — comportement du code réel
(`POST /api/v1/kyc/documents`), pas un bug d'infra. Décision de politique
KYC non tranchée ici (voir Risques résiduels) ; seul son effet de bord sur
les tests E2E a été corrigé.

### Corrigé
- **Plafond KYC ajouté à la commande Marketplace** (mode WALLET) : un
  compte non vérifié pouvait dépenser sans aucun plafond via un achat
  marketplace, contrairement à `wallet/transfer`/`payments` qui appellent
  déjà `checkOutboundLimit`. `SALE_PAYMENT` ajouté à `OUTBOUND_TYPES`
  (`lib/kyc/limits.ts`) pour que l'agrégation mensuelle compte bien ces
  achats (sinon contournable par achats répétés sous le plafond unitaire).
- **Bandeau de transparence ajouté sur `/profile/kyc`** (FR + EN) — même
  motif déjà utilisé par `/tontine/garantie`/`/insurance`, appliqué à un
  endroit qui en manquait. Précise : contrôle interne, pas réglementaire ;
  pas de liveness ni de screening habilité ; ces contrôles seront intégrés
  avant activation de tout service financier réel.
- **Pollution d'état E2E révélée par le correctif ci-dessus** (test
  uniquement, aucun code applicatif) : `kyc-pin-admin.spec.ts` faisait
  perdre à Ama (SEED.ama) son palier KYC 2 sans jamais le restaurer,
  cassant `marketplace-delivery.spec.ts` maintenant que le plafond KYC y
  est vérifié. Corrigé en restaurant explicitement son statut via la
  revue admin existante (`PATCH /admin/kyc/[id]`) après le test.

### Délibérément non fait (pour ne pas créer de fausse conformité)
Screening sanctions/PPE non câblé (le brancher sur une liste locale
factice donnerait l'illusion d'un filtrage réel) ; transition `EXPIRED` non
implémentée (exigerait une politique de péremption à définir avec la
conformité, hors portée d'une correction technique) ; rétrogradation
`VERIFIED → IN_PROGRESS` à la resoumission non modifiée (décision produit/
conformité, pas un bug technique évident).

### Vérification
`tsc` 0 erreur · `lint` 0 warning · `vitest` unit **194/194** (inchangé) ·
`test:integration` (`USE_TEST_DB=1`) **17 fichiers, 63/63** (3 nouveaux,
`marketplace-kyc-limits.itest.ts` — dont un test dédié confirmant que les
achats marketplace sont bien agrégés dans le plafond mensuel) · `build` OK
· `test:e2e:isolated` **55 passed / 2 failed** sur 57 — les 2 échecs
(`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:37`) reproduisent des
signatures d'erreur préexistantes et déjà documentées, sans lien avec
P0.5 (détail `TICKET_CI_E2E_FAILURES.md`). Un 3ᵉ symptôme observé en cours
de route (`auth.spec.ts:12`) a été vérifié par comparaison A/B rigoureuse
(`git stash`, 4 runs de chaque côté) : préexistant, confirmé sans lien
avec P0.5. **Rapport complet** : `docs/audit/P0_5_REMEDIATION_REPORT.md`.
`docs/compliance/matrix.md` §3 mis à jour ligne par ligne.

### Hors périmètre (confirmé non touché)
`lib/ledger/ledger.service.ts`, Wallet, Escrow, règles Payments, Tontines,
flux de capture KYC lui-même (seul un bandeau de copie ajouté, le
comportement de rétrogradation n'a pas été modifié), P0.2, P0.3.
Marketplace touché uniquement pour la dépendance indispensable justifiée
(plafond KYC) — aucune règle métier modifiée.

### Risques résiduels
Screening sanctions/PPE et liveness toujours absents (bloquants déjà
documentés avant activation de services financiers réels — désormais
disclosés à l'utilisateur pour le second) ; `EXPIRED` non implémenté ;
valeurs de plafonds non calées sur la réglementation réelle ; déclaration
de soupçon/gel des avoirs à définir ; rétrogradation silencieuse
`VERIFIED → IN_PROGRESS` à la resoumission d'un document, à trancher
explicitement ; `auth.spec.ts:12` (déconnexion) flaky préexistant
caractérisé mais non résolu. Détail complet dans
`P0_5_REMEDIATION_REPORT.md`.

## [Non publié] — Phase 0 — P0.4 : Marketplace — idempotence et prévention des doubles opérations

### Sécurité / fiabilité
- **Clé d'idempotence retry-unsafe corrigée** : `POST /api/v1/marketplace/[id]/order`
  dérivait sa clé ledger de `Date.now()` — changeait à chaque appel, donc
  un rejeu réseau ou un double-clic échappant à la garde d'interface
  produisait un **second débit réel**, non détecté comme doublon. Étend à
  Marketplace la convention `Idempotency-Key` déjà établie pour
  `wallet/transfer`/`tontine/contribute` (ADR 0007 §3) — pas un nouveau
  pattern. Nouveau champ `MarketplaceOrder.idempotencyKey` (`@unique`,
  migration) : un rejeu avec la même clé renvoie la commande existante sans
  retraiter paiement ni stock.
- **Stock verrouillé sous transaction** (`SELECT ... FOR UPDATE` sur
  `marketplace_items`, mirroir du pattern déjà utilisé par `lockWallets`
  dans le Ledger) : deux acheteurs concurrents du dernier exemplaire ne
  peuvent plus tous les deux réussir. Si le paiement a déjà réussi quand le
  stock s'avère épuisé sous verrou, **remboursement immédiat** (reversal
  symétrique via `postDoubleEntry`, mirroir du reversal de
  `wallet/transfer`) — l'acheteur reçoit un `409` explicite, jamais un
  solde débité sans commande.
- Course sur la création de commande elle-même (deux requêtes strictement
  concurrentes, même clé) : la requête perdante bute sur la contrainte
  d'unicité, interceptée pour renvoyer la commande de la requête gagnante
  (`200`) au lieu d'un `500`. Idem en mode TONTINE — aucune tontine
  orpheline possible (toute la transaction, y compris la tontine, est
  annulée pour la requête perdante).
- Câblage client (`hooks/useMarketplace.ts`, `item-client.tsx` — clé
  générée à la confirmation, conservée si l'appel échoue, effacée après
  succès —, `cart-client.tsx` — clé fraîche par unité achetée) pour que la
  protection soit réellement effective, pas seulement disponible côté
  serveur.

### Audit préalable (avant toute modification)
Confirmé déjà sains et **non modifiés** : `postDoubleEntry` (Ledger) gère
déjà la course entre appels concurrents via contrainte `@unique` + capture
`P2002` ; `releaseEscrowToSeller`/`refundEscrowToBuyer` ont déjà des clés
stables et une garde de statut ; `confirmDelivered` a déjà une garde de
statut terminal.

### Vérification
- `tsc` 0 erreur · `lint` 0 warning · `vitest` unit **194/194** (inchangé)
  · `test:integration` (`USE_TEST_DB=1`) **16 fichiers, 60/60** (7
  nouveaux, `marketplace-order-idempotency.itest.ts` — dont 2 tests de
  **concurrence réelle** via `Promise.all` : rejeu concurrent avec la même
  clé → une seule commande créée ; deux acheteurs concurrents du dernier
  exemplaire → un seul réussit, l'autre remboursé, stock jamais négatif) ·
  `build` OK.
- `test:e2e:isolated` : voir le commit de clôture.
- **Rapport complet** : `docs/audit/P0_4_REMEDIATION_REPORT.md`.
  `SECURITY_REMEDIATION_REPORT.md` mis à jour.

### Hors périmètre (confirmé non touché)
`lib/ledger/ledger.service.ts` (Ledger), règles fondamentales du Wallet,
`lib/marketplace/escrow.ts` (déjà sain), règles métier Payments, Tontines
métier, KYC, IA, P0.2 (Auth), P0.3 (Webhooks).

### Risques résiduels
Panier : les clés d'idempotence par unité ne sont pas persistées entre
rechargements de page (protection efficace contre le rejeu réseau
automatique et un double appel rapproché, pas contre un abandon-puis-
nouvelle-tentative après fermeture de l'onglet — jugé disproportionné à
corriger vu le risque réel résiduel) ; notification vendeur en double sous
concurrence sur l'escrow (cosmétique, déjà documenté en P0.2/P0.3, aucun
impact financier). Détail complet dans `P0_4_REMEDIATION_REPORT.md`.

## [Non publié] — Phase 0 — P0.3 : Webhooks sécurisés (signature + horodatage + idempotence stricte)

### Sécurité
- **Fail-open supprimé sur les 2 webhooks entrants** (`payments/webhooks/[provider]`,
  `marketplace/deliveries/webhooks/miaride`) : `if (!secret) return true`
  acceptait toute requête non signée quand le secret n'était pas configuré
  — **et il ne l'était nulle part** (ni CI, ni staging, ni local), rendant
  le crédit de wallet ou le changement de statut de livraison forgeables
  sans authentification sur le déploiement réel. Remplacé par un
  comportement fail-closed en production (réplique le pattern déjà
  approuvé de `cron/tontine-tick`).
- **Nouveau format de signature** `t=<horodatage>,v1=<HMAC-SHA256>`
  (`lib/webhooks/verify.ts`, pattern Stripe/GitHub) : lie authenticité +
  intégrité (HMAC sur le corps) + horodatage en un seul mécanisme, fenêtre
  de tolérance anti-rejeu de 5 min.
- **Idempotence stricte au niveau transport** (`WebhookEvent`, nouveau
  modèle + migration) : clé de dédup `@@unique`, insertion atomique — un
  rejeu exact du même événement signé ne peut jamais être retraité deux
  fois, en plus de l'idempotence métier déjà en place (Ledger `PAYTX_<id>`,
  garde de statut `MarketplaceDelivery`) qui reste inchangée.

### Ajouté
- `lib/webhooks/verify.ts` + `lib/webhooks/journal.ts` (nouveau, mutualisé
  entre les 2 endpoints).
- `WebhookEvent` (migration `20260916090943_p0_3_webhook_events`) : journal
  d'audit/dépannage de chaque requête reçue (vérifiée ou non, traitée ou
  rejetée).

### Vérification
- `tsc` 0 erreur · `lint` 0 warning · `vitest` unit **194/194** (12
  nouveaux, `verify.test.ts`) · `test:integration` (`USE_TEST_DB=1`) **16
  fichiers, 62/62** (9 nouveaux, `webhook-security.itest.ts` — signature
  absente/invalide/expirée → rejet sans effet ; signature valide → effet
  métier réel ; **rejeu du même événement → idempotent, zéro double
  crédit/libération**) · `build` OK.
- `test:e2e:isolated` **55/57** — les **8 nouveaux tests**
  (`webhook-security.spec.ts`, vrai serveur `next start`) passent tous ;
  les 2 échecs restants sont la flakiness pré-existante déjà documentée
  (sans rapport avec ce travail).
- Audit préalable confirmé : **zéro test et zéro code interne n'appelaient
  ces routes avant P0.3** → correctif sans aucun risque de régression sur
  l'existant.
- **Rapport complet** : `docs/audit/P0_3_REMEDIATION_REPORT.md`.
  `SECURITY_REMEDIATION_REPORT.md` mis à jour.

### Modifié (config de test, pas un workflow CI/CD)
- `playwright.config.ts` (`webServer.env`) : ajout de secrets de test
  `PAYMENT_WEBHOOK_SECRET`/`MIARIDE_WEBHOOK_SECRET` (valeurs fixes, sans
  rapport avec un secret réel) — nécessaire pour que les tests E2E puissent
  exercer la vérification de signature réussie, pas seulement le rejet.
  Aucun fichier `.github/workflows/*.yml` modifié.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, règles métier Payments/Tontines/Marketplace, KYC, IA.
`settlePendingPayment`/`settleOnDelivery`/`refundEscrowToBuyer` inchangés —
seule la couche transport (vérification + dédup) a été ajoutée en amont.

### Risques résiduels
Pas de restriction IP par allowlist (non demandée, HMAC jugé suffisant sans
fournisseur réel connecté) ; pas de route de rejeu admin (non demandée) ;
fenêtre anti-rejeu fixe à 5 min ; `WebhookEvent` ne persiste pas le corps
brut (choix délibéré). Détail complet dans `P0_3_REMEDIATION_REPORT.md`.

## [Non publié] — Phase 0 — P0.2 : Sessions/Tokens/Auth (cookies HttpOnly + collision Session.token)

### Sécurité
- **Cookies HttpOnly côté serveur** (`lib/auth/cookies.ts`, nouveau) : les
  tokens ne sont plus posés par le JavaScript du navigateur.
  `kessia-access-token` (15 min) et le nouveau `kessia-refresh-token`
  (`Path=/api/v1/auth/refresh` uniquement, 30 j) sont `HttpOnly` +
  `SameSite` + `Secure` (dérivé du protocole réel de la requête, pas de
  `NODE_ENV`). **Le refresh token — le risque le plus grave (30 j de
  validité) — ne transite plus jamais par le JS**, ni en réponse JSON ni en
  `localStorage` : corrige le finding CRITIQUE #2 de l'audit prod-readiness.
- **Correction de la collision `Session.token`** (bug réservé depuis P0.0) :
  la table stockait le JWT signé lui-même comme clé `@unique` ; deux
  connexions du même utilisateur dans la même seconde produisaient un JWT
  identique (HMAC déterministe) → violation de contrainte → **500** sur
  `login`/`refresh`. Remplacé par un `jti` aléatoire (migration
  `20260915105735_session_jti_revocation`) + colonne `revokedAt` (révocation
  douce, ligne conservée pour audit).
- **Révocation de session effective immédiatement** : `withAuth` vérifie
  désormais la session en base (`jti`/`revokedAt`), plus seulement la
  signature JWT — logout, changement de mot de passe et suspension admin
  invalident la session sans attendre l'expiration naturelle (15 min).
- **Détection de réutilisation de refresh token** (signal OWASP de vol de
  token) : `rotateRefreshToken` révoque l'ancienne ligne et en crée une
  nouvelle à chaque rotation ; la présentation d'un refresh token déjà
  révoqué révoque **toutes** les sessions de l'utilisateur + audit
  `auth.refresh_reuse_detected` + notification `SECURITY` priorité
  `CRITICAL`.
- `store/authStore.ts` : `accessToken` reste en mémoire (pour l'en-tête
  `Authorization` de `apiClient`) mais n'est plus persisté en
  `localStorage` ; `refreshToken` retiré du store. Nouveau
  `components/auth/AuthBootstrap.tsx` : échange le cookie de refresh contre
  un access token frais au chargement d'un onglet.

### Corrigé (3 bugs E2E réels découverts en vérifiant le nouveau flux cookies)
1. `e2e/helpers.ts::loginViaApi` utilisait le fixture `request` (isolé, ne
   partage pas les cookies avec le navigateur) au lieu de `context.request`.
2. `secure` sur les cookies dérivé de `NODE_ENV` au lieu du protocole réel —
   cassait l'auth locale (`next start` = `NODE_ENV=production` sur HTTP simple).
3. `context.setExtraHTTPHeaders({ Authorization })` figé au login dans les
   E2E entrait en conflit avec la rotation de token (chaque rotation révoque
   l'ancien token, mais l'en-tête Playwright figé continuait de le
   présenter) → 401 permanent après le 1ᵉʳ rechargement de page.

### Vérification
- `tsc` 0 erreur · `lint` 0 warning · `vitest` unit **182/182** ·
  `test:integration` (`USE_TEST_DB=1`) 14 fichiers **44/44** (nouveau
  `session-security.itest.ts`, 8 tests reproduisant le bug original par
  créations de session concurrentes) · `build` OK.
- `test:e2e:isolated` **47/49** (vs 46/49 avant P0.2). Les 2 échecs restants
  (`marketplace-delivery.spec.ts:14`, `tontine.spec.ts:37`) confirmés
  **sans rapport avec l'authentification**, documentés dans
  `docs/audit/TICKET_CI_E2E_FAILURES.md`.
- **CI GitHub Actions vérifié run par run** (pas la vue liste, connue peu
  fiable) : `ci.yml` ✓, `integration.yml` ✓, `staging.yml` ✓ (migrate 2m47s
  + deploy 2m35s), `e2e.yml` 47 passed/2 failed/0 flaky (les 2 échecs
  confirmés étrangers à l'auth). `/api/health` staging vérifié en direct.
- **Preuve empirique du root-cause** : avant le correctif, `e2e.yml`
  montrait 13-16 tests flaky avec `login → 500` sur 3 runs consécutifs
  (dont un antérieur à P0.1) ; après, **0 flaky**, symptôme disparu.
- **Rapport complet** : `docs/audit/P0_2_REMEDIATION_REPORT.md`.
  `docs/audit/SECURITY_REMEDIATION_REPORT.md` mis à jour.

### Hors périmètre (confirmé non touché)
Ledger, Wallet, Escrow, Payments, Tontines métier, Marketplace métier, KYC
métier, IA. Aucun workflow CI/CD modifié.

### Risques résiduels
Rotation de refresh token non strictement idempotente sous concurrence
(choix assumé, risque bénin) ; `accessToken` en mémoire reste lisible par un
XSS actif (le refresh token, risque le plus grave, est lui hors d'atteinte
du JS) ; `tontine.spec.ts:22`/`:37` et `marketplace-delivery.spec.ts:14`
restent ouverts dans le ticket CI dédié (hors périmètre P0.2). Détail complet
dans `P0_2_REMEDIATION_REPORT.md`.

## [Non publié] — Phase 0 — P0.1 : Next.js 14.2.5 → 15.5.24 (2 RCE critiques corrigées)

### Sécurité
- **`next` 14.2.5 → 15.5.24.** Le plan initial visait `14.2.35` (dernier
  patch 14.x), mais l'audit a montré que **deux RCE critiques non
  authentifiées** (`GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`) restent non
  corrigées sur **toute** la branche 14.x — correctif uniquement à partir de
  `15.5.24`/`16.3.3`. Exception explicitement autorisée par l'utilisateur,
  cible fixée précisément à `15.5.24` (**pas** Next 16). Corrige aussi le
  contournement d'autorisation middleware `GHSA-f82v-jwr5-mffw`.
- `postcss` (pin interne obsolète de `next`) forcé à `^8.5.23` via
  `overrides` npm — élimine son CVE sans migration générale de dépendances.
- `npm audit` : **15 vulnérabilités (2 critiques) → 8 (0 liée à Next.js)**.
  Les deux identifiants CVE ciblés vérifiés **absents** de la sortie JSON
  complète (pas seulement absence dans le résumé). Résiduel = 8
  devDependencies (`eslint-config-next`/`glob` → nécessite Next 16 ;
  `vitest`/`vite`/`esbuild` → nécessite vitest 5.x majeur), **0 exposition
  runtime**.

### Supprimé (dépendances mortes, 0 usage vérifié par `Grep` exhaustif)
- `next-auth` (jamais importé — l'auth de KESSIA est maison, `lib/auth/*` +
  `jose`).
- `uuid` / `@types/uuid` (jamais importés — `lib/utils/crypto.ts` utilise
  déjà `crypto.randomUUID()` natif).

### Modifié (breaking change Next 15 — Async Request APIs)
- `params`/`searchParams` (pages, layouts, routes API) et `cookies()`
  deviennent asynchrones sous Next 15. **48 fichiers** migrés via le codemod
  officiel `@next/codemod next-async-request-api` (46 routes/pages à segment
  dynamique + `lib/i18n/server.ts`, ce dernier via l'échappatoire officielle
  `UnsafeUnwrappedCookies` pour ne pas déclencher un refactor async en
  cascade sur 9 fichiers appelants — dette technique documentée). Aucune
  logique métier modifiée (diff proportionné : 180 insertions / 136
  suppressions). 1 faux positif du codemod corrigé à la main
  (`app/api/v1/me/route.ts`, ré-export sans paramètre dynamique).
- `eslint-config-next` `14.2.5 → 14.2.35` (alignée sur la branche 14.x
  utilisée par `next lint`, pas de bump vers une version liée à Next 16).

### Vérification
- `tsc` : 0 erreur. `next lint` : 0 warning. `vitest` (unit) : **182/182**.
  `test:integration` (base jetable, `USE_TEST_DB=1`) : 13 fichiers, **36/36**.
  `build` : OK (67/67 pages). `test:e2e:isolated` : **46/49** — les 3 échecs
  documentés comme flakiness d'infrastructure de test pré-existante,
  **indépendante de la version Next.js** : comparaison contrôlée A/B sur 4
  runs complets (3× Next 15, 1× Next 14.2.5 via `git stash`) montre à chaque
  fois 1 à 3 échecs différents et non reproductibles sur **les deux**
  versions ; le test suspecté initialement (« accent Violet ») relancé 5×
  d'affilée en isolation → 5/5 réussites. Aucune régression introduite.
- **CI GitHub Actions** (commits de cette phase) : `ci.yml` ✓, `integration.yml`
  ✓, `staging.yml` ✓ (migrate 1-2 min + deploy 1-2 min, `/api/health` vérifié
  en direct). `e2e.yml` : **en échec** (2 failed déterministes
  `tontine.spec.ts:22`/`:37` + 13-16 flaky, `login → 500` sur le Postgres
  service container éphémère de CI) — **confirmé pré-existant** : le même
  run sur `3786926` (clôture P0.0, avant tout changement P0.1) montre
  exactement le même résultat. Non introduit par cette migration, non
  corrigé ici (hors périmètre), ticket dédié recommandé.
- Déploiement `kessia-staging` + smoke tests : voir le commit de clôture.
- **Rapport complet** : `docs/audit/P0_1_REMEDIATION_REPORT.md`.
  `docs/audit/SECURITY_REMEDIATION_REPORT.md` créé (document vivant,
  consolide P0.1 → P0.5).

### Hors périmètre (confirmé non touché)
Sessions/tokens/`createSession`/refresh/cookies d'auth/révocation (réservé à
P0.2, y compris le bug de collision `Session.token`), RBAC métier, Ledger,
Wallet, séquestres, paiements, Tontines, Marketplace, KYC, IA.

## [Non publié] — Phase 0 — P0.0 : A + B + C validés (staging réel opérationnel)

### Ajouté
- Environnement staging réel et isolé, entièrement provisionné : projet
  Vercel `kessia-staging` (Root Directory `kessia-app`, Deploy Hook),
  projet Supabase `kessia-staging` (région `eu-west-1`, 3 buckets privés),
  GitHub Environment `staging` (5 secrets + 1 variable non secrète
  `STAGING_SUPABASE_PROJECT_REF`), 10 variables Vercel. Aucune donnée
  réelle, aucune transaction financière réelle.
- `staging.yml` : job `migrate` (`prisma migrate deploy` + `migrate status`
  + seed) exécuté avant `deploy`, avec garde anti-production à 2 niveaux et
  échec explicite (pas de skip silencieux) si un secret obligatoire manque.

### Corrigé (3 bugs de configuration réels, découverts en conditions réelles)
1. `prepared statement "sXX" does not exist` sur `/api/v1/wallet` —
   incompatibilité Prisma/PgBouncer en mode transaction sous requêtes
   parallèles → ajout de `?pgbouncer=true&connection_limit=1` à
   `DATABASE_URL` (Vercel).
2. Identifiants invalides après rotation du mot de passe de la base
   staging → chaîne de connexion régénérée intégralement depuis Supabase
   plutôt que retapée à la main.
3. `?` manquant avant `pgbouncer=true` (paramètres lus comme faisant partie
   du nom de la base) + confusion entre pooler session (5432, pour les
   migrations) et pooler transaction (6543, pour le runtime) sur
   `STAGING_DATABASE_URL` → causait un timeout de 10 min sur `migrate
   deploy`. Corrigé.

### Vérification finale
- **A** : `integration.yml`/`e2e.yml` appliqués et vérifiés sur GitHub
  Actions — `migrate deploy` + `migrate status` réels, verts.
- **B** : inchangé, déjà validé (PostgreSQL 16 local jetable).
- **C** : run [`Staging #69`](https://github.com/essotakougnadi-arch/kessia/actions/runs/34838620490)
  **Success** — `migrate` 1m51s, `deploy` 1m57s, **smoke tests 9/9**
  (health, accueil, marketplace, RBAC 401/403, login, Wallet, Ledger,
  Tontines). Confirmé stable sur 3 exécutions supplémentaires hors CI.
- **A + B + C validés avec preuve réelle.** P0.0 proposé comme terminé.

## [Non publié] — Phase 0 — P0.0 : staging.yml fail-hard + finding session

### Modifié
- `staging.yml` : correction demandée — plus aucun skip silencieux. Un
  secret obligatoire absent (`STAGING_DATABASE_URL`, ou l'un des 4 requis
  par `deploy`) fait désormais **échouer** le job (`::error::` + `exit 1`)
  au lieu de sauter ses étapes en rapportant un succès. Garde anti-prod
  renforcée à deux niveaux : liste noire (référence prod) + liste blanche
  positive optionnelle via la variable non secrète
  `STAGING_SUPABASE_PROJECT_REF`. 5 scénarios testés localement.

### Vérification (checklist complète avant application manuelle de A)
- `tsc` : 0 erreur. `lint` : 0 warning. `vitest` : 182/182.
  `test:integration` (base jetable, `USE_TEST_DB=1`) : 13 fichiers, 36/36.
  `build` : OK. YAML des 3 fichiers : syntaxe valide. `grep "db push"` :
  0 commande restante (seulement des commentaires).
- `test:e2e:isolated` : **finding réel découvert et root-causé** (pas de
  la flakiness) — `lib/auth/session.ts::createSession` stocke le JWT
  d'accès comme `Session.token` (`@unique`) ; `jwt.sign()` est
  déterministe à `iat` égal (granularité seconde), donc deux connexions
  du même utilisateur dans la même seconde produisent un JWT identique et
  violent la contrainte d'unicité → 500 non rattrapé. Reproduit
  directement (15/20 requêtes en rafale → 500). Hors périmètre A/C, non
  corrigé ici (candidat naturel pour P0.2 — Sessions/tokens).
- Push de A retenté après validation complète : refusé, identique aux
  tentatives précédentes (scope `workflow`).

## [Non publié] — Phase 0 — P0.0 : validations A/C dédiées (CI + staging)

### Ajouté
- `docs/audit/P0_0_A_CI_MIGRATION_VALIDATION.md` — garde anti-prod (`DATABASE_URL`
  jamais un hôte Supabase, testée sur 4 URLs), test positif (`migrate deploy`
  réel sur Postgres jetable), **test négatif** (migration invalide →
  `exit 1`, erreur P3018, `migrate status` confirme l'échec) ; étapes CI
  `integration.yml`/`e2e.yml` enrichies (garde + `migrate status` explicite).
  État : mécanisme prouvé, push GitHub toujours bloqué (scope `workflow`).
- `docs/audit/P0_0_C_STAGING_MIGRATION_VALIDATION.md` — constat vérifié
  (aucun staging, Vercel CLI sans session) ; `scripts/smoke.mjs` enrichi
  (Marketplace, RBAC 401/403, Ledger) et **testé réellement** contre
  l'application démarrée sur la base migrée de la validation B (9/9) ;
  checklist précise de provisionnement (aucun secret demandé dans le chat).

### Vérification
- Garde anti-prod : 4/4 cas corrects (2 URLs prod bloquées, 2 URLs CI/locales autorisées).
- Test négatif : `prisma migrate deploy` → exit 1 (P3018) ; `prisma migrate status` → exit 1, migration listée « failed ». Base et schéma de test supprimés après usage.
- `smoke.mjs` : 9/9 checks verts contre l'app réelle sur base fraîchement migrée + seedée.
- `tsc`/`lint` : 0 erreur/warning après ces changements.

## [Non publié] — Phase 0 (durcissement production) — P0.0 : migrations Prisma versionnées (ADR 0048)

### Ajouté
- `prisma/migrations/0_init/` — baseline versionnée générée depuis le schéma
  actuel (44 tables, 45 enums), exclusivement `CREATE`/`ALTER … ADD
  CONSTRAINT`, aucune instruction destructive.
- Script `db:migrate:deploy` (`prisma migrate deploy`), à utiliser sur toute
  base partagée (démo, à terme staging/prod).
- `docs/audit/DATABASE_MIGRATION_PLAN.md` — procédure de création de
  migration, baselining de la base de démo, migrations destructives,
  rollback.
- `docs/audit/PHASE0_EXECUTION_PLAN.md` — plan d'exécution détaillé des 20
  actions de remédiation de l'audit du 2026-09-10.
- `docs/audit/PRODUCTION_HARDENING_REPORT.md` — rapport vivant, mis à jour à
  chaque étape de la Phase 0.

### Modifié
- `.github/workflows/integration.yml`, `.github/workflows/e2e.yml` :
  `prisma db push --skip-generate` → `prisma migrate deploy` (Postgres
  éphémère de CI — valide à chaque run que la baseline s'applique
  proprement).
- `scripts/db-test-reset.mjs` : `prisma db push --force-reset` →
  `prisma migrate reset --force` (garde-fou anti-démo inchangé).
- `README.md`, `docs/development/testing.md` : `db push` réservé au
  prototypage local jetable ; `migrate deploy` sur les bases partagées.

### Vérification
- `tsc --noEmit` : 0 erreur. `lint` : 0 warning. `vitest` (unitaires) :
  **182/182** verts. `test:integration` (contre la base réelle) :
  **36/36** verts (13 fichiers — ledger, transferts+reversal, séquestres
  tontine, séquestre marketplace, RBAC, inscription, plafonds KYC).
  `npm run build` : compilé sans erreur.
- `prisma migrate diff --from-url <base réelle> --to-schema-datamodel`
  (lecture seule) : migration **vide** — la baseline `0_init` correspond
  exactement à l'état réel de la base, aucune dérive.
- Snapshot d'intégrité avant/après la suite d'intégration : 0 séquestre
  tontine déséquilibré, 0 clé d'idempotence dupliquée, 0 ligne orpheline,
  0 résidu de test non nettoyé. 1 écart isolé relevé sur le wallet système
  `MARKETPLACE_ESCROW` — tracé à un défaut de nettoyage **pré-existant**
  de `test/integration/marketplace-settlement.itest.ts` (non causé par
  P0.0, aucune perte financière — le solde réel reste correct, seul
  l'historique ledger de ce wallet partagé est incomplet). Non corrigé
  ici (hors périmètre migrations) — détail et recommandation dans
  `docs/audit/PRODUCTION_HARDENING_REPORT.md` §P0.0.
- **Preuve B (base jetable) apportée intégralement** : PostgreSQL 16 installé
  localement (`winget`), cluster isolé via `initdb` (port 5433, hors service
  Windows), base `kessia_p0_test` séparée de la démo/prod. `migrate deploy`
  depuis zéro → succès, schéma vérifié (45 tables, ~45 enums, 113 index, 57
  FK), seed représentatif chargé sans erreur, `db:test:reset` (le script
  modifié par ce commit) validé en conditions réelles, `test:e2e:isolated`
  exécuté 3× (49 tests) — seuls échecs : fragilité de locator Playwright
  pré-existante (toast vs liste), aucun rapport avec le schéma/la migration/
  une donnée financière. Intégrité finale : 0 écart Ledger/Wallet/séquestre/
  idempotence. Instance arrêtée proprement, données conservées.
- **A (CI) et C (staging) restent bloqués**, non contournés : le commit CI
  (`db push` → `migrate deploy`) reste refusé au push (scope `workflow`
  manquant, aucune régénération tentée) ; aucun environnement staging
  n'existe (Vercel CLI sans session, aucune infra provisionnée — objet de
  P1.9). **Verdict : P0.0 NON VALIDÉ — P0.1 BLOQUÉ.** Détails dans le
  rapport de durcissement.
- Base de démo partagée **non encore baselinée** — procédure documentée,
  à exécuter par l'opérateur avant la première migration de schéma réelle
  (P0.2).

## [Non publié] — Audit visuel : correctifs concrets

### Corrigé
- Le bouton flottant « KESSIA AI » de la barre mobile s'affichait aussi
  sur `/ai`, où il recouvrait le bouton d'envoi et la mention du bas —
  masqué sur cette route (`BottomNav`).
- Carte « Ajouter une activité » (`/business`) : emoji 🏪 → icône Lucide
  colorée, cohérente avec le reste de la page.

## [Non publié] — Traduction éwé (ADR 0047)

### Ajouté
- `lib/i18n/messages/ee.ts` étendu au vocabulaire d'interface de l'espace
  membre : titres de sections, boutons, états, statuts, onglets, champs
  courts pour accueil / wallet / tontines (+ détail, découverte,
  adhésion, demandes) / marketplace / agenda / plan de croissance /
  simulateurs / score / préférences de notification / support / profil /
  connexion. Orthographe standard Eʋegbe.
- Restent en français (fallback, relecture native requise) : statuts KYC
  détaillés, prose juridique, mécanique financière, messages d'erreur
  nuancés, descriptions et avertissements longs, réponses IA, back-office.
  `LOCALE_META.ee.ready` reste `false`.

### Vérification
- `vitest` (**182**) — `catalogs.test.ts` + `core.test.ts` verts.

## [Non publié] — KESSIA AI : LLM optionnel + finitions (ADR 0046)

### Ajouté
- **Branchement optionnel d'un vrai LLM** pour l'assistant (`lib/ai/llm.ts`).
  Reste OFF par défaut : ne s'active qu'avec `ANTHROPIC_API_KEY` +
  `KESSIA_AI_LLM="1"`. Traite uniquement la « longue traîne » (questions
  non couvertes par les données ni la base de connaissances), fortement
  cadré (pas de chiffre inventé, pas de promesse de rendement, français,
  4 phrases). Source `llm` tracée dans les KPI §54. `@anthropic-ai/sdk`
  ajouté (dormant). Voir `.env.example` pour le compromis de coût.
- Specs E2E des zones peu couvertes : `e2e/kyc-pin-admin.spec.ts`
  (upload KYC, cas limites du PIN, écritures back-office + garde-fou
  `erase`).

### Corrigé
- `/ai` : avertissement d'hydratation sur les boutons Voix / Effacer
  (`hooks/useVoice.ts` — détection de fonctionnalité après montage).
- Dette CSS : couleurs sémantiques (erreur, or) des pages d'auth passées
  sur jetons `--color-*` (l'identité visuelle des dégradés de marque est
  conservée volontairement).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**182**) + `build` OK ;
  `kyc-pin-admin.spec.ts` (4) + `navigation.spec.ts` au vert.

## [Non publié] — Livraison marketplace : extensions (ADR 0045)

### Ajouté
- **Paiement du vendeur à la confirmation de réception (séquestre)** —
  le vendeur choisit `IMMEDIATE` ou `ON_DELIVERY` à la mise en vente.
  En séquestre : fonds acheteur → wallet plateforme, versés au vendeur à
  la confirmation de réception (ou d'office après 14 j) ; remboursés à
  l'acheteur si la livraison est annulée avant enlèvement.
  `lib/marketplace/escrow.ts`, `WalletKind.MARKETPLACE_ESCROW`.
- **Carnet d'adresses de livraison** — `model DeliveryAddress` + CRUD
  `/api/v1/marketplace/addresses`. La modale de livraison propose les
  adresses enregistrées / en ajoute une.
- **Livraison depuis le panier, une par vendeur** — après paiement, les
  commandes sont regroupées par vendeur ; une course Miaride couvre
  plusieurs articles (`MarketplaceDelivery.extraOrderIds`).
- **Livraison différée pour l'achat par tontine** — statut `SCHEDULED` :
  adresse enregistrée, aucun débit, activable à la fin du plan d'épargne.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**178**) + `build` OK.
  `marketplace-settlement.itest.ts` (2) + `marketplace-delivery.spec.ts`
  (+2) au vert.

## [Non publié] — Base de test isolée pour les E2E (ADR 0044)

### Ajouté
- **Base de test dédiée** : `.env.test` (gitignoré, `.env.test.example`
  fourni) + `npm run db:test:reset` (schéma neuf `--force-reset` + seed,
  refuse de tourner sur la base de `.env.local`) + `npm run
  test:e2e:isolated`. `playwright.config.ts` injecte cette base dans le
  serveur de test et n'y réutilise jamais un serveur branché sur la démo.
- Tests d'intégration : `USE_TEST_DB=1 npm run test:integration` cible la
  même base isolée.
- `docs/development/testing.md` — topologie des trois niveaux de tests.

### Corrigé
- `support-attachments` et `marketplace-cart` (intermittents en local par
  accumulation sur la base de démo) : ticket créé à la volée, sélecteur
  `.first()` sur la confirmation de dépôt → indépendants de l'état.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (178) + `build` OK.

## [Non publié] — Effacement RGPD + purge de rétention (ADR 0043)

### Ajouté
- **Effacement d'un compte (RGPD art. 17)** — `lib/privacy/erasure.ts` :
  purge des pièces KYC (bucket + base), conversations IA, notifications,
  appareils, plan de croissance, pièces jointes support ; anonymisation
  de `User`/`UserProfile` (pierre tombale). **Conservés** : grand livre,
  journal d'audit, dossier KYC sans les pièces (obligation LCB-FT).
  Point d'entrée `PATCH /api/v1/admin/users/[id] {action:'erase'}`
  (rôles conformité, exige une demande de suppression instruite), audit
  `admin.user_erased`, bouton dédié dans `/admin/users`.
- **Purge de rétention automatique** — `lib/privacy/retention.ts` :
  OTP > 7 j, sessions expirées > 1 j, notifications lues > 12 mois,
  `audit_logs` > 5 ans. Branchée sur le tick horaire ; script manuel
  `npm run privacy:purge`.

### Modifié
- `docs/compliance/matrix.md` §2, §9 et bloquant §6 : effacement et
  durées de conservation passent de « à faire » à « fait, reste la
  validation du délai par un conseil ».

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**178**) + `build` OK.
  `test/integration/privacy-erasure.itest.ts` (3 tests) au vert.

## [Non publié] — Livraison Marketplace via Miaride (ADR 0042)

### Ajouté
- **Livraison des achats Marketplace** via Miaride (coursier moto/
  voiture, Grand Lomé). Deux modes : **simulé** (démo honnête, statuts
  qui avancent, bandeau aperçu) et **hand-off réel** (KESSIA prépare le
  bon et ouvre Miaride ; l'acheteur colle son code de suivi).
- v1 : fiche produit, achat wallet. Règlement du vendeur inchangé ;
  les frais de livraison sont un débit séparé (remboursable si annulé
  avant enlèvement). Devis à la zone (23 quartiers de Lomé, estimation).
- `MarketplaceItem.pickupZone` + modèle `MarketplaceDelivery`.
  `lib/delivery/` (fournisseur abstrait + adaptateur Miaride), API
  `…/deliveries/*` + webhook HMAC prêt pour le vrai partenariat.
  Suivi sur `/marketplace/mine` : timeline acheteur, « colis prêt »
  vendeur.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**178**) + `build` OK.
  `e2e/marketplace-delivery.spec.ts` + suite au vert.

## [Non publié] — Vignettes des pages secondaires colorées (ADR 0041)

### Modifié
- Les vignettes illustratives des listes de cartes passent aussi en
  icône Lucide colorée : cours Academy, groupes Communauté, catégories
  et exemples Invest / Insurance / Loans (`iconName` ajouté aux data),
  en-têtes `/jobs` `/diaspora` `/academy` `/community`, boutons like /
  appel vidéo / envoyer du fil Communauté.
- 16 icônes de contenu ajoutées au registre (panier, ciseaux, épi de
  blé, stéthoscope, mégaphone, oiseau…).
- Restent en emoji uniquement les chaînes i18n (libellés de score,
  corps de notification) — c'est du texte, pas une icône.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**) + `build` OK.
  E2E production 18/18 au vert.

## [Non publié] — Icônes en couleur (ADR 0041)

### Modifié
- Les icônes Lucide passent du trait monochrome au **trait coloré**,
  une teinte sémantique par icône (`lib/ui/icon-colors.ts`, palette de
  8 accents). `<Icon … tinted />` + `iconColor(name)` pour teinter la
  pastille assortie.
- Carte de solde de l'accueil : pastilles blanches + icônes colorées
  (bien plus lisibles sur le dégradé). Teinté aussi : services,
  actions wallet + historique, activités « Pour vous », menu/stats du
  profil, agenda, business, support, AI, notifications, priorités
  admin, les deux barres de navigation.
- Inchangé : `/explore` et types de tontine (déjà colorés), features
  de la page publique, FAB IA.

### Vérification
- `tsc` + `lint` (0 warning) + `build` OK. E2E production 32/32 au vert.

## [Non publié] — Jeu d'icônes Lucide, lot 2 (ADR 0041)

### Modifié
- Suite du remplacement des emoji par des icônes Lucide : catalogue de
  modules (`/explore` + ponts invest/insurance/loans), profils
  utilisateur (modale + inscription), `/profile` (stats, menu,
  déconnexion), accueil (« Pour vous », opportunités, premiers pas,
  activités), historique wallet, notifications (les deux écrans),
  agenda, actions rapides business, support (canaux + FAQ), KESSIA AI,
  admin (sidebar, KPI, priorités), page publique (fonctionnalités +
  étapes).
- Nouveau `lib/ui/entry-icons.ts` : mappeurs id/catégorie → icône pour
  les entrées dérivées de données. `components/ui/Icon.tsx` étendu.
- Restent en emoji, volontairement : les vignettes illustratives des
  listes de cartes (cours Academy, groupes Communauté, projets
  invest/insurance/loans/jobs, diaspora) et les emoji dans les chaînes
  i18n.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**) + `build` OK.
  E2E production : **38/38 au vert**.

## [Non publié] — Jeu d'icônes Lucide, lot 1 (ADR 0041)

### Modifié
- Remplacement des emoji par un **jeu d'icônes Lucide** (trait fin,
  teinté marque) sur les surfaces clés : navigation mobile + sidebar,
  actions de la carte de solde + QR + cloche (accueil), grille de
  services dépliable, actions rapides du wallet, les 4 types de
  tontine partout où ils apparaissent.
- Nouveau composant `components/ui/Icon.tsx` (registre nom → icône) ;
  `type-meta.ts` gagne un champ `iconName`. `dep: lucide-react`.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**) + `build` OK.
  E2E production : navigation/tontine/wallet/explore/legal/marketplace/
  pin-lock + 19 autres au vert (le rouge `support-attachments` =
  épuisement de données de test connu, sans rapport).

## [Non publié] — Page publique : navigation + carte de solde dépliable + photo de profil (ADR 0041)

### Ajouté
- **Page publique** : 2 liens de navigation « Tontines ouvertes en ce
  moment » et « La marketplace de la communauté » (avant « Contact »),
  défilement doux vers les rails correspondants (ancres
  `#tontines-ouvertes` / `#marketplace-communaute`). Flèche « Découvrir
  la suite » en bas du hero + bouton flottant « Revenir en haut » après
  ~700 px de défilement. **Menu mobile hamburger enfin fonctionnel**
  (il n'avait aucun `onClick` — navigation inaccessible sur mobile).
- **Accueil** : chevron en V au bas de la carte de solde qui **déplie
  la carte** pour montrer tous les services ; la section autonome
  « Services rapides » est retirée (ses tuiles passent dans la carte).
  Icône QR à côté du solde → écran « Recevoir ».
- **Photo de profil** : le bouton 📷 de `/profile` ouvre un vrai
  sélecteur de fichier (compression client → `PATCH /api/v1/profile`).
  L'avatar (accueil + profil) affiche la photo si elle existe ; l'avatar
  de l'accueil devient circulaire.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**) + `build` OK.
  `e2e` navigation + auth : 11/11 au vert. Upload de photo testé de
  bout en bout (persistée, présente après rechargement).

## [Non publié] — Icônes accueil/wallet + correction transfert (ADR 0041)

### Modifié
- Accueil et Wallet : icônes des actions rapides revues — 💸 Envoyer,
  💰 Recevoir, 💳 Recharger, 🤝 Tontines (accueil, fonds colorés
  distincts) ; mêmes icônes + 🏧 Retirer sur `/wallet`.

### Corrigé
- **Bug de course** : soumettre un transfert très vite après ouverture
  de la modale pouvait le rejeter à tort (« Solde insuffisant ») car le
  solde n'avait pas fini de charger. `TransferForm` attend maintenant
  explicitement la fin du chargement avant de comparer au solde.

### Vérification
- `tsc` + `lint` (0 warning) + `build` OK. `e2e/wallet.spec.ts` +
  `e2e/navigation.spec.ts` : 9/9 au vert (le test de transfert, qui
  échouait de façon reproductible, passe désormais).

## [Non publié] — Marketplace : 9 catégories + icônes soignées (ADR 0041)

### Modifié
- `MARKETPLACE_CATEGORIES` +2 (Produits alimentaires & Boissons,
  Vêtements & Accessoires), insérées après Agricole → **9 pastilles**
  au total. Toutes les icônes de la rangée revues (🧺🛠️🧱📦🤝🌾🍽️👗🏷️).
  Aucune migration de schéma (`category` est un `String?`).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**) + `build` OK.
  `e2e/marketplace-cart.spec.ts` : 1/1 au vert.

## [Non publié] — Correction : actions rapides Business (ADR 0041)

### Corrigé
- `/business` : les 4 tuiles « Nouvelle vente / Ajouter produit /
  Dépense / Facture » n'affichaient qu'un toast « bientôt disponible ».
  Elles ouvrent maintenant le bon formulaire sur la première entreprise
  de l'utilisateur (ou proposent d'en créer une s'il n'en a pas).
- `business-detail-client.tsx` : nouveau support de `?action=` (même
  patron que `wallet?action=deposit`).

### Vérification
- `tsc` + `lint` (0 warning) + `build` OK.
  `e2e/explore-crm.spec.ts` : 2/2 au vert.

## [Non publié] — Refonte visuelle : catégories en pastilles Marketplace (ADR 0041)

### Modifié
- `/marketplace` : le `<select>` de catégorie devient une **rangée de
  pastilles avec icône** (défilement horizontal), plus proche des
  maquettes. Titre de section « Produits populaires » ajouté
  au-dessus de la grille. Aucune donnée ni logique changée.

### Vérification
- `tsc` + `lint` (0 warning) + `build` OK.
  `e2e/marketplace-cart.spec.ts` : 1/1 au vert.

## [Non publié] — Refonte visuelle : donut de répartition du CA (ADR 0041)

### Modifié
- Business, onglet **ADN** : la « Répartition du chiffre d'affaires »
  passe de barres horizontales à un **donut SVG + légende**, dans
  l'esprit des maquettes (« Rapports & Analyses »). Mêmes données
  (`categoryMix`), aucun calcul changé.

### Vérification
- `tsc` + `lint` (0 warning) + `build` OK. `e2e/explore-crm.spec.ts`
  (couvre l'onglet ADN) : 2/2 au vert.

## [Non publié] — Refonte visuelle : cadran KESSIA Score (ADR 0041)

### Modifié
- `/profile/score` : la barre horizontale du hero est remplacée par un
  **cadran demi-cercle rouge→jaune→vert avec aiguille** (SVG), dans
  l'esprit des maquettes utilisateur. Aucun texte ni donnée affectée.

### Vérification
- `tsc` + `lint` (0 warning) + `build` OK. `e2e/navigation.spec.ts`
  (couvre `/profile/score`) : 6/6 au vert. (Une instabilité du pool de
  connexions Supabase — `max clients reached, pool_size: 15` — a
  provoqué des échecs aléatoires sur d'autres specs sans rapport ce
  jour-là ; voir ADR 0041.)

## [Non publié] — Panier multi-articles Marketplace (ADR 0041, 3/7 — dernier item)

### Ajouté
- `store/cartStore.ts` : panier 100 % client (localStorage). Au
  paiement, chaque unité de chaque ligne appelle **l'API d'achat
  directe déjà existante** (`POST /marketplace/[id]/order`, mode
  WALLET) — aucune nouvelle route, aucun nouveau modèle.
- `/marketplace` : bouton « Ajouter au panier » par carte + icône
  panier avec badge dans l'en-tête. `/marketplace/[id]` : bouton
  ajouté à côté des boutons d'achat direct existants (inchangés).
- **`/marketplace/cart`** (nouveau) : quantités, retrait, total, garde
  de solde, paiement séquentiel avec écran de résultat détaillé par
  ligne.
- `e2e/marketplace-cart.spec.ts` (nouveau, +1 → 42 E2E).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
  **E2E complet (42/42)** au vert (un échec isolé de
  `support-attachments.spec.ts` observé sur une exécution — épuisement
  de données de test sans rapport, cf. ADR 0041).
- **Les 7 items de la refonte demandée sont livrés.**

## [Non publié] — Prêts coopératifs (ADR 0041, 7/7)

### Ajouté
- Nouveau module **`/loans`** (« Prêts coopératifs »), statut
  `REGULATED` comme Invest/Insurance : octroyer un crédit, même sans
  intérêt, reste une activité potentiellement réglementée. Cadrage
  entraide/solidarité (pas de taux) — 4 motifs, 5 demandes d'exemple
  avec barre de progression, action « Soutenir cette demande » →
  toast. Ponts vers le Fonds de Garantie Solidaire et la Tontine
  Croissance.
- `lib/modules/loans-data.ts`. `catalog.ts` +entrée `loans`. `/explore`
  le liste automatiquement (lien « En savoir plus »).
- i18n FR+EN complet.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
  **E2E complet (41/41)** au vert.

## [Non publié] — Code PIN de déverrouillage rapide (ADR 0041, 3/7)

### Ajouté
- Nouvelle section « Code PIN de déverrouillage » dans
  `/profile/security` (activer/changer/désactiver, même patron que la
  2FA). **Ne remplace pas** le mot de passe/2FA — verrouille l'écran
  d'une session déjà authentifiée.
- `GET/POST/DELETE /api/v1/auth/pin` + `POST /api/v1/auth/pin/verify`
  (limité à 5 tentatives/15min). `User.pinHash`/`pinEnabled`.
- `components/auth/PinLockGate.tsx` : panneau plein écran bloquant si
  un PIN est actif et que l'onglet/fenêtre n'a pas encore été
  déverrouillé (`sessionStorage`, comme sur un téléphone).
- `e2e/pin-lock.spec.ts` (nouveau, +1 → 41 E2E).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
  **E2E complet (41/41)** au vert.

## [Non publié] — Financement participatif dans Invest (ADR 0041, 6/7)

### Ajouté
- `/invest` : nouvel onglet **« Financement participatif »** à côté de
  « Projets à financer » — 5 campagnes communautaires d'exemple (santé,
  éducation, infrastructure locale, solidarité), cadre explicitement
  **don/soutien, jamais de rendement** (répété sur chaque carte).
  Bouton « Soutenir ce projet » → toast, aucune écriture serveur.
  Fusionné dans Invest plutôt qu'un module séparé (pas de doublon).
- `lib/modules/invest-insurance-data.ts` +`CROWDFUNDING_CATEGORIES`
  +`CROWDFUNDING_CAMPAIGNS`.

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
  **E2E complet (40/40)** au vert.

## [Non publié] — Objectif d'épargne dans le Wallet (ADR 0041, 2/7)

### Ajouté
- La tuile « 💎 Épargne » du Wallet (jusque-là « bientôt disponible »)
  ouvre un panneau **« Vos objectifs d'épargne »** : liste des tontines
  Achat-Solo de l'utilisateur avec barre de progression, plus un bouton
  « + Nouvel objectif ». **Aucun nouveau mécanisme** : réutilise tel
  quel le séquestre/restitution des tontines Achat individuel (ADR
  0035) — juste une présentation « objectif » plutôt que « tontine ».

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**, inchangé) + `build` +
  **E2E complet (40/40)** au vert.

## [Non publié] — Certificat de fin de cours Academy (ADR 0041, 5/7)

### Ajouté
- `/academy` : le bouton « Continuer » fait progresser une vraie jauge
  (état client, +24 %/clic) au lieu d'un simple toast. À 100 %, badge
  « ✓ Terminé » + bouton **« Voir mon certificat »**.
- `GET /api/v1/academy/certificate?course=<id>` : PDF généré à la volée
  (moteur maison `MiniPdf`, comme factures/reçus) avec le nom réel du
  membre, le détail du cours, et un disclaimer explicite (certificat de
  démonstration, pas une certification professionnelle réelle).
- `lib/modules/academy-certificate.ts` + `academy-certificate.test.ts`
  (2 tests).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**174**, +2) + `build` +
  **E2E complet (40/40)** au vert. Téléchargement réel du PDF vérifié
  (Playwright, 200, `application/pdf`).

## [Non publié] — Messagerie Communauté (ADR 0041, 1/7)

### Ajouté
- `/community` : nouvel onglet **Messagerie** — liste de conversations
  (badge non-lus), fil de discussion (bulles), envoi de message avec
  réponse automatique simulée (~1,1 s), bouton **Appel vidéo** en aperçu
  honnête (toast, aucune connexion réelle — la visio nécessiterait une
  infrastructure temps réel hors périmètre d'une démonstration).
- `lib/modules/community-data.ts` : `COMMUNITY_CONVERSATIONS`,
  `COMMUNITY_MESSAGES`, `AUTO_REPLIES`. Styles partagés `.convoList`,
  `.msgBubble`, `.msgInputRow`, etc. dans `module-page.module.css`.
- Premier élément d'ADR 0041 (refonte visuelle + fonctionnalités
  manquantes d'après les maquettes fournies par l'utilisateur).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**172**, inchangé) + `build` +
  **E2E complet (40/40)** au vert.

## [Non publié]

### Ajouté
- **Auth** : inscription (téléphone → OTP → profil → KYC), connexion mot de passe / OTP, refresh token rotatif, garde middleware, store Zustand persistant + cookie pour le middleware.
- **Client API centralisé** (`lib/api/client.ts`) : header Bearer, refresh automatique sur 401 (dédupliqué), déconnexion + redirection si échec.
- **Wallet** : solde, stats 30 j, historique filtrable, modales dépôt / transfert (ledger transactionnel + idempotent).
- **Tontine** : liste, création, détail (membres, progression, cotisation avec confirmation), code d'invitation.
- **KESSIA AI** : chat FAQ / onboarding (mode règles serveur), suggestions, pré-remplissage `?q=`.
- **Support** : liste de tickets, création, fil de discussion + réponse.
- **Business** : liste + création d'activité (sous-modules produits/ventes/factures à venir — Phase 4).
- **Notifications** : centre, filtres, marquer lu.
- **Profil** : identité, KESSIA Score, bannière KYC, déconnexion — endpoint `GET/PATCH /api/v1/profile`.
- **KYC fonctionnel** : `/profile/kyc` branché sur `/api/v1/kyc` — statuts (§30), envoi de pièces (compression client, stockage data-URI en MVP), motifs de rejet, aide IA.
- **Admin** : `GET /api/v1/admin/overview` (RBAC) + dashboard sur données réelles + état « accès réservé ».
- **Journal d'audit** (`lib/audit`) — actions critiques tracées dans `audit_logs` (§31, §51). ADR 0004.
- **Rate limiting** (`lib/security/rate-limit`) — auth, wallet, kyc, ai, payments (compteur mémoire en MVP → Upstash en prod).
- **Wallet — Recevoir** : numéro + QR code (`qrcode`) + partage (§6.1). **Retirer** via l'abstraction paiements.
- **Dashboard — section « À faire »** : KYC non vérifié, cotisations dues sous 7 j (§7). Actions rapides alignées §7 (Envoyer / Recevoir / Recharger / Tontine).
- **Abstraction `PaymentProvider`** (§6.3, ADR 0005) : interface + 4 fournisseurs (Mobile Money / Banque / Cash / QR, simulés & marqués `simulated`), `PaymentTransaction`, `POST/GET /api/v1/payments`, `GET /api/v1/payments/[id]`.
- **Business complet** (§7, §11-12) : `/business/[id]` avec onglets Résumé (KPIs CA/marge/stock/top produits) · Produits · Ventes · Dépenses · Factures (TVA, numérotation `FAC-YYYY-####`). Nouveau `POST/GET /api/v1/business/[id]/invoices`.
- **Back-office admin** (§45) : garde RBAC (`AdminGuard` + `withAuthAndRole`), écrans `/admin/{dashboard,users,kyc,kyc/[id],transactions,tontines,support}`, APIs correspondantes. **Revue KYC** : valider / rejeter (motif obligatoire, §30) / demander une action → notifie l'utilisateur + audit.
- **Tests** (§49) : `vitest`, 31 tests unitaires (format, crypto, validations, rate-limit, providers). **CI** (§50) : `.github/workflows/ci.yml` (install → prisma generate → lint → typecheck → tests → build). `.eslintrc.json`, scripts `typecheck` / `test`.
- **i18n** (§38) : `lib/i18n` (locales fr/en/ee, fallback FR, `I18nProvider` + `useT()`), formatage `Intl` piloté par la locale, sélecteur Langue & Région dans le profil.
- **Dark mode** (§36, DS §24) : palette sombre complète (3 états système/clair/sombre), `store/themeStore`, script anti-flash, sélecteur Apparence dans le profil.

### Route
- Le back-office passe de `/(admin)` (collision `/support`) à **`/admin/*`**.

## [Non publié] — Durcissement (Sécurité · Conformité · Fiabilité · Simplicité)

### Sécurité (§31)
- **MFA / 2FA (TOTP)** : `lib/auth/twofactor.ts` (`otplib`), routes `POST/DELETE /api/v1/auth/2fa` (setup/enable/disable) + `POST /api/v1/auth/2fa/verify` (défi de connexion) + **8 codes de secours** hashés. Login & verify-otp renvoient `{ requires2fa, challengeToken }` si activée. UI : étape 2FA sur login/verify-otp + section dédiée sur `/profile/security`.
- **`/profile/security`** : changement de mot de passe (révoque toutes les sessions + notifie), gestion 2FA, **liste + révocation des sessions actives** (`GET/DELETE /api/v1/auth/sessions`).
- **Middleware durci** : `middleware.ts` vérifie désormais la **validité du JWT** (`jose`, edge) et le **rôle** pour `/admin/*` (redirection si insuffisant). Nettoie le cookie mort.
- **Logs structurés** : `lib/logger.ts` (`winston`), `logApiError()` câblé dans 40 routes API (§47).
- **`GET /api/health`** : sonde de disponibilité (base incluse).
- Schéma : `User.twoFactorEnabled/Secret/Backup`, `dataExportRequestedAt`, `deletionRequestedAt`.
- **ADR 0006** — MFA, middleware RBAC edge & droits RGPD.

### Conformité (§4.5, §59)
- **Matrice de conformité** (`docs/compliance/matrix.md`) : 10 domaines (structure juridique, protection des données, KYC/LAB-FT, paiements, investissement, assurance, fiscalité, contrats, conservation, sécurité), statut par ligne, synthèse des bloquants avant pilote — support à valider par conseil juridique.
- **Droits RGPD** (`/profile/privacy`, `GET/POST /api/v1/profile/privacy`) : visualisation des consentements, **export JSON** des données personnelles (droit d'accès / portabilité — pièces KYC exclues), **demande de suppression de compte** + annulation. L'effacement effectif reste une procédure manuelle encadrée (obligations de conservation AML / comptables).
- **`GET/PATCH /api/v1/me`** : alias de `/api/v1/profile` (§46).

### Fiabilité (§6.3, §10, §12, §44) — ADR 0007
- **Webhooks de règlement** : `POST /api/v1/payments/webhooks/[provider]` — signature HMAC-SHA256 (`x-kessia-signature` / `PAYMENT_WEBHOOK_SECRET`), **idempotent** (`settlePendingPayment`), `payment.completed` → écriture ledger (clé `PAYTX_<id>`) + `PaymentTransaction=COMPLETED` + notification ; `payment.failed` → `FAILED` + notification.
- **Reversal de transfert** : si le crédit du destinataire échoue, écriture `REVERSAL` (clé `REV-<referenceId>`) qui rétablit le solde de l'expéditeur ; résultat tracé dans l'audit.
- **`Idempotency-Key`** accepté sur `wallet/transfer` (dérive les deux écritures) et `tontine/[id]/contribute`.
- **KESSIA Score** (`lib/score/`, `GET /api/v1/score`, écran `/profile/score`) : moteur **à base de règles, déterministe et explicable** — 7 facteurs (KYC, ancienneté, activité wallet, fiabilité + participation tontine, Business, 2FA) + malus (wallet verrouillé, sanctions), score `[0,1000]`, bandes, conseils priorisés. Persisté dans `UserProfile.kessiaScore`. **N'est pas un score de crédit réglementé.**
- **Tontine — rejoindre par code** : `POST /api/v1/tontine/join {code}` + modale dédiée sur `/tontine`.
- **Notifications automatiques** (`lib/notifications/notify`) : nouveau membre / cotisation reçue → gestionnaire de tontine ; transfert reçu → destinataire ; paiement confirmé/échoué → utilisateur.
- **Fonds de Garantie Solidaire** : structure et modèle cible documentés, **non activé** (qualification juridique requise — ADR 0007 §5).

### Simplicité (§5, §7, §33, §45, MVP §4) — ADR 0008
- **Back-office — actions en écriture** : `PATCH /api/v1/admin/support/[id]` (affecter, changer de statut, répondre au client, note interne) avec notification du demandeur ; `PATCH /api/v1/admin/users/[id]` (suspendre / réactiver — coupe la connexion + révoque les sessions). Écran `/admin/support/[id]` (fil complet) ; modération depuis `/admin/users`.
- **Smart Alerts** : `lib/insights/`, `GET /api/v1/ai/insights` — recommandations **dérivées des données réelles** (KYC, échéances de cotisation, solde bas, 2FA, activité Business, KESSIA Score). Section « Pour vous » sur l'accueil + en tête de KESSIA AI.
- **Correction MASTER #3** : la bannière KESSIA Score de l'accueil (« 820 ») et le pied de la landing (« des milliers d'entrepreneurs ») affichaient des valeurs inventées → branchés sur des données réelles / reformulés.
- **Préférences de notification** (`/profile/notifications`) : 6 catégories désactivables (SECURITY toujours actif). `notify()` les respecte. Champs `UserProfile.notify*`.
- **Onboarding** (`/onboarding`) : carrousel de bienvenue 4 écrans, « Passer », complétion mémorisée ; les CTA de la landing y passent.
- **Confidentialité des notes internes** : `GET /api/v1/support/[id]/messages` masque désormais `isInternal` au demandeur.
- **ADR 0008**.
- **PWA** : `manifest.webmanifest`, `icon`, `apple-icon`.
- **Composants** : Modal, Toaster, ErrorNote.
- **Seed** de développement (`prisma/seed.ts`).
- **Docs** : README, CHANGELOG, `docs/`.

### Modifié (conformité cahier des charges)
- **Couleur signature** → `#B65A3A` (KESSIA Terracotta, §36) — remplaçait `#C84B1E`.
- **Navigation mobile** → `Accueil | Wallet | Tontines | Business | Profil` (§37) ; KESSIA AI en bouton flottant.
- **`KycStatus`** → `NOT_STARTED / IN_PROGRESS / UNDER_REVIEW / ACTION_REQUIRED / VERIFIED / REJECTED / EXPIRED` (§30).
- **`UserRole`** → ajout `BUSINESS_OWNER`, `TONTINE_MANAGER` (§45).
- Suppression des métriques d'usage inventées sur la landing (MASTER règle #3).

### Corrigé
- **Inscription cassée** : le front n'envoyait pas `consentTerms` / `consentData` requis par le schéma → 400 systématique.
- **Connexion base de données** : bascule sur le pooler Supabase (hôte direct IPv4 déprécié).
- Encodage UTF-8 réparé sur 16 fichiers (mojibake introduit par un script de remplacement).

## [Non publié] — Orchestration tontine, 4 types & tests E2E (ADR 0009)

### Ajouté
- **Les 4 types de tontines** (§6.4) désormais visibles et sélectionnables : **Classique Tournante**, **Projet**, **Croissance**, **Achat** (`lib/tontine/type-meta.ts`). Onglet Tontines : bandeau de résumé (nombre / cotisé / prochaine échéance), badge de type sur chaque carte, section « Les 4 types » avec fiche détaillée (description + étapes) et raccourci de création. Formulaire de création : sélecteur de type en tête. Détail : bloc « Comment fonctionne ce type ».
- **Distribution selon le type** dans l'orchestrateur : *Classique / Achat* → cagnotte tournante (1 tour/membre) ; *Projet* → collecte unique versée à l'organisateur (`totalRounds = 1`) ; *Croissance* → épargne bloquée pendant N tours puis **restitution de la mise à chaque membre** en fin de cycle. `totalRoundsForType()`.
- **Cycle de tontine automatique** (`lib/tontine/`) : démarrage auto quand le groupe est complet (ou `PATCH /api/v1/tontine/[id] {action:'start'}` par le créateur) → calendrier `TontineSchedule`, cotisations `PENDING` du tour ; à chaque cotisation, si le tour est complet → **versement au(x) bénéficiaire(s)** (`TONTINE_PAYOUT`, idempotent) + passage au tour suivant ou clôture, avec notifications.
- **`POST /api/v1/cron/tontine-tick`** (secret `x-cron-secret`) : cotisations en retard (`LATE`), relances anti-spam, rattrapage des tours non versés. À brancher sur un ordonnanceur.
- Bouton **« Démarrer la tontine »** sur le détail (créateur, ≥ 2 membres).
- **Tests E2E** (`@playwright/test`, dossier `e2e/`, viewport mobile) : 22 tests — auth/RBAC, onboarding, navigation, wallet (dépôt/transfert), tontine (4 types visibles, création par type, code, **cycle complet démarrage→versement**), admin (ticket). Workflow `.github/workflows/e2e.yml` (Postgres jetable). Scripts `test:e2e` / `test:e2e:ui`.
- `E2E_RATE_LIMIT_BYPASS` : neutralise le rate limiting pour la suite E2E (opt-in explicite, `console.warn` de sécurité au démarrage, jamais en prod).

### Connu / à faire
Voir `docs/progress/status.md`.

## [Non publié] — Profils, contrat de tontine & Fonds de Garantie (ADR 0010)

### Ajouté
- **Profils utilisateur (§4)** : `userType` déclaratif (5 profils dans le MVP — Particulier, Entrepreneur débutant, Micro-entreprise, PME, Coopérative), collecté à l'inscription et modifiable dans le profil. **Élévation de rôle automatique** : `USER → TONTINE_MANAGER` (1ʳᵉ tontine), `→ BUSINESS_OWNER` (1ʳᵉ entreprise). `docs/product/overview.md`.
- **Contrat numérique de tontine (§6.4, « Smart Agreement »)** : snapshot immuable des termes figé au démarrage (objet, finances, calendrier des bénéficiaires, règles), acceptation horodatée par chaque membre. Nouveau modèle **`TontineEvent`** (journal : création, adhésion, activation, cotisation, retard, versement, tour, clôture) qui comble aussi le §42. `GET/POST /api/v1/tontine/[id]/agreement`, écran `/tontine/[id]/contrat`.
- **Fonds de Garantie Solidaire (§6.5) — MODE DÉMONSTRATION** : règles, projection du solde (1 % des cotisations − demandes réglées), demandes membres, **validation humaine par la conformité**, journal d'événements, reporting. Aucun mouvement de fonds réel ; bandeau « démonstration » permanent ; formulaire de demande derrière `GUARANTEE_FUND_USER_REQUESTS`. Écrans `/tontine/garantie` et `/admin/guarantee`. Modèles `GuaranteeClaim` + `GuaranteeEvent`.
- **PWA (§5)** : service worker prudent (`public/sw.js` — `/api/**` jamais en cache, navigations réseau-d'abord + repli `/offline`), enregistrement en production, page `/offline`. KESSIA devient installable comme une application.
- **Seed enrichi** : 12 comptes togolais, 4 entreprises complètes (produits, ventes, clients, factures, dépenses), 6 tontines (4 types, états PENDING/ACTIVE/COMPLETED, avec contrats et journaux), 3 demandes au Fonds de Garantie.
- **ADR 0010** ; tests unitaires du contrat (`agreement.test.ts`).

## [Non publié] — Parcours par profil, CRM business, ADN, hub Explorer (ADR 0011)

### Ajouté
- **Parcours adapté au profil (§4)** : chaque `userType` porte des modules mis en avant, des « premiers pas » et des questions suggérées. L'accueil réordonne la grille de services et affiche une carte « Premiers pas · <profil> » ; KESSIA AI propose des suggestions par profil.
- **CRM business (§7)** : **clients** segmentés (`PROSPECT`/`NOUVEAU`/`REGULIER`/`FIDELE`/`INACTIF`, dérivé du comportement d'achat) avec fiche, notes, relances datées et historique ; **fournisseurs** (répertoire + achats, rattachables aux dépenses) ; **devis → facture** (`kind` `QUOTE`/`INVOICE`, numérotation `DEV-`/`FAC-AAAA-####`, conversion transactionnelle) ; **trésorerie** et **objectifs** en vues calculées (jamais stockées) ; **export CSV**. Nouveaux modèles `Supplier`, `BusinessGoal` ; `Customer`/`Expense`/`Invoice` étendus. Onglets Clients / Fournisseurs / Devis & Factures / Objectifs / Trésorerie / ADN sur `/business/[id]`.
- **ADN de l'entreprise (§8)** : `computeBusinessDNA()` — profil agrégé (activité 30/90 j, marge brute, mix catégories, produits phares, clients récurrents), **score de santé 0–100** à base de règles + recommandations déduites. `GET /api/v1/business/[id]/dna`, onglet dédié. Rien n'est inventé.
- **Hub « Explorer » (§9–§16)** : `/explore` — modules disponibles (5) en accès direct, modules de la feuille de route (7) présentés honnêtement avec bouton « M'intéresser » et note réglementaire permanente (Invest/Insurance après validation, KESSIA n'est pas assureur). Modèle `ModuleInterest`, `/api/v1/modules/interest`, `/admin/modules` (+ `/api/v1/admin/modules`) pour la priorisation. Liens morts de l'accueil et de la sidebar supprimés → `/explore`.
- **Seed** : fournisseurs, objectifs, types de clients + relances, devis (`DEV-…`), et manifestations d'intérêt pour les modules à venir.
- **ADR 0011** ; tests `crm.test.ts`, `csv.test.ts` ; E2E `explore-crm.spec.ts` (24 tests au total).

## [Non publié] — Plan de croissance, simulateurs, Opportunity Engine, plan d'affaires (ADR 0012)

### Ajouté
- **Simulateurs (§20)** : `/simulator` — épargne/objectif, tontine, activité. Calculs **purs et déterministes** (`lib/simulator/*`), **aucun rendement** simulé (le capital projeté = initial + versé). Sliders, mini-graphes, bannière « projections, pas des promesses ».
- **Plan de croissance (§23)** : `/growth` — objectif → action → échéance → indicateur → progression. `lib/growth/rules.ts` (pur, testé) génère les étapes à partir du KESSIA Score, de l'ADN des activités, des tontines et du KYC ; `GrowthStepState` persiste la progression (`GET /api/v1/growth`, `PATCH /api/v1/growth/steps/[key]`). Anneau de progression, actions Fait / En cours / Ignorer.
- **Opportunity Engine (§17)** : `GET /api/v1/opportunities` — opportunités concrètes tirées des données propres de l'utilisateur (devis à relancer avec montant, clients dormants, réassort rentable, tontine publique adaptée, palier de Score). Surfacées sur l'accueil et dans KESSIA AI.
- **Business Plan AI (§17)** : modèle `BusinessPlan` (un par entreprise) ; `generateBusinessPlanDraft()` produit un brouillon structuré depuis l'ADN ; onglet « Plan » sur `/business/[id]` (éditable, régénérable, export texte). `GET/PUT/POST /api/v1/business/[id]/plan`.
- **KESSIA AI contextuel (§17)** : `lib/ai/data-answers.ts` répond aux questions factuelles avec les données réelles (solde, prochaine cotisation, Score, ventes du mois, plan, opportunités) avant la base de connaissances (enrichie : croissance, simulateurs, CRM, ADN, Explorer). **Voix** (`hooks/useVoice.ts`, Web Speech API) : dictée + lecture des réponses, feature-détectées (avance aussi §34).
- **§4** : `firstSteps`/`aiPrompts` par profil pointent vers simulateur et plan ; accueil gagne les sections « Plan de croissance » et « Opportunités » ; `growth` et `simulator` ajoutés aux modules LIVE d'`/explore`.
- **Seed** : `GrowthStepState` de démonstration, brouillons `BusinessPlan` pour les 4 entreprises.
- **ADR 0012** ; tests `simulator.test.ts` (12), `growth/rules.test.ts` (5) → 72 unitaires ; E2E `growth-simulator.spec.ts` → 26 au total.

## [Non publié] — Anti-fraude, Trust Center, plafonds KYC, agenda, analytics, canaux, voix, ops (ADR 0013)

### Ajouté
- **Anti-fraude (§32)** : moteur de règles (`lib/fraud/*`) — nouvel appareil, vélocité, fan-out, montant anormal, quasi-vidage, compte dormant, burst d'échecs. Modèles `Device`, `FraudAlert`. Câblé sur login / transfert / retrait (non bloquant). File de revue humaine `/admin/fraud` (`GET`/`PATCH /api/v1/admin/fraud[/id]`, rôles conformité). **Aucun blocage automatique de fonds.**
- **Plafonds KYC (§30)** : `lib/kyc/limits.ts` — plafonds par opération et mensuels sortants selon le palier (0/1/2), appliqués **côté serveur** (`wallet/transfer`, `payments`). Stub de screening sanctions/PPE (`lib/kyc/screening.ts`, drapeau pour revue humaine).
- **Trust Center (§21)** : `/trust` + `GET /api/v1/trust` — grille tarifaire (`lib/fees.ts`), plafonds + consommation du mois, sécurité, données, Fonds de Garantie, mentions réglementaires. Entrée menu Profil.
- **Agenda (§26)** : `/calendar` + `GET /api/v1/calendar` — cotisations, factures, échéances du plan de croissance, relances clients, réunies et groupées par jour.
- **Data & Analytics (§28) + Admin Copilot (§17)** : `/admin/analytics` + `GET /api/v1/admin/analytics` — KPI agrégés (sans nominatif) + série 30 j + « priorités du jour » (aussi sur `/admin/dashboard`).
- **Canaux de notification (§33)** : `lib/notifications/channels.ts` — abstraction multi-canal ; `IN_APP` réel, `PUSH`/`SMS`/`EMAIL` en simulation ; journal `NotificationDelivery` ; distribution selon la priorité.
- **Voix — navigation (§34)** : `lib/voice/commands.ts` — commandes vocales de navigation intégrées à la dictée de KESSIA AI.
- **Observabilité (§47)** : `GET /api/metrics` (format Prometheus, protégé par `METRICS_TOKEN`).
- **Exploitation (§41, §48, §50, §31)** : `docs/{database/schema,security/overview,operations/backup-recovery}.md` ; `scripts/db-backup.mjs` (`npm run db:backup`), `scripts/smoke.mjs` (`npm run smoke`) ; `.github/workflows/staging.yml` (squelette).
- **Seed** : appareils + alertes anti-fraude de démonstration ; solde de Yao ajusté pour illustrer le plafond KYC.
- **ADR 0013** ; tests `fraud/rules.test.ts` (6), `kyc/limits.test.ts` (4), `voice/commands.test.ts` (5) → 87 unitaires ; E2E `trust-fraud-calendar.spec.ts` → 30 au total.

## [Non publié] — Infra : stockage KYC, rate limiting distribué, ordonnanceur (ADR 0014)

### Ajouté / modifié
- **Stockage KYC hors base (§30)** : `lib/storage/{supabase-storage,kyc-storage}.ts` — Supabase Storage (bucket privé, REST, URL signées 5 min). `KycDocument` += `storageKey`, `mimeType` ; `fileUrl` devient un repli data-URI. `POST /api/v1/kyc/documents` téléverse dans le bucket si configuré ; `GET /api/v1/admin/kyc/[id]` renvoie une URL signée courte. Nettoyage best-effort du bucket au remplacement / retrait d'une pièce.
- **Rate limiting distribué (§31)** : `enforceRateLimit()` passe en **asynchrone** (15 routes) ; `checkRateLimit()` utilise **Upstash Redis** (sliding window, compteur partagé) si `UPSTASH_REDIS_REST_URL`/`TOKEN` sont définis, sinon compteur mémoire. Repli mémoire sur toute erreur Upstash.
- **Ordonnanceur du tick tontine (§12, §33)** : `cron/tontine-tick` accepte `GET` (Vercel Cron) **et** `POST` (GitHub Actions / curl). `.github/workflows/cron.yml` (planifié `7 * * * *`, ignoré sans secrets) + `kessia-app/vercel.json`.
- **ADR 0014** ; tests `storage/kyc-storage.test.ts` (5), `rate-limit` (+1 async) → 93 unitaires ; 30 E2E inchangés.

## [Non publié] — Pages légales (projet), documents imprimables, relances auto (ADR 0015)

### Ajouté
- **Pages légales (§59, bloquant pilote #5)** : `/legal/terms` (CGU), `/legal/privacy` (Politique de confidentialité), `/legal/mentions` (Mentions légales) — pages **publiques**, brouillons rédigés à partir des faits du produit (modèle de données, rétention, sous-traitants, tarifs, droits RGPD), bandeau « projet — à valider juridiquement » permanent. Pied de page de la landing recâblé.
- **Documents imprimables (§7, §6.1)** : `GET /api/v1/business/[id]/invoices/[invoiceId]` et `GET /api/v1/wallet/transactions/[id]` ; pages `/documents/invoice/…` (devis / facture A4) et `/documents/receipt/…` (reçu wallet), layout sans chrome, `@media print`, bouton « Imprimer / PDF » → `window.print()` (aucune dépendance). Liens depuis l'onglet Devis & Factures et depuis chaque ligne du wallet.
- **Relances clients automatiques (§7, §33)** : `Customer` += `followUpNotifiedAt` ; `lib/reminders/customer-reminders.ts` (`isReminderDue` pur + `runCustomerReminders`) notifie l'exploitant des relances échues (une fois par échéance). Exécuté par l'ordonnanceur en même temps que le tick tontine.
- **Middleware** : `/documents`, `/growth`, `/simulator`, `/calendar`, `/trust`, `/explore` ajoutés à `PROTECTED_ROUTES`.
- **ADR 0015** ; tests `reminders/customer-reminders.test.ts` (5) → 98 unitaires ; E2E `legal-documents.spec.ts` (3) → 33 au total.

## [Non publié] — Documentation, versionnage des CGU, brouillons de formulaire (ADR 0016)

### Ajouté
- **Documentation** : `docs/support/playbook.md` (playbook agent support — principes, cycle de vie du ticket, réponse par catégorie, matrice d'escalade, réponses types) et `docs/user/getting-started.md` (guide utilisateur : compte, KYC, wallet, tontines, business, assistant, croissance, confiance).
- **Versionnage de l'acceptation des CGU (§8)** : `lib/legal/versions.ts` (source unique `LEGAL_VERSION` / `LEGAL_VERSION_LABEL` / `LEGAL_DOCS`). `User` += `termsAcceptedVersion`, `termsAcceptedAt`. L'inscription (`registerSchema` + `POST /api/v1/auth/register`) enregistre la version acceptée (défaut `LEGAL_VERSION`) dans la transaction de création + l'audit ; la page d'inscription l'affiche. `GET /api/v1/trust` renvoie un bloc `legal` (`acceptedVersion`, `acceptedAt`, `currentVersion`, `upToDate`) ; le Trust Center ajoute une section « Documents juridiques ». Pages `/legal/*` : date pilotée par `LEGAL_VERSION_LABEL`.
- **Brouillons de formulaire hors-ligne (§35)** : `hooks/useFormDraft.ts` (localStorage, préfixe `kessia:draft:`, sauvegarde à la frappe, effacement à la soumission, `try/catch` intégral) + `components/ui/DraftNotice.tsx` (bandeau « Brouillon restauré » + « Repartir de zéro »). Câblé sur `TransferForm` (wallet), `SaleForm` / `ExpenseForm` / `InvoiceForm` (business). Non câblé sur les formulaires courts ou sensibles (connexion, OTP, KYC).
- **Seed** : `termsAcceptedVersion` / `termsAcceptedAt` sur tous les comptes de démonstration.
- **ADR 0016** ; `tsc` + `lint` (0 warning) + `vitest` (98) + `build` + `playwright` (33) au vert.

## [Non publié] — Finition : jetons CSS, mur de ré-acceptation des CGU (ADR 0017)

### Corrigé / ajouté
- **Bug jetons CSS** : `tontine-detail.module.css`, `notifications.module.css` et `verify-otp.module.css` référençaient des jetons inexistants (`--color-text-primary` → `--color-text`, `--color-surface-2` → `--color-earth`, `--color-text-muted` → `--color-text-tertiary`) — texte/fonds sans couleur résolue, cassés en mode sombre. Corrigé (jetons cibles définis dans les 3 états de thème). Passes de cohérence : badges `.cat_*` des notifications, hover du bouton d'action tontine, points d'état.
- **Mur de ré-acceptation des CGU (§8)** : `isTermsUpToDate()` (pur, testé) ; `GET/POST /api/v1/legal/acceptance` (POST → pose `termsAcceptedVersion`/`At` + audit `legal.terms_accepted`) ; `components/legal/LegalGate.tsx` monté dans le layout du tableau de bord — panneau bloquant tant que la version acceptée ≠ version en vigueur (liens documents, case à cocher, « Continuer » / « Se déconnecter »).
- **ADR 0017** ; tests `legal/versions.test.ts` (3) → **101 unitaires** ; **33 E2E** inchangés (les comptes de démo sont à jour → `LegalGate` masqué). `tsc` + `lint` (0 warning) + `build` au vert.

## [Non publié] — Pièces jointes de ticket support (ADR 0018)

### Ajouté
- **Pièces jointes de ticket (§46)** : modèle `TicketAttachment` (`storageKey` bucket privé si configuré, repli `dataUrl` en base ; `isInternal` = visible des agents seulement). `lib/storage/ticket-storage.ts` (bucket `SUPABASE_TICKET_BUCKET`, URL signées 5 min, `describeAttachment()` pur + testé — images + PDF, ≤ 5 Mo, ≤ 10 / ticket).
- **`GET/POST/DELETE /api/v1/support/[id]/attachments`** : accès demandeur ou agent ; POST rate-limité, refusé si ticket fermé, `isInternal` réservé aux agents, audit `support.attachment_added` / `_removed` (jamais le contenu). Une pièce du demandeur sur un ticket `WAITING` le repasse `IN_PROGRESS`.
- **UI** : `lib/files/attachment-file.ts` (compression image / passthrough PDF côté client), `components/support/TicketAttachments.tsx` (liste + « 📎 Joindre un fichier », case « Interne » côté agent), `hooks/useSupport.ts::useTicketAttachments`. Monté dans `/support` (fil de discussion) et `/admin/support/[id]`.
- **Seed** : une pièce jointe de démonstration sur le ticket KYC d'Adjoa. `.env.example` += `SUPABASE_TICKET_BUCKET`.
- **ADR 0018** ; tests `storage/ticket-storage.test.ts` (5) → **106 unitaires** ; `e2e/support-attachments.spec.ts` (3) → **36 E2E**. `tsc` + `lint` (0 warning) + `build` + reseed au vert.

## [Non publié] — Tests d'intégration (ADR 0019)

### Ajouté
- **Suite d'intégration (§49)** : `vitest.integration.config.ts` (`*.itest.ts`, base réelle, série), `test/integration/{env-setup,helpers}.ts` (chargement `.env`/`.env.local` sans dotenv, `makeUser` / `cleanup` jetables), script `npm run test:integration`, workflow `.github/workflows/integration.yml` (Postgres 16 éphémère).
- **17 tests d'intégration** (5 fichiers) : `createLedgerEntry` (atomicité, idempotence, solde insuffisant, wallet verrouillé) ; `settlePendingPayment` (COMPLETED une fois, `ALREADY_SETTLED` au rejeu, FAILED sans ledger, `NOT_FOUND`) ; orchestrateur de tontine Projet (activation → versement → clôture, pas de double versement, versement bloqué si cotisations incomplètes) ; `checkOutboundLimit` (agrégation mensuelle, plafonds par opération / mensuel, palier 2) ; `POST /api/v1/auth/register` (compte + profil + wallet transactionnels, version CGU + audit, 409 doublon, 400 consentement).
- La suite unitaire (`npm test`) ne ramasse pas les `*.itest.ts` — elle reste rapide et sans base.
- **ADR 0019** ; `tsc` + `lint` (0 warning) + unitaires (106) + intégration (17) + `build` + `playwright` (36) au vert.

## [Non publié] — i18n : parcours d'authentification + coquille (ADR 0020)

### Ajouté / modifié
- **i18n (§38)** : `t()` accepte l'interpolation `{var}` (rétro-compatible) ; catalogue `ee` (Éwé) branché dans `CATALOGS` ; `fr.ts` réorganisé par écran et devenu la source de vérité (`nav`, `common`, `errors`, `auth.*`, `home`, `wallet`, `profile`).
- **`en.ts`** : traduction **complète** du parcours pré-connexion + navigation. **`ee.ts`** (nouveau) : `nav` + `common` de base uniquement, en-tête d'avertissement, `ready: false` — le reste retombe en français ; la traduction Éwé du vocabulaire financier / juridique / KYC doit être relue par un·e locuteur·rice natif·ve.
- **Écrans câblés `useT()`** : `login`, `register`, `verify-otp`, `onboarding` (100 % des chaînes) + `Sidebar`. Helper `withLink()` pour les libellés contenant un lien.
- **`components/i18n/LanguageSwitcher.tsx`** (nouveau) : sélecteur compact disponible **hors connexion**, ajouté aux pages d'auth + onboarding.
- **ADR 0020** ; tests `i18n/messages/catalogs.test.ts` (3) → **109 unitaires** ; `tsc` + `lint` (0 warning) + `build` + `playwright` (36) au vert.

## [Non publié] — i18n : accueil, wallet, tontines (ADR 0021)

### Ajouté / modifié
- **i18n §38** : `home-client`, `wallet-client` (+ `DepositForm` / `ReceivePanel` / `TransferForm`) et `tontine-client` (+ `JoinTontineForm` / `CreateTontineForm`) entièrement câblés sur `useT()` — en-têtes, cartes, sections, formulaires, messages d'erreur, boutons, états vides.
- Catalogue : bloc partagé `freq` (fréquences de tontine), blocs `home` / `wallet` / `tontine` étoffés (≈ 130 clés) dans `fr.ts` + `en.ts`. Collisions de portée `t` réglées (`.map((tn) => …)` / `((tx) => …)`).
- **Hors périmètre assumé** : `lib/tontine/type-meta.ts` (métadonnées des 4 types, consommées par ~6 écrans) et les sorties des utilitaires de formatage restent en français — passes dédiées.
- **ADR 0021** ; `tsc` + `lint` (0 warning) + `vitest` (109) + `build` + `playwright` (36) au vert.

## [Non publié] — i18n : type-meta, profil, support (ADR 0022)

### Ajouté / modifié
- **i18n §38** : `lib/tontine/type-meta-i18n.ts` (nouveau) — hooks `useTontineTypeMeta()` / `useTontineTypeList()` qui surchargent en langue les métadonnées des 4 types de tontines, `type-meta.ts` restant en FR (repli + usage serveur par l'orchestrateur). `tontine-client` et `tontine/[id]/tontine-detail-client` basculés sur ces hooks.
- **`profile-client.tsx`** entièrement câblé sur `useT()` — badges, KESSIA Score, bannière KYC (interpolations `{status}` / `{level}` / `{count}`), statistiques, bannière IA, menu, modales type de compte + thème. Constantes `KYC_LABEL` / `THEME_LABEL` supprimées.
- **`support-client.tsx`** + **`components/support/TicketAttachments.tsx`** entièrement câblés — contact, liste de tickets (`status` / `cat`), FAQ, `CreateTicketForm`, `TicketThread`, pièces jointes.
- Catalogue `fr.ts` + `en.ts` : blocs `tontineType.*` (label/tagline/description/step1-4), `kyc.status.*` (7 états), `profile` (≈ 40 clés), `support` étoffé (≈ 55 clés).
- **Hors périmètre assumé** : `type-meta.ts` lui-même, `user-type.ts`, écrans profil secondaires, admin support, utilitaires de formatage, relecture native éwé.
- **ADR 0022** ; `tsc` + `lint` (0 warning) + `vitest` (109) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : landing + utilitaires de formatage (ADR 0023)

### Ajouté / modifié
- **i18n §38** : la **landing** est traduite FR / EN — `app/page.tsx` reste serveur (`metadata` seule), nouveau `app/landing-client.tsx` (`'use client'`) câble `useT()` sur tout le contenu (nav, hero, piliers, 6 fonctionnalités, « 3 minutes », CTA, pied de page). Bloc catalogue `landing.*` (~70 clés).
- **Libellés des utilitaires de formatage** : `lib/utils/format.ts` (fonctions pures) reçoit un singleton `FormatMessages` poussé par `I18nProvider` via `setFormatMessages()` — même modèle que `setFormatLocale()`. `describeTransaction()`, `formatRelativeDate()` (mots-charnière + interpolation `{n}`/`{time}`) et le nouveau `formatFrequency()` sont localisés ; `TONTINE_FREQ_LABELS` conservé (déprécié). Côté serveur (back-office), le singleton reste FR.
- Bloc catalogue `format.*` (justNow, minutesAgo, today, yesterday, freq, tx) dans `fr.ts` + `en.ts`. `tontine-detail-client` bascule sur `formatFrequency()`.
- **Résultat** : le chemin onboarding → wallet → tontine → business s'affiche intégralement en anglais.
- **ADR 0023** ; `tsc` + `lint` (0 warning) + `vitest` (112, +3 `format.test.ts`) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : Business + Explorer (ADR 0024)

### Ajouté / modifié
- **i18n §38** : **Business** (`business-client` liste + `business-detail-client` — 11 onglets, KPI, états vides, filtres, 7 formulaires modaux) et **Explorer** (`explore-client`) entièrement câblés sur `useT()`. Blocs catalogue `business.*` (~180 clés) et `explore.*` (~40) dans `fr.ts` + `en.ts`, avec interpolations `{count}`/`{date}`/`{amount}`/`{name}`.
- **`lib/modules/i18n.ts`** (nouveau) — `useModuleCatalog()` localise name/tagline/description des ~16 modules + `STATUS_LABEL` ; `lib/modules/catalog.ts` reste FR pour `/admin/modules` (serveur).
- Énums localisés côté client depuis la donnée brute : `InvoiceStatus`, `CustomerSegment`, `GoalMetric`/`GoalPeriod`, moyens de paiement, catégories de dépense, secteurs (plus besoin des libellés pré-calculés serveur `g.metricLabel`…).
- **Hors périmètre assumé** : prose analytique calculée côté serveur (bandes de santé ADN, `needs[]`, `runwayNote`, mois de trésorerie, sections du plan d'affaires), `user-type.ts`, back-office `/admin/*`.
- **ADR 0024** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : Trust Center, croissance, simulateurs, assistant (ADR 0025)

### Ajouté / modifié
- **i18n §38** : `trust-client`, `growth-client`, `simulator-client` (3 onglets) et `ai-client` entièrement câblés sur `useT()`. **Tous les écrans destinés à l'utilisateur final sont désormais FR / EN.** Blocs catalogue `trust.*`, `growth.*`, `simulator.*`, `ai.*` dans `fr.ts` + `en.ts`.
- **`lib/simulator/tontine.ts`** : `simulateTontine()` (pure) renvoie désormais un descripteur `positionKind` + `myPosition` en plus de `positionNote` (FR) — l'écran reconstruit la phrase via `t()`. Simulateur : `TONTINE_TYPES` → `useTontineTypeList()`, `FREQ_LABEL` local → `formatFrequency()`.
- **Hors périmètre assumé** : prose calculée côté serveur (`trust.fees`/`disclaimers`, `plan.headline`/`step.*`, opportunités & insights), `user-type.ts` (`aiPrompts`), back-office, écrans profil secondaires.
- **ADR 0025** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n : profils utilisateur + écrans profil secondaires (ADR 0026)

### Ajouté / modifié
- **i18n §38** : `lib/user/user-type-i18n.ts` (nouveau) — `useUserTypeMeta()` localise label/hint/`firstSteps`/`aiPrompts` des 5 profils MVP ; `user-type.ts` reste FR (registerSchema, serveur). `home-client`, `ai-client`, `profile-client` basculés dessus.
- Écrans câblés `useT()` : `/profile/{kyc, score, security, notifications, privacy}` — les 7 états KYC + zones d'upload, KESSIA Score, mot de passe/2FA/sessions, préférences de notification, consentements/export RGPD/suppression de compte.
- Blocs catalogue `userType.*`, `kycPage.*`, `scorePage.*`, `securityPage.*`, `notifPrefs.*`, `privacyPage.*` dans `fr.ts` + `en.ts`.
- **Résultat** : plus aucun texte FR en dur dans un écran membre (hors prose analytique générée côté serveur : `score.factors`/`advice`, libellés de consentement, motif de rejet KYC).
- **ADR 0026** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n serveur : prose analytique (ADR 0027)

### Ajouté / modifié
- **i18n §38** : `lib/i18n/core.ts` (cœur sans React : `makeTranslate`) + `lib/i18n/server.ts` (`serverT()` lit le cookie `kessia-locale` via `next/headers`). `I18nProvider` écrit désormais la locale dans un cookie en plus du `localStorage`.
- **Générateurs traduits** : `lib/score/score.service.ts` (bandes, 9 facteurs, tous les détails avec interpolation, conseils), `lib/business/dna.ts` (santé, signaux, besoins), `lib/growth/rules.ts` (`buildGrowthSteps(s, t)` — ~15 étapes) + `lib/growth/plan.ts` (headline, catégories). Blocs catalogue `srvScore.*` / `srvDna.*` / `srvGrowth.*`.
- **Split client/serveur** : `lib/business/plan-shared.ts` (nouveau — types + `PLAN_SECTIONS`, sans dépendance serveur) sort de `plan.ts` pour ne pas tirer `next/headers` dans le bundle client.
- **Hors périmètre assumé** : opportunités, insights, frais (`lib/fees.ts`), notes de trésorerie — mêmes rails, passe suivante. Back-office.
- **ADR 0027** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n serveur : opportunités, insights, frais, trésorerie (ADR 0028)

### Ajouté / modifié
- **i18n §38** : sur les rails d'ADR 0027, `lib/opportunities/engine.ts` (8 types d'opportunités), `lib/insights/insights.service.ts` (~15 insights), `lib/fees.ts` (`FEES` → `feeLines(t)` / `feesSummary(t)`), `lib/business/treasury.ts` (mois + notes de runway) et `app/api/v1/trust/route.ts` (mentions réglementaires, note du Fonds de Garantie, paliers KYC) sont traduits FR / EN.
- `lib/i18n/server.ts` : `serverNumber(n)` pour les montants interpolés (`12 500` / `12,500`).
- Blocs catalogue `srvOpps.*`, `srvInsights.*`, `srvFees.*`, `srvTreasury.*`, `srvTrust.*`.
- **Résultat** : toute la prose serveur destinée au membre est bilingue (vérifié end-to-end via l'API `/trust` et `/opportunities` avec le cookie de langue).
- **ADR 0028** ; `tsc` + `lint` (0 warning) + `vitest` (112) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — Audit de conformité complet (31 août 2026)

### Documentation
- **`docs/progress/audit-2026-08-31.md`** : revue systématique des 62 § contre le code (39 modèles Prisma, ~75 routes API, 1 seul `// TODO` réel). Rapport jugé fidèle, **aucune régression**.
- Corrections : `docs/compliance/matrix.md` (endpoint d'effacement `POST /api/v1/profile/privacy {action:'delete-request'}`, date de revue 0018→0028) ; rapport artifact §39 (mention de rate limiting obsolète alignée sur Upstash/ADR 0014) + panneau dette (pages `/legal/*` FR seulement) + note de méthode.
- Écarts non bloquants listés dans l'audit : i18n `/legal/*` et `/admin/*`, `feesSummary(t)` inutilisé, tests §49 à étendre.

## [Non publié] — Tests : reversal, tontine Croissance, RBAC route, i18n core (ADR 0029)

### Tests
- **`lib/i18n/core.test.ts`** (7) — `interpolate` / `resolve` / `makeTranslate` (repli locale → fr → clé, prose serveur `srv*` en anglais, cohérence `en ⊆ fr`).
- **`test/integration/transfer-reversal.itest.ts`** (2) — crédit destinataire impossible (wallet verrouillé) → `REVERSAL` + solde rétabli + audit `reversed:true` ; transfert nominal sans reversal.
- **`test/integration/tontine-growth.itest.ts`** (1) — tontine `GROWTH` : N tours sans versement puis restitution de `totalContributed` à chaque membre, net = 0, idempotent.
- **`test/integration/admin-rbac.itest.ts`** (3) — `USER` → 403 sur les 10 familles `/admin/*` ; sans token → 401 ; `SUPER_ADMIN` jamais bloqué.
- **119 unitaires** (+7) + **23 intégration** (+6) + 36 E2E.
- **ADR 0029** ; `tsc` + `lint` (0 warning) + `vitest` (119) + `test:integration` (23) + `build` + `playwright` (36) + `db:seed` au vert.

## [Non publié] — i18n back-office `/admin/*` (ADR 0030, dernier bloc §38)

### Ajouté
- **i18n §38 — back-office** : les ~17 fichiers TSX de `/admin/*` (sidebar, garde,
  dashboard, utilisateurs, KYC + revue, transactions, tontines, support + ticket,
  Fonds de Garantie, anti-fraude, modules, analytics) sont FR / EN. Sidebar
  extraite dans `app/admin/sidebar.tsx` (`'use client'`, `useT()`) ; `layout.tsx`
  reste serveur. `app/admin/pills.tsx` : les 4 helpers prennent `t: Translate`
  (libellé via `admin.pill.*`, classe CSS locale).
- **Prose serveur admin** : `lib/admin/copilot.ts` (`computeAdminPriorities()`,
  6 priorités du jour) via `serverT()` (`admin.priorities.*`).
  `lib/analytics/platform.ts` = agrégats purs, rien à traduire.
- Bloc catalogue `admin.*` (~230 clés) dans `fr.ts` + `en.ts` ; parité en/ee ⊆ fr
  vérifiée par `catalogs.test.ts`.
- `analytics/page.tsx` : `fcfa()` local → `formatCurrency()`, `toLocaleString
  ('fr-FR')` → `formatDate()` (locale-aware).

### Périmètre §38
- **§38 = 🟢** : espace membre + back-office + prose serveur tous FR / EN.
  Hors périmètre, documenté : relecture native éwé (finance/légal/KYC) et pages
  `/legal/*` (après validation juridique du texte FR).

### Vérification
- **ADR 0030** ; `tsc` + `lint` (0 warning) + `vitest` (119) + `build` +
  `admin-rbac.itest` (3) au vert. E2E `admin.spec` : heading dashboard vert ; les
  2 tests data-dépendants ont échoué sur une indisponibilité Supabase concomitante
  (P1001 sur `db:seed` au même moment) — snapshot DOM localisé correct, à rejouer
  base rétablie.

## [Non publié] — Wallet séquestre par tontine (ADR 0031, §6.5)

### Ajouté
- **Compte séquestre par tontine** : chaque tontine possède un wallet
  `TONTINE_ESCROW` dédié qui **détient réellement** les cotisations d'un cycle
  entre l'encaissement et le versement — adossé au ledger, plus de cagnotte
  « nulle part ». `Wallet` : `userId` nullable, `+ tontineId @unique`,
  `+ kind WalletKind`. `TontineEventType += ESCROW_SHORTFALL`.
- **`postDoubleEntry`** (`lib/ledger/ledger.service.ts`) : écriture à double
  entrée entièrement atomique entre deux wallets (`SELECT … FOR UPDATE` sur les
  deux lignes dans l'ordre lexicographique, garde de solde, idempotence).
  `createLedgerEntry` gagne aussi le verrou de ligne → **toutes** les opérations
  financières sont protégées du double-débit concurrent.
- **Flux** : cotisation = débit membre → crédit séquestre (`settleContribution`) ;
  versement = débit séquestre → crédit bénéficiaire (`checkAndAdvanceRound`).
  **Garde de sûreté** : jamais de versement > fonds détenus ; en cas de manque,
  refus + événement `ESCROW_SHORTFALL` + log, tontine laissée ACTIVE.
- **Rapprochement** (`lib/tontine/escrow.ts`) : `reconcileTontineEscrow` →
  `{ held, expectedHeld, drift, balanced }` (invariant : solde séquestre ==
  Σ cotisations PAID − Σ `totalReceived`). `refundTontineEscrow` (helper défensif
  d'annulation, testé, non câblé).
- **Surfaces** : `GET /tontine/[id]` → `escrow` pour les membres (« 🔒 X FCFA en
  séquestre pour le groupe ») ; `/admin/tontines` → colonne Séquestre + badge
  « écart » (3 requêtes groupées) ; `/admin/analytics` → KPI « Détenu en séquestre
  (réel) ». `wallet.totalHeld` + volume ledger admin filtrent `kind: USER`.
  Catalogue `admin.tontines.{thEscrow,escrowNote,driftBadge,driftTitle}` +
  `admin.analytics.kEscrowHeld`, FR + EN.

### Nettoyage (p0-4)
- `feesSummary(t)` (code mort, ADR 0028) supprimé + clé `srvFees.summaryLine`
  retirée des catalogues.

### Tests
- `tontine-orchestrator` + `tontine-growth` réécrits escrow-aware (le circuit de
  cotisation passe par le séquestre via `settleContribution` / helper
  `contributeRound`).
- **`test/integration/tontine-escrow.itest.ts`** (4) : invariant vérifié à chaque
  étape d'un cycle rotatif 2×2 + conservation de la masse monétaire ; versement
  refusé si le séquestre est sous-financé (`ESCROW_SHORTFALL`) ;
  `refundTontineEscrow` prorata + idempotent ; propriétés de `postDoubleEntry`
  (atomicité / idempotence / garde de solde / verrou destination).
- **23 → 27 tests d'intégration** (+4). Les 6 suites pré-existantes (ledger,
  reversal, webhooks, RBAC, register, plafonds KYC) restent vertes — le verrou de
  ligne ajouté à `createLedgerEntry` ne casse rien.
- p0-4 : `feesSummary(t)` (code mort, ADR 0028) supprimé + `srvFees.summaryLine`
  retiré des catalogues.

### Vérification
- **ADR 0031** ; `tsc` + `lint` (0 warning) + `vitest` (119) + **`test:integration`
  (27)** + `build` + `db:seed` au vert. Rapprochement des 5 tontines seedées
  actives/terminées : `held == expectedHeld` partout (Σ séquestres = 325 000 FCFA).
  E2E 8/8 (dont `tontine-lifecycle` : cycle complet via le séquestre).

## [Non publié] — PDF serveur, e-mail, cache offline (ADR 0032, §7 / §35 / §51)

### Ajouté
- **PDF côté serveur, sans navigateur** : `lib/pdf/mini-pdf.ts` — générateur A4
  maison, polices standard Helvetica non intégrées, aucune dépendance.
  `renderInvoicePdf` / `renderReceiptPdf`. Routes
  `GET /api/v1/business/[id]/invoices/[invoiceId]/pdf` et
  `GET /api/v1/wallet/transactions/[id]/pdf` (flux `application/pdf`). Liens
  « ⬇ PDF » sur les documents et la ligne de facture.
- **`withAuth` accepte le cookie `kessia-access-token` sur les GET seulement** —
  téléchargement direct d'un PDF depuis le navigateur, zéro surface CSRF.
- **E-mail transactionnel** : `lib/email/email.ts` — Resend si `RESEND_API_KEY`,
  sinon SIMULATION journalisée (même patron que push/SMS).
  `POST /api/v1/business/[id]/invoices/[invoiceId]/email` (PDF en pièce jointe,
  audit `business.invoice_emailed` — domaine destinataire seulement, rate-limit
  10 / 10 min). `.env.example` : `RESEND_API_KEY`, `EMAIL_FROM`.
- **Bandeau hors ligne (§51)** : `hooks/useOnline.ts` + `components/ui/
  OfflineBanner.tsx` (monté dans le layout dashboard + `AdminGuard`).
  `ErrorNote` devient offline-aware et passe à l'i18n (`common.*`).
- **Service worker `kessia-v2`** : navigations réseau-d'abord (timeout 3,5 s) →
  coquille de la même route en cache → `/offline` ; 6 coquilles pré-cachées
  (`/home`, `/wallet`, `/tontine`, `/business`, `/profile`, `/login`) ; cache NAV
  plafonné à 16 entrées. `/api/**` reste réseau-uniquement. `/offline` :
  « Réessayer » réel + rechargement auto au retour du réseau.

### Vérification
- **ADR 0032** ; `tsc` + `lint` (0 warning) + `vitest` (**124**, +5) + `build` au
  vert. Vérifié en direct sur le build : PDF facture (3,4  ko) + reçu (2,3 ko)
  `%PDF-1.4…%%EOF`, e-mail `{ sent:true, simulated:true }`. E2E 13/13 sur le run
  ciblé (dont `navigation` bandeau hors ligne §51, `legal-documents` PDF + e-mail
  simulé §7) — suite totale 38.

## [Non publié] — KPI §54, anti-fraude comportemental, voix (ADR 0033)

### Ajouté
- **KPI back-office plus fins** (`lib/analytics/platform.ts`, `/admin/analytics`) :
  axe **Finance** (revenu KESSIA = Σ `FEE` 30 j + total, flux net dépôts−retraits,
  volumes transferts / retraits / versements, solde moyen), axe **Activation**
  (comptes activés, actifs 7 j / 30 j via `lastLoginAt`, assiduité, **entonnoir
  KYC** en barre empilée), axe **Assistant IA** (conversations / messages /
  utilisateurs engagés 30 j, répartition par contexte, **`answerMix`** : part des
  réponses données / KB / repli). `POST /ai/chat` marque chaque réponse d'un
  `metadata.source`. Catalogue `admin.analytics.*` (~25 clés) FR + EN.
- **Anti-fraude comportemental** (`lib/fraud/rules.ts`, +5 signaux) : `pass_through`
  (layering), `structuring` (smurfing sous plafond), `new_recipient_high_value`,
  `velocity_accel`, `odd_hour`. `engine.ts` : nouvelles fenêtres (1 h, moyenne
  30 j, 1ᵉʳ transfert au bénéficiaire) + **déduplication** — une alerte ouverte
  récente est enrichie (score max, signaux fusionnés) au lieu d'être dupliquée ;
  notification `SECURITY` seulement en cas d'escalade. Toujours **aucun blocage
  automatique**.
- **Miniatures des pièces jointes** (§46) : `TicketAttachment += thumbnail`.
  `prepareAttachment` produit une vignette JPEG ~180 px (≤ 60 ko) ;
  `sanitizeThumbnail` (serveur, PUR, testé) ; `TicketAttachments` affiche une
  vignette 40 px `loading="lazy"` cliquable. L'original inchangé.
- **Couverture voix (§34)** : `lib/voice/commands.ts` — +7 destinations,
  **mots-clés + déclencheurs anglais** sur toutes les routes, intention **retour
  arrière** (`href:'back'` → `router.back()`).

### Non fait, par choix
- **Thème sombre de la landing** : `app/page.module.css` est un design mono-thème
  clair assumé ; rétrofit à risque, sans revue visuelle possible. Documenté.

### Vérification
- **ADR 0033** ; `tsc` + `lint` (0 warning) + `vitest` (**135**, +11 :
  anti-fraude, miniatures, voix) + `build` au vert.

## [Non publié] — Corrections de l'auto-audit (ADR 0034)

### Ajouté
- **PDF validé par un vrai lecteur** : `pdf-lib` en `devDependency` (test
  uniquement — le générateur `lib/pdf/mini-pdf.ts` reste sans dépendance).
  `mini-pdf.test.ts` gagne un bloc **intégrité binaire** (7 tests) : offsets
  `xref` → `N 0 obj`, `trailer /Size` == entrées xref, `/Length` de chaque flux
  == octets réels, `/Count` == objets `Page`, et **`pdf-lib` ouvre + re-sérialise**
  facture / reçu / doc multi-pages (dimensions A4 exactes).
- **i18n §38 — 2 derniers écrans** : blocs de catalogue `tontineDetail.*` (~55),
  `calendar.*` (~15), `srvCalendar.*` (4, titres d'événements serveur) FR + EN.
  `tontine-detail-client.tsx`, `calendar-client.tsx` et `lib/calendar/aggregate.ts`
  (via `serverT()`) n'ont plus de chaîne FR en dur. **§38 reste 🟢** — la
  revendication est maintenant exacte.
- **KPI §54 sous test** : `test/integration/platform.itest.ts` (2 tests, base
  réelle) — contrat de forme + invariants (pourcentages ∈ [0,100], `7j ≤ 30j`,
  `Σ kycFunnel == total`, `netInflow == dépôts − retraits`, 30 buckets jour) et
  réactivité (utilisateur + `DEPOSIT` `COMPLETED` → `total` **et** `activated`
  +1, `totalHeld` / `depositVolume30d` du montant exact).

### Sécurité
- `docs/security/overview.md` : section **« Décisions à valider par une revue
  sécurité externe »** — repli cookie **GET-only** de `withAuth` (ADR 0032) et
  `SELECT … FOR UPDATE` global sur le ledger (ADR 0031) : justification, périmètre
  du risque, points à challenger, bloquants pilote (test de charge + `pg_locks`).

### Vérification
- **ADR 0034** ; `tsc` + `lint` (0 warning) + `vitest` (**143**, +8 PDF) +
  `build` + **`test:integration` 29** (dont `platform` ; escrow rejoué après une
  coupure passagère du pooler Supabase) + **E2E 38/38** + `db:seed` au vert.

## [Non publié] — Deux couleurs d'accent + Tontine Achat individuelle (ADR 0035)

### Ajouté
- **Couleur d'accent au choix** (§36) : la teinte signature `#B65A3A`
  (« Terracotta ») **ou** la teinte d'origine `#C84B1E` (« Brique »). Nouvelle
  entrée « Couleur d'accent » dans le profil (à côté d'« Apparence »), appliquée
  via `data-accent` sur `<html>` avec script anti-flash, persistée par
  navigateur. `globals.css` : bloc `[data-accent='brique']` surchargeant toute
  la famille `--color-primary*`, gradients, focus et ombres, avec réajustement
  des nuances en mode sombre (3 états).
- **Tontine Achat — formule individuelle** (§6.4) : en plus de l'achat groupé
  (cagnotte tournante), une personne peut créer un **plan d'achat pour elle
  seule**. Elle saisit l'article et son prix + le nombre de versements ; KESSIA
  calcule chaque échéance. Les versements sont **détenus sur le compte séquestre
  jusqu'au dernier**, puis recrédités en totalité sur son wallet pour l'achat.
  Un seul membre, aucun code d'invitation, démarrage immédiat.
  - Schéma : `enum PurchaseMode { GROUP SOLO }` ; `Tontine += purchaseMode`,
    `purchaseItem`, `targetAmount`.
  - `resolveDistribution()` + `soloContributionAmount()` (`lib/tontine/type-meta.ts`).
  - L'orchestrateur route le mode `solo` par le chemin de restitution
    `growth` — mêmes garanties séquestre (§6.5) : double écriture atomique,
    verrou de ligne, « jamais plus que détenu », idempotence, réconciliation.
  - Contrat numérique, API (`superRefine`), refus de `join`, UI de création et
    de détail adaptées ; catalogue `tontine.*` / `tontineDetail.*` FR + EN.
  - Seed : 1 plan solo `PENDING` (Kossi — presse à jus, 180 000 FCFA / 6).

### Vérification
- **ADR 0035** ; `tsc` + `lint` (0 warning) + `vitest` (**147**, +4) + `build` +
  **`test:integration`** (nouveau `tontine-solo.itest.ts` ; suite tontine 7/7)
  + **E2E 40/40** (+ plan solo, + bascule couleur Brique persistée) + `db:seed`
  (7 tontines). Le test `wallet` « transfert refusé » a échoué une fois sur
  instabilité du pooler puis passé au rejeu — pas une régression.

## [Non publié] — Mise en ligne + mode démonstration (ADR 0036)

### Déploiement
- **En ligne : https://kessia-dun.vercel.app** — dépôt GitHub
  `essotakougnadi-arch/kessia` + Vercel en **déploiement continu** (chaque push
  sur `main` redéploie). Build `prisma generate && next build` + `postinstall`,
  Root Directory `kessia-app`, 15 variables d'env, cron tontine quotidien (Hobby).
  Vérifié : `/api/health` = `db: ok`, login compte de démo → jetons émis.
- **Environnement de démonstration** : base Supabase de dev, `SMS_PROVIDER=DEV`.

### Ajouté
- **Mode démonstration** (`lib/config/demo.ts`) : `DEMO_MODE=1` fait renvoyer le
  code OTP par `POST /auth/register` et `POST /auth/request-otp` (champ `demoOtp`),
  pré-rempli sur `/verify-otp` avec un encart dédié. **Garde-fou** : inactif si
  `SMS_PROVIDER ≠ DEV` ; avertissement de sécurité journalisé (même posture
  qu'`E2E_RATE_LIMIT_BYPASS`).
- **`NEXT_PUBLIC_DEMO_MODE=1`** : `/login` affiche les comptes de test
  (Membre / Micro-entreprise / Conformité / Admin) — un clic pré-remplit le
  formulaire. Clés `auth.login.demo*` + `auth.verifyOtp.demoNote` FR + EN.
- **`README.md` à la racine du dépôt** (page d'accueil GitHub) + `kessia-app/README.md`
  mis à jour (déploiement, mode démo, structure `admin/*`). `.env.example` :
  `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE`. `.gitignore` : `.vercel`.

### Vérification
- **ADR 0036** ; `tsc` + `lint` (0 warning) + `vitest` (147) + `build` + E2E auth
  (7/7) au vert. Déploiement continu confirmé (5 pushs → 5 builds `READY`).

## [Non publié] — Choix du pays au téléphone (ADR 0037)

### Ajouté
- **`lib/constants/countries.ts`** : **16 pays d'Afrique de l'Ouest** (15 États
  CEDEAO + Mauritanie ; UEMOA d'abord, Togo par défaut), affichés « 🇹🇬 +228 »,
  helpers `toE164`, `findCountry`, `isNationalLengthPlausible`,
  `readStoredCountryIso` / `storeCountryIso` (mémorise le dernier pays dans
  `localStorage`).
- **`components/auth/CountryPhoneField.tsx`** : liste déroulante maison
  (`combobox` + `listbox`, clavier + type-ahead) avec **drapeaux SVG réels**
  (`public/flags/<iso>.svg`, 16 fichiers ~8 Ko) — le `<select>` natif n'affiche
  pas les drapeaux emoji sous Windows. Champ contrôlé, deux champs cachés
  (`phone` en E.164, `country` en ISO), libellé d'aide dynamique, cue de
  longueur non bloquant, thème clair/sombre.
- `countries.test.ts` (6 tests).

### Modifié
- `/register` et `/login` (mot de passe **et** OTP) : `CountryPhoneField` à la
  place du préfixe `+228` en dur ; le handler compose le numéro E.164.
- `registerSchema` : `country` optionnel (ISO alpha-2) → `UserProfile.country`.
- i18n FR + EN : `auth.{login,register}.countryLabel`, `auth.register.phoneError`.
- Interface (hors ADR) : logos officiels PNG transparents (couleur / blanc) à la
  place du JPEG rogné en CSS ; cartes « Fonctionnalités » de la landing centrées
  + icônes animées.

### Vérification
- **ADR 0037** ; `tsc` + `lint` (0 warning) + `vitest` (**153**, +6) + `build` au vert.

## [Non publié] — Découverte de tontines & demandes d'adhésion (ADR 0038)

### Ajouté
- **`GET /api/v1/discover`** (publique) : tontines `isPublic` + `PENDING` +
  non pleines, triées par date de création.
- **`TontineJoinRequest`** + `enum JoinRequestStatus` + `Tontine.membershipConditions`
  (texte libre). `lib/tontine/join.ts` `describeJoinability()` (+ 7 tests).
- **`POST/GET /api/v1/tontine/[id]/join-requests`** + **`PATCH …/[requestId]`**
  (`approve` / `reject` + motif par le gestionnaire ; `cancel` par le candidat
  via `requestId = "me"`). L'acceptation crée le membre et démarre la tontine
  si elle devient complète. Notifications à chaque étape.
- **`GET /api/v1/tontine/[id]`** enrichi : `membershipConditions`,
  `myJoinRequest`, `pendingJoinRequestCount`.
- **`components/discover/DiscoveryRail.tsx`** (rail / grille) sur la landing
  (« Tontines ouvertes en ce moment ») et l'accueil ; **page publique
  `/discover`** (hors `PROTECTED_ROUTES`).
- **Détail tontine** : `JoinRequestPanel` (candidat) + `ManageRequestsPanel`
  (gestionnaire) ; sections membres masquées aux non-membres.
- `useAuth.finishSession` : redirection `?next` / `?from` / intention stockée
  (chemins internes) au lieu de `/home` en dur.
- i18n FR + EN : `discover.*`, `tontineJoin.*`, `tontineRequests.*`.
- Seed : 4 tontines publiques ouvertes + 4 demandes de démonstration.

### Vérification
- **ADR 0038** ; `tsc` + `lint` (0 warning) + `vitest` (**160**, +7) + `build`
  + E2E (auth, tontine-lifecycle) au vert. Smoke test API du parcours complet.

## [Non publié] — Accent Violet + sélecteur visible (amendement ADR 0035)

### Modifié
- 2ᵉ couleur d'accent : **Violet `#5B34D6`** au lieu de « Brique » (trop proche
  de la terracotta). `AccentChoice = 'terracotta' | 'violet'` ; `data-accent="violet"`.
- **`/profile`** : le choix quitte la modale enfouie → **carte inline « Couleur
  de l'application »** avec 2 grandes tuiles, en haut de la page. Application
  immédiate, persistée, sans rechargement.
- `globals.css` : bloc `:root[data-accent='violet']` (+ variantes sombres).
- Dégradés codés en dur repassés sur les tokens : `.balanceCard` (accueil +
  wallet), `.progressFill` (tontines), `.profileHero` → suivent l'accent.
- `navigation.spec.ts` mis à jour (`#accent-violet` / `#accent-terracotta`).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**167**) + `build` + E2E navigation (6/6).

## [Non publié] — Modules de la feuille de route en simulation (ADR 0040)

### Ajouté
- **KESSIA Academy** (`/academy`), **Communauté** (`/community`),
  **KESSIA Jobs** (`/jobs`), **KESSIA Global / Diaspora** (`/diaspora`)
  passent **LIVE** : pages complètes, données de démonstration
  (`lib/modules/*-data.ts`), actions simulées côté client (inscription,
  adhésion, candidature). `/diaspora` réutilise les **vraies** données
  de `/discover` (tontines + marketplace) pour ses rails de découverte.
- **KESSIA Invest** (`/invest`) et **KESSIA Insurance** (`/insurance`)
  restent **`REGULATED`** (aucune promesse de rendement / KESSIA n'est
  pas assureur) : page d'attente plus riche (catégories envisagées,
  bascule d'intérêt, ponts vers Plan de croissance / Simulateurs /
  Fonds de Garantie) mais **sans aucune offre ni montant simulé**.
- `components/modules/module-page.module.css` — styles partagés des 6
  pages. `lib/modules/catalog.ts` : 4 modules `SOON → LIVE` + `href` ;
  `INTEREST_KEYS` accepte aussi des clés hors catalogue (`diaspora_transfer`).
- `/explore` : les modules `SOON`/`REGULATED` avec `href` affichent un
  lien « En savoir plus → » à côté de la bascule d'intérêt.
- `catalog.test.ts` (5 tests). i18n FR + EN (`modulesPages.*`).

### Vérification
- **ADR 0040** ; `tsc` + `lint` (0 warning) + `vitest` (**172**, +5) +
  `build` + **E2E complet (40/40)** au vert.

## [Non publié] — KESSIA Invest / Insurance : exemples chiffrés (ADR 0040, amendement)

### Ajouté
- `/invest` et `/insurance` (toujours `REGULATED`) affichent désormais
  des **exemples de projets/formules chiffrés** — 5 projets d'exemple
  (`INVEST_EXAMPLE_PROJECTS`) et 5 formules d'exemple
  (`INSURANCE_EXAMPLE_PLANS`) dans `lib/modules/invest-insurance-data.ts` :
  filtres par catégorie, barre de progression de financement, montants
  FCFA, garanties. **Chaque montant porte dans son propre libellé** la
  mention « exemple », « indicatif » ou « non contractuel » (pas
  seulement dans le bandeau de page) — aucune promesse de rendement,
  aucune prime réelle, aucune souscription possible.
- Actions simulées par carte : « M'intéresser à ce projet » (Invest),
  « Voir un exemple de simulation » (Insurance) — toast de confirmation,
  aucune écriture serveur, distinctes de la bascule d'intérêt globale du
  module.
- i18n FR + EN (`modulesPages.invest.*` / `modulesPages.insurance.*`).

### Vérification
- `tsc` + `lint` (0 warning) + `vitest` (**172**, inchangé) + `build` +
  **E2E complet (40/40)** au vert. Vérifié visuellement en local
  (Playwright : filtre catégorie + action + toast sur les deux pages).

## [Non publié] — Service Worker : purge du cache (kessia-v3)

### Corrigé
- Après une série de déploiements rapprochés, le Service Worker pouvait
  servir à un visiteur revenant une **coquille de page en cache
  périmée** (ex. landing sans les carrousels tontines/marketplace) si
  la requête réseau dépassait le délai de repli. `VERSION` passe de
  `kessia-v2` à **`kessia-v3`** → à la prochaine visite, tous les
  anciens caches sont purgés (`activate` supprime tout ce qui ne
  commence pas par la nouvelle version). `NAV_TIMEOUT_MS` 3,5 s → **6 s**
  (marge sous charge DB avant repli hors ligne).

## [Non publié] — Mini-marketplace & achat par tontine (ADR 0039)

### Ajouté
- **`MarketplaceItem` + `MarketplaceOrder`** + enums (`MarketplaceItemStatus`,
  `MarketplaceOrderMode`, `MarketplaceOrderStatus`). `lib/marketplace/`
  (`installmentAmount`, `describeBuyability` — pures, +7 tests).
- **API** : `GET /api/v1/marketplace` (public, filtres), `POST` (vente),
  `GET/PATCH/DELETE /api/v1/marketplace/[id]`, `GET /api/v1/marketplace/mine`,
  **`POST /api/v1/marketplace/[id]/order`** :
  - `WALLET` → `postDoubleEntry` acheteur→vendeur (`SALE_PAYMENT`), `stock--` ;
  - `TONTINE` → crée une tontine `PURCHASE`/`SOLO` pré-remplie (cible = prix)
    et redirige l'acheteur dessus.
- `GET /api/v1/discover` renvoie aussi `items` (marketplace).
- **Pages** `(dashboard)/marketplace/` (protégées) : catalogue + filtres,
  détail + modale d'achat wallet/tontine, formulaire de vente (photo
  compressée), « Mes articles & achats ». Nav Marketplace (Sidebar + accueil).
- **`components/discover/MarketplaceRail.tsx`** sur landing + accueil.
- Module `market` → **`LIVE`** (`/explore`).
- **Sidebar branchée sur l'utilisateur réel** (nom, KYC, avatar) +
  **déconnexion fonctionnelle** — fin du stub « Kossi Abalo ».
- `lib/files/compress-image.ts` extrait. i18n FR + EN (`market.*`, `nav.*`).
- Seed : 7 articles + 1 achat wallet.

### Vérification
- **ADR 0039** ; `tsc` + `lint` (0 warning) + `vitest` (**167**, +7) + `build`
  + E2E (auth, wallet) au vert. Smoke test API : vente → achat wallet
  (solde débité) → achat tontine (tontine SOLO créée) → « Mes achats ».
