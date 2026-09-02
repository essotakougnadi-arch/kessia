# ADR 0016 — Documentation support / utilisateur, versionnage de l'acceptation des CGU, brouillons de formulaire hors-ligne

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Après ADR 0015 (pages légales, documents imprimables, relances clients), trois
compléments restaient à traiter, tous du ressort du code / de la documentation :

1. **Documentation support & utilisateur** — `docs/{support,user}/` était nommé
   « à rédiger » dans `status.md`.
2. **Versionnage de l'acceptation des CGU (§8)** — l'inscription enregistrait un
   consentement booléen, mais pas *quelle version* des documents juridiques
   avait été acceptée ni *quand*. Sans cela, impossible de savoir qui doit
   ré-accepter après une mise à jour.
3. **Brouillons de formulaire hors-ligne (§35)** — le cahier des charges prévoit
   que l'app ne perde pas une saisie en cours sur une connexion instable. Le
   service worker (ADR 0013) rendait l'app installable mais ne protégeait pas
   les formulaires.

## Décisions

### 1. Source unique de version juridique — `lib/legal/versions.ts`
- `LEGAL_VERSION = '2026-08-29'` (identifiant stable, comparable) +
  `LEGAL_VERSION_LABEL = '29 août 2026'` (affichage) + `LEGAL_DOCS` (chemins et
  titres des 3 documents).
- Les pages `/legal/{terms,privacy,mentions}` affichent désormais ce label via
  `LegalShell` (`updated={LEGAL_VERSION_LABEL}`) — plus de date en dur.
- Faire évoluer les documents = bump de `LEGAL_VERSION` à un seul endroit.

### 2. Versionnage de l'acceptation (§8)
- `User` += `termsAcceptedVersion String?` + `termsAcceptedAt DateTime?`.
- `registerSchema` accepte un `termsVersion` optionnel ; la page d'inscription
  envoie `LEGAL_VERSION` et affiche « Version 29 août 2026 · Mentions légales »
  sous les cases de consentement.
- `POST /api/v1/auth/register` : `acceptedVersion = termsVersion || LEGAL_VERSION`,
  écrit sur l'utilisateur **dans la transaction de création** ; la version est
  aussi tracée dans les métadonnées d'audit (`REGISTER`).
- `GET /api/v1/trust` renvoie un bloc `legal` :
  `{ acceptedVersion, acceptedAt, currentVersion, currentVersionLabel, upToDate }`.
  `upToDate` est vrai seulement si la version acceptée == `LEGAL_VERSION`.
- Le Trust Center (`/trust`) affiche une section « Documents juridiques » :
  version acceptée, pastille à jour / à revoir, liens vers les documents.
- Le seed pose `termsAcceptedVersion: '2026-08-29'` + `termsAcceptedAt` sur tous
  les comptes de démonstration.
- **Pas de mur de ré-acceptation** dans cette itération : l'information est
  disponible (Trust Center, API) ; le déclenchement d'une ré-acceptation
  obligatoire après un bump se traitera quand un premier changement de version
  réel aura lieu.

### 3. Brouillons de formulaire — `hooks/useFormDraft.ts` + `components/ui/DraftNotice.tsx`
- `useFormDraft<T>(key)` : lecture unique au montage (pré-remplissage), écriture
  à chaque changement via `save(values)`, effacement à la soumission réussie
  (`clear()`), et `dismiss()` pour « repartir de zéro ».
- Stockage **purement local** : `localStorage`, préfixe `kessia:draft:`, par
  navigateur. Un objet « vide » (chaîne vide, 0, null, [] récursivement)
  n'écrit rien / efface la clé. Tout accès est protégé par `try/catch`
  (stockage indisponible → on continue sans brouillon).
- `DraftNotice` : bandeau discret « Brouillon restauré (il y a N min) » +
  bouton « Repartir de zéro ».
- Câblé sur les formulaires à saisie longue :
  - Wallet — `TransferForm` (`wallet-transfer`).
  - Business — `SaleForm` (`business-sale`), `ExpenseForm` (`business-expense`),
    `InvoiceForm` (`business-invoice`).
- **Non câblé** volontairement : formulaires courts (connexion, OTP), formulaires
  à données sensibles (mot de passe, KYC — on ne persiste pas une pièce
  d'identité en clair dans `localStorage`).

### 4. Documentation
- `docs/support/playbook.md` : principes (ne jamais contourner un contrôle, ne
  jamais divulguer de donnée tierce, tout est audité), cycle de vie d'un ticket
  (`TicketStatus`), réponse de premier niveau par `TicketCategory`, matrice
  d'escalade (fraude → `COMPLIANCE`, sécurité → `SECURITY`, incident → runbook),
  réponses types, liste de ce que l'agent ne fait jamais.
- `docs/user/getting-started.md` : guide utilisateur (compte, KYC, wallet,
  tontines, business, assistant, croissance, confiance & confidentialité,
  support), aligné sur les fonctionnalités réellement livrées et les mentions
  obligatoires (pas un établissement de paiement, Fonds de Garantie en démo,
  Score ≠ crédit, simulateurs sans rendement).

## Conséquences
- ✅ §8 : la version des CGU acceptée est horodatée, persistée et exposée.
- ✅ §35 : une saisie en cours (transfert, vente, dépense, facture) survit à un
  rechargement ou une coupure.
- ✅ `docs/{support,user}/` existent — `status.md` « dette doc » levée.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (98) + `build` + `playwright` (33)
  au vert. Reseed OK.
- ⏭️ Améliorations possibles : mur de ré-acceptation déclenché par un bump de
  `LEGAL_VERSION` ; brouillons partagés entre appareils (nécessiterait un
  stockage serveur — non souhaitable pour des données de formulaire) ;
  historique complet des acceptations (table dédiée) si un régulateur l'exige.
