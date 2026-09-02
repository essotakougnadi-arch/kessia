# Matrice de conformité — KESSIA (cahier des charges §59)

> ⚠️ **Ce document est un support de travail technique, pas un avis juridique.**
> Chaque ligne marquée « à valider » doit être confirmée par un conseil
> juridique / compliance au Togo (puis dans chaque pays d'expansion) **avant
> toute mise en production** du service concerné (cahier des charges §59).
>
> Légende : ✅ en place · 🟡 partiel / posture MVP · ⛔ bloquant avant prod · 📋 à rédiger

_Dernière revue technique : 2026-08-31 (audit complet post-ADR 0028). Depuis ADR 0017 : pièces jointes de ticket (0018), tests d'intégration (0019), internationalisation FR/EN de tout l'espace membre et de la prose serveur (0020→0028) — sans impact sur les bloquants réglementaires ci-dessous._

---

## 1. Structure juridique

| Point | État | Détail / action |
|---|---|---|
| Entité juridique exploitante (Togo) | ⛔ | À constituer. Détermine le régime applicable aux points ci-dessous. |
| Statut vis-à-vis des services financiers | ⛔ | KESSIA n'est PAS établissement de paiement/monnaie électronique par défaut → **partenariats obligatoires** (opérateurs Mobile Money, banques, EME agréé). À valider avec la BCEAO / autorité compétente. |
| CGU / CGV / Mentions légales | 🟡 | **Brouillons rédigés** et publiés (`/legal/terms`, `/legal/privacy`, `/legal/mentions`) à partir des faits du produit — ADR 0015. Bandeau « projet — à valider juridiquement » permanent. Restent : validation par un conseil togolais + informations de l'entité (RCCM, adresse, DPO). |
| Contrats partenaires (paiement, SMS, KYC, assurance) | 📋 | Aucun signé. Les intégrations sont simulées (voir ADR 0005). |

## 2. Protection des données personnelles

| Point | État | Détail |
|---|---|---|
| Base légale des traitements | 🟡 | Consentements CGU + politique de confidentialité collectés à l'inscription (`registerSchema`, tracés dans `audit_logs`), **avec la version acceptée** (`termsAcceptedVersion`, ADR 0016). Registre des traitements à formaliser. |
| Minimisation | ✅ | Inscription : téléphone + nom + prénom + mot de passe uniquement. KYC demandé seulement au moment utile. |
| Consentement séparé (données ≠ CGU) | ✅ | Deux cases distinctes. |
| Droit d'accès / portabilité | ✅ | `POST /api/v1/profile/privacy {action:'export'}` génère **immédiatement** une archive JSON (identité, wallet + ledger, paiements, tontines, business, métadonnées KYC sans les pièces, notifications, tickets) et horodate la demande (ADR 0006). |
| Droit à l'effacement | 🟡 | `POST /api/v1/profile/privacy {action:'delete-request'}` enregistre la demande (annulable via `{action:'cancel-delete'}`) + audit `privacy.deletion_request` ; état exposé dans le Trust Center. **Procédure d'effacement/anonymisation effective (obligations de conservation AML) : à définir avec compliance** — aujourd'hui manuelle. |
| Durées de conservation | 📋 | Voir §9. À arrêter (KYC, transactions, logs, audit). |
| Chiffrement au repos | 🟡 | Base Supabase chiffrée côté hébergeur. **Documents KYC : Supabase Storage (bucket privé) + URL signées 5 min** dès que configuré, repli data-URI sinon (ADR 0014). Reste : nettoyage du bucket à la suppression RGPD. |
| Chiffrement en transit | ✅ | TLS (hébergeur). |
| Sous-traitants (Supabase, Vercel, Resend, Upstash…) | 📋 | Cartographie + DPA à établir. |
| Transferts hors zone | 📋 | Supabase région `eu-west-1` → à documenter. |
| DPO / point de contact | 📋 | À désigner. |

## 3. KYC / LAB-FT (AML/CFT)

| Point | État | Détail |
|---|---|---|
| Recueil d'identité + pièce + selfie | ✅ | Flux `/profile/kyc` fonctionnel, 7 statuts (§30). |
| Niveaux de vérification & plafonds associés | 🟡 | Paliers 0/1/2 (`lib/kyc/limits.ts`) : plafonds **par opération** et **mensuels sortants** désormais **appliqués côté serveur** (`wallet/transfer`, `payments`) — ADR 0013. ⛔ **Les valeurs réelles doivent être calées sur la réglementation** (aujourd'hui conservatrices). |
| Liveness / vérification biométrique | ⛔ | Le « selfie » est une simple photo. Pas de détection du vivant ni de prestataire agréé → **à intégrer** (ex. prestataire IDV) avant activation des services financiers. |
| Revue manuelle + motifs de rejet | ✅ | Back-office `/admin/kyc/[id]` : valider / rejeter (motif obligatoire) / action requise. |
| Screening sanctions / PPE | ⛔ | **Stub local** (`lib/kyc/screening.ts`) : pose un drapeau pour la revue humaine, ne bloque rien. Screening habilité (ONU/UE/OFAC, PPE) à brancher. |
| Conservation des dossiers KYC | 📋 | Durée légale à confirmer (souvent ≥ 5-10 ans après fin de relation). |
| Déclaration de soupçon / gel des avoirs | ⛔ | Procédure + interlocuteur CENTIF à définir. |
| Journal d'audit KYC | ✅ | `audit_logs` (`kyc.*`, `kyc.review_*`). |

## 4. Paiements

| Point | État | Détail |
|---|---|---|
| Abstraction fournisseur | ✅ | `lib/payments/` — interface + 4 adaptateurs. |
| Fournisseurs réels | ⛔ | Tous **simulés** et marqués `simulated`. Intégrations opérateurs/banques + environnements sandbox à réaliser sous contrat. |
| Ledger fiable (source de vérité, idempotent, atomique) | ✅ | `lib/ledger/ledger.service.ts`. |
| Idempotence des opérations | ✅ | Clé d'idempotence ledger + `Idempotency-Key` entrant (transfer, contribute) + webhooks idempotents (`PAYTX_<id>`). |
| Réconciliation / rapprochement | ⛔ | À concevoir avec les relevés partenaires. |
| Reversal / remboursement | 🟡 | Reversal automatique sur échec de crédit d'un transfert : ✅ (`REV-<ref>`). Flux remboursement client complet : à faire. |
| Règlements asynchrones (webhooks) | 🟡 | `POST /api/v1/payments/webhooks/[provider]` : signé (HMAC), idempotent, PENDING→COMPLETED/FAILED. En prod : configurer le secret par fournisseur + restreindre la source. |
| Frais / tarification transparente | 🟡 | Grille unique `lib/fees.ts`, publiée dans le Trust Center (`/trust`, ADR 0013). Retrait Mobile Money 0,5 % affiché avant l'opération. Aucun autre frais prélevé. |
| Lutte contre la fraude | 🟡 | Moteur de règles + revue humaine livré (ADR 0013). Voir §10. |

## 5. Investissement (KESSIA Invest) & Fonds de Garantie Solidaire

| Point | État |
|---|---|
| KESSIA Invest | ⛔ Non construit. Le cahier interdit l'activation avant cadre réglementaire validé (§13). Ne coder aucune promesse de rendement. |
| **Fonds de Garantie Solidaire (§6.5)** | 🟡 **Mode démonstration** : règles, demandes, validation humaine (conformité), audit et reporting sont livrés (ADR 0010) ; **aucun mouvement de fonds réel**, solde = projection, bandeau « non actif » permanent. ⛔ **Activation = qualification juridique** (mécanisme assimilable à une garantie financière / assurance) + probablement partenaire habilité + capitalisation du fonds. |

## 6. Assurance (KESSIA Insurance)

| Point | État |
|---|---|
| Module | ⛔ Non construit. KESSIA ne peut pas se présenter comme assureur (§14) — uniquement intermédiaire de partenaires habilités, sous contrat. |

## 7. Fiscalité

| Point | État | Détail |
|---|---|---|
| TVA sur les commissions | 📋 | À déterminer selon le régime de l'entité. |
| Facturation entreprise (module Business) | 🟡 | Numérotation séquentielle `DEV-`/`FAC-YYYY-####`, TVA paramétrable, **document imprimable / PDF** (`/documents/invoice/…`, ADR 0015). Le document rappelle que les mentions fiscales propres à l'activité de l'utilisateur sont à compléter. |
| Retenues / déclarations | 📋 | Hors périmètre technique — à cadrer avec un expert-comptable. |

## 8. Contrats & preuve

| Point | État | Détail |
|---|---|---|
| Acceptation CGU horodatée | ✅ | `User.termsAcceptedVersion` + `termsAcceptedAt` posés à l'inscription dans la transaction de création (+ audit `REGISTER`). Version de référence : `lib/legal/versions.ts` (`LEGAL_VERSION` + `isTermsUpToDate()`). **Mur de ré-acceptation** : `GET/POST /api/v1/legal/acceptance` + `components/legal/LegalGate.tsx` (panneau bloquant tant que la version acceptée ≠ version en vigueur ; POST tracé `legal.terms_accepted`). État aussi exposé via le Trust Center. Reste : table d'historique des acceptations si un régulateur l'exige (ADR 0016/0017). |
| Contrat numérique de tontine (« Smart Agreement ») | ✅ | §6.4 — livré (ADR 0010) : termes figés au démarrage (`agreementJson`), acceptation horodatée par membre, journal `TontineEvent`, écran `/tontine/[id]/contrat`. |
| Valeur probante des logs | 🟡 | `audit_logs` immuable applicativement (pas d'API de modification). Horodatage serveur. Scellement/signature : à évaluer. |

## 9. Conservation des données

| Donnée | Durée proposée (à valider ⛔) |
|---|---|
| Compte utilisateur actif | Durée de la relation |
| Données KYC | 5 à 10 ans après clôture (obligation AML — **à confirmer**) |
| Écritures ledger / transactions | 10 ans (obligation comptable — **à confirmer**) |
| `audit_logs` | 5 ans |
| Logs techniques applicatifs | 6 à 12 mois |
| OTP | Purge après expiration (déjà : usage unique + expiration 10 min) |
| Sessions | Purge après expiration (30 j) |

## 10. Sécurité

| Point | État | Réf. |
|---|---|---|
| TLS | ✅ | hébergeur |
| Gestion des secrets | 🟡 | `.env` / `.env.local` (gitignorés). Procédure de rotation documentée (`docs/operations/backup-recovery.md` §7). **Gestionnaire de secrets (Vault / secrets manager) à mettre en place.** |
| MFA / 2FA | ✅ | TOTP + codes de secours |
| RBAC | ✅ | `withAuthAndRole` + middleware edge |
| Rate limiting | 🟡 | **Upstash Redis (compteur partagé)** dès que `UPSTASH_REDIS_REST_URL`/`TOKEN` sont fournis, repli mémoire sinon (ADR 0004/0014). |
| Anti-brute-force | ✅ | Lockout 5 tentatives / 15 min |
| Validation backend | ✅ | Zod sur toutes les routes |
| Journal d'audit | ✅ | `lib/audit` |
| Monitoring / alertes | 🟡 | `GET /api/metrics` (Prometheus, jeton `METRICS_TOKEN`) + `/api/health` + logs structurés. **APM (traces, alertes) à brancher.** |
| Sauvegardes + restauration testée | 🟡 | `scripts/db-backup.mjs` + runbook `docs/operations/backup-recovery.md` (restauration, RPO/RTO, test trimestriel). ⛔ **Rétention 30 j + copie hors-hébergeur + premier test DR consigné.** |
| Détection d'anomalies / fraude | ✅ | §32 (ADR 0013) : `lib/fraud/*` — empreinte d'appareil + règles (vélocité, montant anormal, drain, dormant…) → `FraudAlert` + revue humaine `/admin/fraud`. Aucun blocage automatique de fonds. |
| Réponse à incident | 🟡 | Procédure résumée dans `docs/operations/backup-recovery.md` §6 et `docs/security/overview.md`. Runbook détaillé + interlocuteurs à formaliser. |

---

## Synthèse des bloquants avant pilote (⛔)

1. Entité juridique + statut vis-à-vis des services financiers + partenariats.
2. Intégrations paiement réelles (sandbox puis prod) sous contrat.
3. KYC : liveness/prestataire IDV + screening sanctions/PPE habilité (stub local + plafonds serveur déjà en place — ADR 0013) + calage des plafonds sur la réglementation.
4. Procédures : déclaration de soupçon, gel des avoirs (runbook incident + DR ébauchés — ADR 0013, à formaliser).
5. Pages légales : **brouillons publiés** (CGU, confidentialité, mentions légales — ADR 0015 ; tarifs dans le Trust Center). Restent la validation par un conseil juridique togolais et les informations de l'entité.
6. ~~Migration du stockage des documents KYC hors base~~ → **fait** (Supabase Storage, ADR 0014) ; reste le nettoyage du bucket à la suppression RGPD.
7. Infrastructure : APM/alertes branchés (endpoint `/api/metrics` prêt), gestionnaire de secrets. Rate-limit distribué et ordonnanceur du tick tontine = **faits** (ADR 0014, à activer via variables d'env). Reste : rétention 30 j + copie de sauvegarde hors-hébergeur + premier test DR consigné.
