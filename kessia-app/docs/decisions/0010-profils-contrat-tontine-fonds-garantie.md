# ADR 0010 — Profils utilisateur, contrat de tontine, Fonds de Garantie

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Finalisation des sections §4, §5, §6.4 et §6.5 du cahier des charges, dans la
part qui relève du code (le reste — Market, cadre juridique du fonds — est
Phase 8 ou bloquant réglementaire).

## Décisions

### §4 — Profils utilisateur
- `UserProfile.userType` (enum `UserType`, 11 valeurs). **5 sélectionnables**
  dans le MVP : Particulier, Entrepreneur débutant, Micro-entreprise, PME,
  Coopérative. Les 6 autres (mentor, formateur, fournisseur, institution,
  partenaires) sont modélisées mais réservées à des parcours Phase 8.
- Métadonnées : `lib/user/user-type.ts` (libellé, aide, icône, modules mis en
  avant). Distinct du **rôle RBAC** : le `userType` oriente l'accueil, les
  suggestions de l'IA et les KPI ; il ne change aucune permission.
- Collecté à l'inscription (le sélecteur du formulaire, jusque-là décoratif,
  est désormais transmis), modifiable dans le profil.
- **Élévation de rôle automatique** (`lib/auth/roles.ts`) : `USER →
  TONTINE_MANAGER` à la création d'une tontine, `USER/TONTINE_MANAGER →
  BUSINESS_OWNER` à la création d'une entreprise. Ne descend jamais un rôle,
  ne touche jamais un rôle privilégié. Le libellé se met à jour au prochain
  rafraîchissement de session.

### §5 — Produits KESSIA
- KESSIA Web / Admin / AI (mode règles) : livrés.
- **KESSIA « Mobile » = PWA installable.** Service worker prudent
  (`public/sw.js`) : `/api/**` jamais mis en cache ; navigations en
  réseau-d'abord avec repli sur `/offline` ; assets statiques en cache. Aucune
  donnée financière n'est mise en cache. Enregistré en production uniquement
  (`components/pwa/ServiceWorkerRegister.tsx`).
- Flutter natif et Open API restent Phase 8.
- Carte produit : `docs/product/overview.md`.

### §6.4 — Contrat numérique de tontine (« Smart Agreement »)
- `lib/tontine/agreement.ts::buildAgreementTerms()` (pur) : construit le
  contrat à partir des termes de la tontine + des membres — objet, finances,
  calendrier des tours avec bénéficiaires, règles (cotisation / retard /
  distribution / sortie / gouvernance).
- **Figé à l'activation** : `Tontine.agreementJson` + `agreementGeneratedAt`.
  Rejoindre une tontine vaut acceptation des règles → `TontineMember
  .agreementAcceptedAt = joinedAt` (tracé). Un membre peut re-confirmer
  explicitement après le gel (`POST /api/v1/tontine/[id]/agreement`).
- **Pas de blockchain** — c'est un document horodaté, adossé au journal.
- **`TontineEvent`** (nouveau modèle, comble le §42) : `CREATED`,
  `MEMBER_JOINED`, `ACTIVATED`, `AGREEMENT_ACCEPTED`, `CONTRIBUTION_PAID`,
  `CONTRIBUTION_LATE`, `PAYOUT`, `ROUND_ADVANCED`, `COMPLETED`,
  `GUARANTEE_CLAIM`. Écrit par l'orchestrateur et les routes tontine
  (non bloquant).
- `GET /api/v1/tontine/[id]/agreement` → termes + acceptations + journal.
  Écran `/tontine/[id]/contrat`.
- **Le lien Tontine Achat ↔ KESSIA Market reste Phase 8** (Market n'existe pas).

### §6.5 — Fonds de Garantie Solidaire — MODE DÉMONSTRATION
Un mécanisme de mutualisation du risque s'apparente à une garantie financière
(§59, §13) → **il ne peut pas être opéré avant qualification juridique et,
probablement, un partenaire habilité.** Ce qui est livré, sans mouvement de
fonds réel :

- Modèles `GuaranteeClaim` + `GuaranteeEvent`. **Pas de table de solde** : la
  projection est calculée (`lib/guarantee/guarantee.service.ts`) —
  `solde projeté = 1 % des cotisations réglées − demandes réglées`.
- Règles (`lib/guarantee/rules.ts`, à valider) : éligibilité (KYC vérifié +
  ≥ 3 cotisations + ancienneté ≥ 30 j + ≤ 2 demandes approuvées / an),
  plafond = une cotisation, revue humaine obligatoire (`COMPLIANCE`).
- Workflow complet : demande (`POST /api/v1/guarantee/claims`) → examen
  (`PATCH /api/v1/admin/guarantee/claims/[id]`, `COMPLIANCE`) → approbation
  ⇒ statut `SETTLED` **en simulation** (aucun débit/crédit), événement, audit,
  notification (« dans la version active, votre cotisation serait couverte »).
- Écrans : `/tontine/garantie` (membre — bandeau « démonstration » permanent),
  `/admin/guarantee` (conformité — solde projeté, file de demandes, journal).
- **`GUARANTEE_FUND_USER_REQUESTS`** (env, défaut off) : n'affiche le
  formulaire de demande côté membre que pour la démonstration. Les écrans
  admin et d'information restent visibles en permanence.

## Conséquences
- ✅ §4 et §6.4 conformes au périmètre MVP ; §5 avance (PWA) ; §6.5 dispose de
  toute sa structure (règles, demandes, validation, audit, reporting) prête à
  être activée quand le cadre juridique le permettra.
- ⚠️ Le Fonds de Garantie ne doit jamais être présenté comme actif. Le
  bandeau « démonstration » et le drapeau `simulated` sur chaque demande le
  garantissent.
- ⏭️ À l'activation : capitalisation réelle du fonds + affectation effective
  d'une part des frais + couverture réelle de la cotisation (écriture ledger).
