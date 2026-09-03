# ADR 0038 — Découverte de tontines & demandes d'adhésion (étape 1)

**Statut :** accepté · **Date :** 2026-09-03

## Contexte

Rejoindre une tontine supposait de **connaître son code d'invitation** :
aucun moyen de découvrir les tontines ouvertes, et l'adhésion était
immédiate (pas de contrôle du gestionnaire). Objectif : un **fil de
découverte** sur l'accueil et la landing, et une **demande d'adhésion
validée manuellement** par le gestionnaire (accepte / refuse selon ses
conditions).

_(Étape 2, séparée : mini-marketplace + articles payables par tontine.)_

## Décision

### Schéma (`prisma db push`)
- `Tontine.membershipConditions String?` — conditions **texte libre**
  affichées au candidat (pas de vérification automatique : le
  gestionnaire décide).
- `TontineJoinRequest` + `enum JoinRequestStatus { PENDING APPROVED
  REJECTED CANCELLED }` — `@@unique([tontineId, userId])` (une demande
  par binôme, réutilisée sur re-candidature). `message`, `decisionNote`,
  `decidedById`, `decidedAt`.
- Logique pure `lib/tontine/join.ts` → `describeJoinability()` (testée,
  7 cas).

### API
| Route | Auth | Rôle |
|---|---|---|
| `GET /api/v1/discover` | **publique** | tontines `isPublic` + `PENDING` + non pleines, triées `createdAt desc`, `take 24` |
| `POST /api/v1/tontine/[id]/join-requests` | membre connecté | crée / rouvre une demande (`upsert`), notifie le gestionnaire |
| `GET /api/v1/tontine/[id]/join-requests` | **gestionnaire** | liste (nom, tél, KYC, ville, message) |
| `PATCH …/join-requests/[requestId]` | gestionnaire : `approve`/`reject` · candidat : `cancel` (`requestId = "me"`) | approve → `$transaction` (statut + `TontineMember` + `MEMBER_JOINED` + `activateTontine` si complète), notifie le candidat |
- `GET /api/v1/tontine/[id]` enrichi : `membershipConditions`,
  `myJoinRequest`, `pendingJoinRequestCount`.
- `membershipConditions` accepté à la création (`POST /tontine`) et à la
  modification (`PATCH /tontine/[id]`).

### Frontend
- **`components/discover/DiscoveryRail.tsx`** — rail horizontal (accueil)
  ou grille (`layout="grid"`, page `/discover`). Carte = type, nom,
  cotisation + fréquence, places restantes, badge « Conditions ».
  Déconnecté → clic mène à `/register?next=/tontine/{id}` + intention
  stockée (`sessionStorage['kessia-after-auth']`).
- **`app/discover`** — page **publique** (hors `PROTECTED_ROUTES`), shell
  léger (logo + connexion/inscription), grille + CTA.
- **Landing** `/` : section « Tontines ouvertes en ce moment » entre
  « Comment ça marche » et le CTA final.
- **Accueil** `/home` : rail après « Mes tontines ».
- **Détail tontine** :
  - non-membre + tontine publique → `JoinRequestPanel` (conditions,
    message, « Demander à rejoindre » / état en attente + annuler / motif
    de refus + renvoyer).
  - gestionnaire → `ManageRequestsPanel` (demandes en attente, Accepter /
    Refuser + motif).
  - sections membres (cotiser, inviter, code, contrat) masquées pour les
    non-membres.
- `useAuth.finishSession` redirige vers `?next` / `?from` / l'intention
  stockée (chemins internes uniquement) au lieu de `/home` en dur.

### Seed
- 4 tontines **publiques ouvertes** avec conditions, 4 demandes de
  démonstration (2 en attente pour un gestionnaire, 1 en attente pour le
  compte principal, 1 refusée).

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**160**, +7) + `build` +
  E2E (auth + tontine-lifecycle) au vert. Smoke test API du parcours
  complet (découverte → demande → validation → membre / annulation).
- ✅ Un visiteur non connecté voit les tontines ; l'action « rejoindre »
  le renvoie à l'inscription puis sur la bonne tontine.
- Pas de vérification structurée des conditions (KYC, ville…) : le
  gestionnaire voit le statut KYC et la ville du candidat mais décide
  seul. Extension possible ultérieurement.
- Notifications `TONTINE` émises à chaque étape (demande reçue, acceptée,
  refusée).
