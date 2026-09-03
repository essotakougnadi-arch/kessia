# ADR 0036 — Mise en ligne + mode démonstration

**Statut :** accepté · **Date :** 2026-09-03

## Contexte
Le MVP durci est complet. Suite logique après l'audit d'avancement :
1. **Déployer** l'application sur un hébergement public.
2. La rendre **explorable sans friction** : sur un déploiement sans
   fournisseur SMS, personne ne peut recevoir de code OTP → ni s'inscrire,
   ni se connecter par OTP.
3. Donner au dépôt GitHub une **page d'accueil** digne de ce nom.

## Décision

### Déploiement — Vercel + GitHub (continu)
- Dépôt **`essotakougnadi-arch/kessia`** (privé). Secrets (`.env`, `.env.local`)
  exclus ; `.env.example` documente les 15 paramètres.
- Projet **Vercel** connecté au dépôt : **chaque push sur `main` redéploie**.
  - `package.json` : `build` → `prisma generate && next build` + `postinstall`
    (Prisma sur Vercel ne régénère pas le client sur un cache d'install).
  - **Root Directory = `kessia-app`** (l'app est dans le sous-dossier).
  - `vercel.json` : cron `/api/v1/cron/tontine-tick` ramené à **quotidien**
    (le plan Hobby refuse les crons sub-quotidiens — sinon le déploiement est bloqué).
  - Garde-fou Hobby : les commits doivent porter un **e-mail rattaché à un
    compte GitHub** (historique réécrit vers `essotakougnadi@gmail.com`).
- **En ligne : https://kessia-dun.vercel.app** — vérifié : `/api/health` = `db: ok`,
  login d'un compte de démo → jetons émis.

### Mode démonstration (`lib/config/demo.ts`)
- **`DEMO_MODE=1`** (serveur) : `POST /auth/register` et `POST /auth/request-otp`
  ajoutent **`demoOtp`** à leur réponse. Le client le pré-remplit sur
  `/verify-otp` avec un encart « mode démonstration ».
- **Garde-fou** : inactif si `SMS_PROVIDER ≠ "DEV"` — un déploiement avec un
  vrai fournisseur SMS ne peut pas exposer d'OTP, même si le drapeau est posé.
  Avertissement de sécurité journalisé au premier usage. Même posture
  qu'`E2E_RATE_LIMIT_BYPASS` : opt-in explicite, jamais sur un déploiement
  avec de vrais utilisateurs.
- **`NEXT_PUBLIC_DEMO_MODE=1`** (client) : `/login` affiche les **comptes de
  test** (Membre / Micro-entreprise / Conformité / Admin) — un clic pré-remplit
  le formulaire. Les identifiants sont déjà publics (seed / README).

### README
- **Nouveau `README.md` à la racine du dépôt** : pitch, lien démo, périmètre
  MVP, stack, structure, démarrage local, comptes de démo, qualité, suivi.
- `kessia-app/README.md` : section Déploiement, mention du mode démo, structure
  `admin/*` corrigée (n'était plus « en construction »), commentaire de
  déclenchement de déploiement retiré.
- `.env.example` : `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE`. `.gitignore` : `.vercel`.

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (147) + `build` + E2E auth (7/7) au vert.
- ✅ Déploiement **continu** confirmé : 5 pushs successifs → 5 builds `READY`.
- ✅ Une fois `DEMO_MODE=1` + `NEXT_PUBLIC_DEMO_MODE=1` posés sur Vercel, un
  visiteur peut s'inscrire, vérifier son OTP et se connecter entièrement en ligne.
- ⏳ Reste (bloquants pilote, pas du dev) : base de production **séparée de la
  démo**, APM, gestionnaire de secrets, Redis, backups + test DR, et les gates
  juridiques / contrats / KYC habilité.
