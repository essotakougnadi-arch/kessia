# KESSIA

> **Épargner ensemble. Entreprendre ensemble. Grandir ensemble.**
> Super-app coopérative de l'entrepreneuriat africain — marché initial : Togo (UEMOA).

**🌍 Démonstration en ligne : <https://kessia-dun.vercel.app>**

KESSIA réunit dans une seule application le wallet, les tontines numériques, un
ERP léger pour les micro-entrepreneurs, un back-office de supervision et un
assistant. Ce dépôt contient le **MVP durci** (phases 0 → 7 du cahier des charges),
déployé et fonctionnel en environnement de démonstration.

## Ce que couvre le MVP

| Domaine | Contenu |
|---|---|
| **Identité & sécurité** | Inscription OTP, sessions JWT + refresh rotatif, MFA/TOTP + codes de secours, RBAC 12 rôles, journal d'audit, rate limiting, anti-fraude à base de règles + signaux comportementaux (jamais de blocage automatique de fonds) |
| **KESSIA Wallet** | Solde, historique, dépôts / transferts / retraits (fournisseurs simulés), QR, reçus PDF — adossé à un **ledger idempotent** (double entrée, verrou de ligne) |
| **Tontines** | 4 types (Classique, Projet, Croissance, Achat — groupé **ou individuel**), cycle automatique, **compte séquestre par tontine**, contrat numérique, Fonds de Garantie (démonstration) |
| **Business Suite** | Produits, ventes, dépenses, CRM clients / fournisseurs, devis → factures + **PDF serveur** + e-mail, trésorerie, ADN d'entreprise, plan d'affaires |
| **KYC** | Flux complet, revue admin, plafonds par niveau appliqués côté serveur, pièces en bucket privé + URL signées |
| **Back-office `/admin/*`** | ~17 écrans de supervision + KPI (revenu, activation, entonnoir KYC, usage assistant) |
| **Transverse** | Trust Center, agenda, plan de croissance, simulateurs, assistant (règles + voix FR/EN), **i18n FR / EN complète**, thème clair / sombre + 2 couleurs d'accent, PWA (service worker, hors-ligne), pages légales (brouillons) |

## Stack

Next.js 14 (App Router) · TypeScript · PostgreSQL (Supabase) via Prisma ·
Zustand + SWR · CSS Modules + design tokens · déploiement Vercel.

Architecture : *modular monolith* (frontend + API routes + accès DB dans un seul
service Next.js) — choix assumé pour le MVP (ADR 0001).

## Structure du dépôt

```
kessia-app/            l'application Next.js (voir son README)
  app/ · components/ · hooks/ · lib/ · prisma/ · test/ · docs/
.github/workflows/     CI : lint + typecheck + tests · intégration · E2E · cron
KESSIA_*.md            documents produit (master prompt, spec MVP, design system, règles)
```

## Démarrer en local

```bash
cd kessia-app
npm install
cp .env.example .env.local          # puis renseigner DATABASE_URL, secrets JWT, Supabase…
npx prisma generate
npm run db:push
npm run db:seed                     # données de démonstration
npm run dev                         # http://localhost:3000
```

Détails, scripts, tests E2E et déploiement : [`kessia-app/README.md`](kessia-app/README.md).

## Comptes de démonstration

| Rôle | Téléphone | Mot de passe |
|---|---|---|
| Membre (données riches) | `+228 90 00 00 01` | `Kessia2026!` |
| Membre (micro-entreprise) | `+228 90 00 00 02` | `Kessia2026!` |
| Conformité | `+228 90 00 00 11` | `Kessia2026!` |
| Admin | `+228 90 00 00 00` | `Kessia2026!` |

Sur le déploiement de démonstration, ces comptes sont proposés directement sur l'écran
de connexion.

## Qualité

`tsc` + ESLint (0 warning) + **147 tests unitaires** (vitest) + **31 tests d'intégration**
contre une vraie base + **40 tests E2E** (Playwright) + `next build`. CI GitHub Actions.

## Suivi

- [`kessia-app/docs/progress/status.md`](kessia-app/docs/progress/status.md) — état d'avancement
- [`kessia-app/CHANGELOG.md`](kessia-app/CHANGELOG.md) — journal des changements
- [`kessia-app/docs/decisions/`](kessia-app/docs/decisions/) — ADR (décisions d'architecture)

## Statut

MVP durci **livré et déployé** (démonstration). Ce qui reste avant un pilote relève du
juridique, des contrats partenaires et de l'infrastructure de production régulée — pas
du développement. Les services financiers réglementés (Invest, Insurance, activation du
Fonds de Garantie) ne sont pas activés avant validation.

Les pages légales sont des **brouillons à valider juridiquement**.
