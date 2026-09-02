# KESSIA — Application Web (MVP)

> Épargner ensemble. Entreprendre ensemble. Grandir ensemble.
> Super App coopérative de l'entrepreneuriat africain — marché initial : Togo.

Ce dossier (`kessia-app/`) contient l'**application web Next.js** : frontend + API routes + accès base de données (modular monolith, conforme au cahier des charges §40 pour le MVP).

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
npx prisma db push          # synchronise le schéma
npm run db:seed             # données de démonstration (dev uniquement)
npm run dev                 # http://localhost:3000
```

### Variables d'environnement

- `.env.local` — lu par Next.js (app runtime)
- `.env` — lu par le CLI Prisma uniquement (garder `DATABASE_URL` synchronisé)

Clés attendues : voir `.env.local` (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, SMS_PROVIDER, Supabase…).
En développement, les codes OTP s'affichent dans la console du serveur (`SMS_PROVIDER=DEV`).

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
| `npm run db:push` | Synchronise le schéma Prisma → PostgreSQL |
| `npm run db:seed` | Remplit la base avec des données de démo |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitaires (vitest) |
| `npm run test:e2e` | Tests E2E (Playwright) — voir ci-dessous |

### Tests E2E

```bash
# ⚠️ Viser une base de test JETABLE (Postgres local ou branche Supabase), jamais la prod.
DATABASE_URL=<test> npm run db:push && npm run db:seed
npm run build
E2E_RATE_LIMIT_BYPASS=1 npm run test:e2e      # démarre `next start` et lance Playwright
```

Cibler un serveur déjà lancé : `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.
En CI : [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) (Postgres éphémère).

## Structure

```
app/
  (auth)/        login · register · verify-otp
  (dashboard)/   home · wallet · tontine · business · ai · support · notifications · profile
  (admin)/       back-office (en construction — Phase 6)
  api/v1/        routes API versionnées
components/      design-system · layout · ui
hooks/           useAuth · useWallet · useTontines · useTontineDetail · useProfile · useKyc · …
lib/             api/client (fetch authentifié + refresh) · auth · db · ledger · utils
prisma/          schema.prisma · seed.ts
docs/            architecture · décisions · base · avancement
```

## État & feuille de route

Voir [`docs/progress/status.md`](docs/progress/status.md) et [`CHANGELOG.md`](CHANGELOG.md).
La feuille de route par phases est dans le cahier des charges (§52).

## Documents de référence

- `../KESSIA_MASTER_PROMPT.md`
- `../KESSIA_MVP_SPEC.md`
- `../KESSIA_DESIGN_SYSTEM.md`
- `../CLAUDE_CODE_RULES.md`
- Cahier des charges final (61 sections) — document produit maître.

<!-- deploy 2026-09-02T16:47:46.3941239+00:00 -->
