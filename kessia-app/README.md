# KESSIA — Application Web (MVP)

> Épargner ensemble. Entreprendre ensemble. Grandir ensemble.
> Super App coopérative de l'entrepreneuriat africain — marché initial : Togo.

Ce dossier (`kessia-app/`) contient l'**application web Next.js** : frontend + API routes + accès base de données (modular monolith, conforme au cahier des charges §40 pour le MVP).

**En ligne (démonstration) :** <https://kessia-dun.vercel.app> — déploiement continu depuis GitHub (`main`).

## Stack

| Couche | Techno |
|---|---|
| Framework | Next.js 14 (App Router) |
| Langage | TypeScript |
| Base de données | PostgreSQL (Supabase) via Prisma |
| État client | Zustand + SWR |
| Auth | JWT access (15 min) + refresh token rotatif (30 j), OTP SMS |
| Styles | CSS Modules + design tokens (`app/globals.css`) |

## Démarrage

```bash
npm install
npx prisma generate
npx prisma migrate deploy   # applique l'historique versionné (prisma/migrations/)
npm run db:seed             # données de démonstration (dev uniquement)
npm run dev                 # http://localhost:3000
```

> Schéma versionné depuis l'ADR 0048 : `prisma/migrations/` fait foi. `prisma db push`
> reste disponible pour un prototypage local jetable mais **ne doit plus être utilisé
> sur une base partagée (démo/staging/prod)** — toute évolution de schéma passe par
> `npx prisma migrate dev --name <intitulé>` puis `migrate deploy`. Voir
> `docs/audit/DATABASE_MIGRATION_PLAN.md`.

### Variables d'environnement

- `.env.local` — lu par Next.js (app runtime)
- `.env` — lu par le CLI Prisma uniquement (garder `DATABASE_URL` synchronisé)

Clés attendues : voir `.env.local` (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, SMS_PROVIDER, Supabase…).
En développement, les codes OTP s'affichent dans la console du serveur (`SMS_PROVIDER=DEV`).

**Mode démonstration** (`DEMO_MODE=1` + `NEXT_PUBLIC_DEMO_MODE=1`, uniquement si `SMS_PROVIDER=DEV`) :
sur un déploiement public sans fournisseur SMS, l'API renvoie le code OTP dans sa réponse et
`/login` affiche les comptes de test. À n'activer que sur un environnement de démonstration.

Optionnelles :
- `PAYMENT_WEBHOOK_SECRET` — clé HMAC-SHA256 vérifiant la signature des webhooks de règlement (`POST /api/v1/payments/webhooks/[provider]`). **Non définie en dev** → les webhooks sont acceptés mais tracés. **Obligatoire en production.**
- `CRON_SECRET` — attendu dans l'en-tête `x-cron-secret` par `POST /api/v1/cron/tontine-tick`. **Obligatoire en production** (sans lui, l'endpoint refuse tout appel en prod).
- `GUARANTEE_FUND_USER_REQUESTS=1` — affiche le formulaire de demande au Fonds de Garantie Solidaire côté membre (**démonstration uniquement** — le fonds n'est pas actif, voir ADR 0010). Les écrans admin et d'information restent visibles sans ce drapeau.
- `E2E_RATE_LIMIT_BYPASS=1` — désactive le rate limiting. **Réservé aux tests E2E**, jamais sur un déploiement réel (un avertissement de sécurité est loggé si défini).

> ⚠️ L'hôte Supabase direct `db.<ref>.supabase.co` est déprécié (fin IPv4). `DATABASE_URL` pointe sur le **pooler en mode session** (`...pooler.supabase.com:5432`).

## Comptes de démonstration (après `npm run db:seed`)

| Rôle | Téléphone | Mot de passe |
|---|---|---|
| Utilisateur (données riches) | `+22890000001` | `Kessia2026!` |
| Utilisateurs | `+22890000002` … `04` | `Kessia2026!` |
| Admin | `+22890000000` | `Kessia2026!` |

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run db:migrate:deploy` | Applique `prisma/migrations/` (démo/staging/prod) |
| `npm run db:migrate` | Crée + applique une migration en dev (`prisma migrate dev`) |
| `npm run db:push` | Prototypage local jetable uniquement — **jamais sur une base partagée** |
| `npm run db:seed` | Remplit la base avec des données de démo |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitaires (vitest) |
| `npm run test:e2e` | Tests E2E (Playwright) — voir ci-dessous |

### Tests E2E

```bash
# 1. Configurer une base de test ISOLÉE (une seule fois)
cp .env.test.example .env.test        # puis renseigner DATABASE_URL (base dédiée)

# 2. À chaque campagne
npm run build
npm run test:e2e:isolated             # = db:test:reset (schéma neuf + seed) puis Playwright
```

`npm run db:test:reset` refuse de tourner si `.env.test` pointe la même base
que `.env.local` (garde-fou anti-`--force-reset` sur la démo). La config
Playwright injecte automatiquement cette base dans le serveur lancé pour les
tests et n'y réutilise jamais un `next dev` branché sur la démo.

Sans `.env.test`, `npm run test:e2e` vise la base de `.env.local` (démo
partagée) — acceptable en dépannage, mais deux suites peuvent flancher par
accumulation de données. Voir [`docs/development/testing.md`](docs/development/testing.md).

Cibler un serveur déjà lancé : `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
En CI : [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) (Postgres éphémère).

## Structure

```
app/
  (auth)/        login · register · verify-otp
  (dashboard)/   home · wallet · tontine · business · ai · support · notifications · profile
  admin/         back-office (dashboard · users · KYC · transactions · tontines · support · fraude · analytics)
  documents/     devis / factures / reçus imprimables
  legal/ offline/ …
  api/v1/        routes API versionnées
components/      design-system · layout · ui
hooks/           useAuth · useWallet · useTontines · useTontineDetail · useProfile · useKyc · …
lib/             api/client (fetch authentifié + refresh) · auth · db · ledger · utils
prisma/          schema.prisma · seed.ts
docs/            architecture · décisions · base · avancement
```

## Déploiement

Hébergé sur **Vercel**, connecté au dépôt GitHub : chaque `push` sur `main` redéploie.

| Réglage | Valeur |
|---|---|
| Root Directory | `kessia-app` |
| Build Command | `prisma generate && next build` (via `package.json`) |
| Variables d'env | contenu de `.env.local` sauf `NODE_ENV` ; `NEXTAUTH_URL` = l'URL de production |
| Cron | `vercel.json` — `/api/v1/cron/tontine-tick` (quotidien sur le plan Hobby) |

## État & feuille de route

Voir [`docs/progress/status.md`](docs/progress/status.md) et [`CHANGELOG.md`](CHANGELOG.md).
La feuille de route par phases est dans le cahier des charges (§52).

## Documents de référence

- `../KESSIA_MASTER_PROMPT.md`
- `../KESSIA_MVP_SPEC.md`
- `../KESSIA_DESIGN_SYSTEM.md`
- `../CLAUDE_CODE_RULES.md`
- Cahier des charges final (61 sections) — document produit maître.
