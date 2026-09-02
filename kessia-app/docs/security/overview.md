# Sécurité — vue d'ensemble (§31, §32, §47)

_Complément de `docs/compliance/matrix.md` (volet réglementaire) et de
`docs/operations/backup-recovery.md` (volet reprise)._

## Principe directeur

> « Le frontend n'est jamais une frontière de sécurité. »

Chaque route API revalide l'authentification, le rôle et la propriété des
ressources. L'UI ne fait que masquer ce qui n'est pas autorisé.

## Authentification & session

- Mot de passe : bcrypt. Verrouillage après 5 échecs (15 min).
- Session : JWT d'accès court (15 min) + refresh rotatif hashé en base.
- **Middleware edge** (`middleware.ts`) : vérifie cryptographiquement le JWT
  (`jose`) et le rôle pour `/admin/*`. Nettoie le cookie mort.
- **MFA / TOTP** (`otplib`) + 8 codes de secours hashés (SHA-256). Défi de
  connexion via `challengeToken` (JWT 5 min).
- Changement de mot de passe → révocation de **toutes** les sessions + notif.
- `/profile/security` : sessions actives listées et révocables une à une.

## Contrôle d'accès (RBAC)

- 12 rôles (`UserRole`). `withAuthAndRole`, `assertOwnership`,
  `requireAdmin(roles?)`, `requireBusinessOwner`.
- `userType` (déclaratif) **n'accorde aucune permission** — distinct du rôle.
- Élévation de rôle automatique à l'usage (`TONTINE_MANAGER`,
  `BUSINESS_OWNER`) — jamais de rétrogradation, jamais un rôle privilégié.

## Plafonds & AML (§30)

- `lib/kyc/limits.ts` : plafonds **par opération** et **mensuels sortants**,
  fonction du palier KYC (0 / 1 / 2). Appliqués côté serveur dans
  `wallet/transfer` et `payments` (OUTBOUND). Visibles dans le Trust Center.
- `lib/kyc/screening.ts` : **stub local** de screening sanctions/PPE — pose un
  drapeau pour la revue humaine, ne bloque rien. **Bloquant pilote** :
  prestataire habilité + base à jour.

## Anti-fraude (§32)

- `lib/fraud/rules.ts` (pur, testé) : score de risque à partir de signaux —
  nouvel appareil, vélocité de transferts, montant anormal vs historique,
  quasi-vidage du solde, compte dormant, compte très récent + gros montant,
  burst d'échecs de connexion.
- `lib/fraud/devices.ts` : empreinte prudente à partir des en-têtes (pas de
  fingerprinting invasif). `Device` par compte, premier appareil « de confiance ».
- `lib/fraud/engine.ts` : rassemble les signaux, crée une `FraudAlert`
  (`OPEN`) si score ≥ 30, notifie l'utilisateur en `SECURITY` si risque
  `HIGH`/`CRITICAL`, audite. **Aucun blocage automatique de fonds** — un
  humain (`COMPLIANCE`) confirme ou écarte via `/admin/fraud`.

## Journalisation & observabilité (§47)

- `lib/audit/audit.service.ts` : `recordAudit` non bloquant sur toutes les
  actions critiques. Ne logge jamais de secret / OTP / contenu KYC.
- `lib/logger.ts` (winston) + `logApiError` sur ~50 routes.
- `GET /api/health` (public) : ping DB, 200/503.
- `GET /api/metrics` : métriques format Prometheus, protégées par
  `METRICS_TOKEN`. Pas d'exposition publique sans ce jeton.
- **Bloquant pilote** : brancher un APM (traces, alertes) et acheminer les
  logs vers une plateforme centralisée avec rétention.

## Rate limiting

- `lib/security/rate-limit.ts` : `enforceRateLimit()` **asynchrone**.
  **Upstash Redis** (sliding window, compteur partagé) si
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` sont fournis ; sinon
  compteur mémoire (mono-instance). Repli mémoire sur toute erreur Upstash.
  (auth, wallet, kyc, ai, payments, tontine.join, guarantee.claim…)
- `E2E_RATE_LIMIT_BYPASS=1` : uniquement en test. Jamais sur un déploiement réel.

## Notifications (§33)

- `lib/notifications/channels.ts` : abstraction multi-canal. `IN_APP` réel ;
  `PUSH` / `SMS` / `EMAIL` en **simulation** tant qu'aucun fournisseur n'est
  configuré (`*_PROVIDER_KEY`, `NOTIFY_WEBHOOK_URL`). Chaque tentative est
  journalisée (`NotificationDelivery`).

## Stockage des pièces KYC (§30)

- `lib/storage/{supabase-storage,kyc-storage}.ts` : **Supabase Storage**
  (bucket privé `SUPABASE_KYC_BUCKET`) + URL signées **5 min**, dès que
  `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` sont fournis.
  Sinon repli data-URI en base (dev). Jamais de contenu brut renvoyé — le
  back-office conformité reçoit une URL signée. Nettoyage best-effort du
  bucket au remplacement / retrait d'une pièce.

## Secrets

`.env.example` liste tous les paramètres. `.env` / `.env.local` jamais
committés. **Bloquant pilote** : gestionnaire de secrets + procédure de
rotation documentée — voir `docs/operations/backup-recovery.md` §7.

## Décisions à valider par une revue sécurité externe

Deux changements récents (ADR 0031, ADR 0032) touchent des mécanismes
sensibles. Ils sont **volontaires et documentés ici**, mais doivent être
confirmés par un audit tiers avant le pilote.

### 1. Repli cookie en lecture seule pour `withAuth` (ADR 0032)

`withAuth` accepte désormais, **uniquement sur les requêtes `GET`**, le
jeton d'accès depuis le cookie `kessia-access-token` à défaut d'en-tête
`Authorization: Bearer` :

```ts
extractBearerToken(authHeader)
  ?? (request.method === 'GET'
        ? request.cookies.get('kessia-access-token')?.value ?? null
        : null)
```

- **Pourquoi** : permettre le téléchargement direct d'un PDF (facture,
  reçu) via un simple lien `<a href>` ou une nouvelle fenêtre, où le
  navigateur ne peut pas porter d'en-tête `Authorization`.
- **Périmètre du risque** : le repli est **strictement `GET`** ; aucune
  mutation ne peut être déclenchée par un cookie ambiant, donc pas de
  nouvelle surface CSRF sur les écritures. Les routes `GET` concernées ne
  renvoient que des ressources dont `withAuth` revérifie la propriété.
- **À challenger** : exfiltration via balise (`<img src>` vers une route
  GET qui renvoie des données lisibles cross-origin), comportement en cas
  de jeton expiré, cohérence avec le `SameSite` du cookie
  (`Lax` aujourd'hui). Envisager un cookie de téléchargement dédié,
  courte durée, `SameSite=Strict`, limité aux préfixes `/api/**/pdf`.

### 2. `SELECT … FOR UPDATE` sur toutes les écritures ledger (ADR 0031)

`createLedgerEntry` et `postDoubleEntry` verrouillent désormais les
lignes `wallets` concernées (`lockWallets`, ordre trié) au sein de la
transaction, avec `{ timeout: 15_000, maxWait: 8_000 }`.

- **Pourquoi** : fermer la fenêtre TOCTOU entre la lecture du solde et
  son écriture (double débit sous concurrence, course cotisation /
  versement de tontine).
- **Impact** : comportement applicatif global — toute opération sur un
  wallet sérialise les autres opérations sur **le même** wallet. Sur le
  pooler Supabase, des transactions longues ont déjà nécessité des
  timeouts relevés (cf. §Escrow d'ADR 0031).
- **À challenger** : tenue en charge (contention sur les wallets
  « chauds » : séquestres de grosses tontines, compte de frais KESSIA),
  risque d'interblocage si un futur chemin verrouille des wallets dans un
  ordre non trié, épuisement du pool de connexions si `maxWait` est
  atteint en rafale. **Bloquant pilote** : test de charge dédié +
  métriques de contention (`pg_locks`) branchées sur l'APM.

## Ce qui reste (bloquants avant pilote)

Voir `docs/compliance/matrix.md`. En résumé : IDV liveness + screening
habilité, APM branché (endpoint `/api/metrics` prêt), secrets manager,
sauvegardes hors-hébergeur + test de restauration consigné, nettoyage du
bucket KYC à la suppression RGPD.
