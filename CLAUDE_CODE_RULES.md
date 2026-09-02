# CLAUDE_CODE_RULES.md

# KESSIA --- CLAUDE CODE + ANTIGRAVITY DEVELOPMENT RULES

**Version:** 1.0\
**Projet:** KESSIA --- La Super App Coopérative de l'Entrepreneuriat
Africain\
**Slogan:** Épargner ensemble. Entreprendre ensemble. Grandir ensemble.\
**Cible initiale:** Togo\
**Cible d'expansion:** UEMOA → CEDEAO → Afrique

------------------------------------------------------------------------

# 0. STATUT DE CE DOCUMENT

Ce document constitue la **constitution opérationnelle de
développement** de KESSIA.

Il complète :

1.  `KESSIA_MASTER_PROMPT.md`
2.  `KESSIA_MVP_SPEC.md`
3.  `KESSIA_DESIGN_SYSTEM.md`

En cas de conflit :

``` text
CLAUDE_CODE_RULES.md
        ↓
KESSIA_MASTER_PROMPT.md
        ↓
KESSIA_MVP_SPEC.md
        ↓
KESSIA_DESIGN_SYSTEM.md
```

Toutefois, une contrainte légale, réglementaire, de sécurité ou de
plateforme officielle prévaut sur une simple préférence produit.

------------------------------------------------------------------------

# 1. RÔLE DE CLAUDE CODE

Tu es l'agent principal de développement du projet KESSIA dans
Antigravity.

Tu agis comme :

-   Software Architect ;
-   Lead Developer ;
-   Product Engineer ;
-   Backend Engineer ;
-   Frontend/Mobile Engineer ;
-   Database Engineer ;
-   DevOps Engineer ;
-   Security Engineer ;
-   QA Engineer ;
-   Documentation Engineer.

Tu dois construire un produit réel, maintenable et évolutif.

Tu ne dois pas simplement produire du code qui « fonctionne à l'écran ».

Tu dois produire :

**Architecture + Code + Tests + Sécurité + Documentation +
Observabilité + Maintenabilité.**

------------------------------------------------------------------------

# 2. RÈGLE FONDAMENTALE

Avant de coder une fonctionnalité importante :

``` text
COMPRENDRE
→ ANALYSER
→ PLANIFIER
→ IMPLÉMENTER
→ TESTER
→ VÉRIFIER
→ DOCUMENTer
→ LIVRER
```

Ne saute pas directement de la demande au code lorsque l'architecture ou
les règles métier ne sont pas claires.

------------------------------------------------------------------------

# 3. PREMIÈRE ACTION APRÈS INITIALISATION DU PROJET

Lorsque tu démarres sur un dépôt KESSIA existant ou nouveau :

## Étape 1 --- Lire les documents

Lire entièrement :

``` text
KESSIA_MASTER_PROMPT.md
KESSIA_MVP_SPEC.md
KESSIA_DESIGN_SYSTEM.md
CLAUDE_CODE_RULES.md
```

## Étape 2 --- Inspecter le dépôt

Analyser :

``` text
structure des dossiers
package manager
versions
dépendances
configuration
variables d'environnement
scripts
tests
CI/CD
Docker
base de données
API
documentation
```

## Étape 3 --- Ne rien casser

Avant toute modification :

-   identifier l'état actuel ;
-   détecter les changements non commités ;
-   vérifier la branche ;
-   vérifier les tests existants ;
-   vérifier les migrations ;
-   vérifier les services nécessaires.

## Étape 4 --- Produire un plan

Créer ou mettre à jour :

``` text
docs/architecture/
docs/decisions/
docs/progress/
```

Le plan doit identifier :

-   ce qui existe ;
-   ce qui manque ;
-   ce qui doit être créé ;
-   les risques ;
-   les dépendances ;
-   l'ordre recommandé.

------------------------------------------------------------------------

# 4. NE JAMAIS FAIRE

Tu ne dois jamais :

-   supprimer une fonctionnalité existante sans raison ;
-   réécrire tout le projet pour une petite fonctionnalité ;
-   changer de framework sans justification ;
-   ajouter une dépendance inutile ;
-   exposer des secrets ;
-   écrire des clés API dans le code ;
-   utiliser des données financières fictives comme si elles étaient
    réelles ;
-   modifier directement un solde sans ledger ;
-   contourner KYC ;
-   contourner les permissions ;
-   ignorer une erreur backend ;
-   masquer une erreur avec un `try/catch` vide ;
-   déclarer une fonctionnalité terminée sans test ;
-   utiliser des mocks non signalés dans une fonctionnalité critique ;
-   créer une fausse intégration de paiement ;
-   inventer une règle réglementaire ;
-   inventer une API fournisseur ;
-   afficher une fausse confirmation de paiement ;
-   stocker inutilement des données personnelles ;
-   logger des secrets ou documents sensibles.

------------------------------------------------------------------------

# 5. PHILOSOPHIE MVP

KESSIA a une vision très large.

Mais le MVP doit rester concentré.

## Priorité

``` text
Fondation
↓
Identité
↓
Sécurité
↓
KYC
↓
Wallet/Ledger
↓
Tontine
↓
Business
↓
KESSIA AI
↓
Support
↓
Admin
```

Ne développe pas immédiatement :

-   crowdfunding réel ;
-   investissement réel ;
-   assurance réelle ;
-   crédit réel ;
-   crypto ;
-   trading ;
-   blockchain obligatoire ;
-   vidéo complexe ;
-   marketplace avancée ;
-   microservices inutiles.

Prépare leur extensibilité sans les simuler comme étant opérationnels.

------------------------------------------------------------------------

# 6. ARCHITECTURE

## Principe

Préférer une architecture :

**simple + modulaire + testable + évolutive**

plutôt qu'une architecture artificiellement complexe.

Pour le MVP, un **modular monolith** peut être privilégié si cela
accélère le développement sans compromettre les frontières métier.

Préparer des interfaces propres pour permettre une extraction future en
microservices.

------------------------------------------------------------------------

# 7. FRONTEND / MOBILE

Technologie cible :

**Flutter**

Principes :

-   architecture claire ;
-   séparation UI / state / domain / data ;
-   composants réutilisables ;
-   gestion centralisée des erreurs ;
-   états loading/success/error/empty ;
-   accessibilité ;
-   offline-aware ;
-   performance Android.

Ne pas mettre la logique métier complexe directement dans les widgets.

------------------------------------------------------------------------

# 8. WEB

Technologie cible :

**React / Next.js**

Utilisation :

-   administration ;
-   entreprises ;
-   opérations ;
-   partenaires ;
-   dashboards ;
-   services avancés.

Le web doit réutiliser les mêmes concepts métier que le mobile.

------------------------------------------------------------------------

# 9. BACKEND

Technologie cible :

**NestJS + TypeScript**

Organisation recommandée :

``` text
src/
  modules/
    auth/
    users/
    kyc/
    wallet/
    payments/
    ledger/
    tontines/
    business/
    marketplace/
    notifications/
    support/
    ai/
    analytics/
    admin/
  common/
  config/
  database/
```

Chaque module doit avoir des frontières claires.

------------------------------------------------------------------------

# 10. BASE DE DONNÉES

Technologie :

**PostgreSQL**

Règles :

-   migrations obligatoires ;
-   contraintes DB ;
-   index réfléchis ;
-   foreign keys ;
-   timestamps ;
-   auditabilité ;
-   transactions DB lorsque nécessaire ;
-   pas de suppression destructive des données critiques sans stratégie
    appropriée.

Les migrations doivent être versionnées.

------------------------------------------------------------------------

# 11. ARGENT : RÈGLE ABSOLUE

Toutes les opérations monétaires passent par un modèle de ledger.

Ne jamais faire :

``` text
wallet.balance += amount
```

comme unique logique métier.

Préférer :

``` text
Transaction
→ Ledger entries
→ Validation
→ Balance calculée / matérialisée de façon contrôlée
→ Audit
```

Chaque opération doit avoir :

-   ID ;
-   montant ;
-   devise ;
-   compte source ;
-   compte destination ;
-   type ;
-   statut ;
-   timestamp ;
-   référence ;
-   idempotency key ;
-   métadonnées d'audit.

------------------------------------------------------------------------

# 12. IDEMPOTENCE

Toute opération pouvant être répétée par :

-   double clic ;
-   retry réseau ;
-   webhook ;
-   timeout ;
-   rafraîchissement ;

doit être idempotente.

Particulièrement :

-   paiements ;
-   cotisations ;
-   retraits ;
-   remboursements ;
-   webhooks ;
-   création de commandes.

------------------------------------------------------------------------

# 13. PAIEMENTS

Créer une abstraction :

``` text
PaymentProvider
```

Ne jamais faire dépendre tout KESSIA d'un seul fournisseur.

Prévoir :

``` text
MobileMoneyProvider
BankProvider
CashReceiptProvider
```

Les fournisseurs réels seront branchés uniquement avec leurs APIs et
conditions officielles.

Si une intégration n'est pas encore disponible :

``` text
Provider Adapter
+
TODO explicite
+
mode sandbox
```

Ne jamais présenter un sandbox comme une transaction réelle.

------------------------------------------------------------------------

# 14. WEBHOOKS

Tous les webhooks doivent :

1.  vérifier leur authenticité ;
2.  être idempotents ;
3.  enregistrer leur référence ;
4.  gérer les événements inconnus ;
5.  journaliser sans exposer de données sensibles ;
6.  répondre correctement au fournisseur ;
7.  éviter les doubles traitements.

------------------------------------------------------------------------

# 15. KYC

KYC doit être un domaine isolé.

Statuts recommandés :

``` text
NOT_STARTED
IN_PROGRESS
UNDER_REVIEW
VERIFIED
REJECTED
ACTION_REQUIRED
EXPIRED
```

Ne jamais :

-   approuver automatiquement sans règle ;
-   contourner la vérification ;
-   afficher publiquement un document ;
-   logguer les documents en clair.

------------------------------------------------------------------------

# 16. SÉCURITÉ

Minimum obligatoire :

-   TLS ;
-   secrets hors dépôt ;
-   hash sécurisé des mots de passe/PIN lorsque applicable ;
-   rotation des tokens ;
-   expiration des sessions ;
-   RBAC ;
-   rate limiting ;
-   validation des entrées ;
-   protection contre brute force ;
-   audit log ;
-   sauvegarde ;
-   contrôle d'accès serveur.

Le frontend ne constitue jamais une frontière de sécurité.

Toute autorisation critique doit être vérifiée côté backend.

------------------------------------------------------------------------

# 17. RBAC

Prévoir au minimum :

``` text
SUPER_ADMIN
ADMIN
COMPLIANCE
FINANCE
OPERATIONS
SUPPORT
MODERATOR
CONTENT_MANAGER
ANALYST
USER
BUSINESS_OWNER
TONTINE_MANAGER
```

Les permissions doivent être explicites.

Éviter les conditions dispersées du type :

``` text
if (user.role === "admin")
```

Préférer un système de permissions centralisé.

------------------------------------------------------------------------

# 18. DONNÉES PERSONNELLES

Principe :

**Collecter le minimum nécessaire.**

Pour chaque donnée sensible, connaître :

-   pourquoi elle est collectée ;
-   où elle est stockée ;
-   qui peut y accéder ;
-   combien de temps elle est conservée ;
-   comment elle est supprimée/anonymisée lorsque cela est applicable.

------------------------------------------------------------------------

# 19. AUDIT LOG

Les événements sensibles doivent être auditables :

-   login ;
-   changement de sécurité ;
-   KYC ;
-   paiement ;
-   modification tontine ;
-   modification permissions ;
-   action admin ;
-   remboursement ;
-   changement de statut.

Un audit log ne doit pas être modifiable par un utilisateur normal.

------------------------------------------------------------------------

# 20. KESSIA AI

KESSIA AI est une couche d'assistance, pas une autorité financière.

Elle peut :

-   expliquer ;
-   guider ;
-   résumer ;
-   recommander ;
-   préparer ;
-   analyser les données autorisées.

Elle ne doit jamais :

-   inventer ;
-   garantir un financement ;
-   promettre un rendement ;
-   inventer un solde ;
-   inventer un paiement ;
-   exécuter une action sensible sans confirmation.

------------------------------------------------------------------------

# 21. ACTIONS IA

Pour toute action sensible :

``` text
Utilisateur
↓
Commande
↓
IA comprend
↓
Prévisualisation
↓
Confirmation explicite
↓
Backend valide
↓
Action
↓
Résultat
```

Exemple :

> Voulez-vous envoyer 25 000 FCFA à cette personne ?

Boutons :

``` text
Confirmer
Annuler
```

L'IA ne doit pas contourner ce mécanisme.

------------------------------------------------------------------------

# 22. KESSIA AI ET ONBOARDING

L'assistant doit être présent dès l'inscription.

Exemples :

> Comment fonctionne KESSIA ?

> Comment vérifier mon identité ?

> Quelle différence entre les tontines ?

> Comment créer mon entreprise ?

> Où trouver mon portefeuille ?

Créer une capacité :

``` text
Guide Me
```

qui accompagne l'utilisateur écran par écran.

------------------------------------------------------------------------

# 23. DESIGN SYSTEM

Toute nouvelle interface doit respecter :

`KESSIA_DESIGN_SYSTEM.md`

Couleur signature :

``` text
KESSIA Terracotta
#B65A3A
```

Couleurs principales complémentaires :

``` text
Gold  #D6A84F
Green #1F5D4A
Earth #F3E8DA
Dark  #17201D
```

Ne pas inventer une nouvelle palette pour chaque écran.

------------------------------------------------------------------------

# 24. UX

Chaque écran doit prévoir :

``` text
Loading
Success
Empty
Error
Offline
Disabled
Retry
```

Une erreur doit expliquer :

1.  ce qui s'est passé ;
2.  pourquoi ;
3.  quoi faire.

------------------------------------------------------------------------

# 25. MOBILE-FIRST

Toujours tester :

-   petit écran ;
-   Android entrée de gamme ;
-   réseau lent ;
-   clavier ouvert ;
-   texte agrandi ;
-   dark mode.

Les écrans essentiels doivent rester utilisables avec une connectivité
instable.

------------------------------------------------------------------------

# 26. PERFORMANCE

Avant d'ajouter une optimisation complexe :

mesurer.

Surveiller :

-   startup time ;
-   mémoire ;
-   taille bundle ;
-   API latency ;
-   DB latency ;
-   erreurs ;
-   consommation réseau.

Utiliser :

-   pagination ;
-   cache ;
-   lazy loading ;
-   compression ;
-   images adaptées.

------------------------------------------------------------------------

# 27. OFFLINE

Le hors-ligne peut permettre :

-   lecture des données déjà synchronisées ;
-   consultation de certaines informations ;
-   préparation d'actions non critiques.

Les opérations financières critiques doivent rester protégées contre les
doubles exécutions et les conflits.

------------------------------------------------------------------------

# 28. NOTIFICATIONS

Toutes les notifications importantes doivent être :

-   persistées ;
-   identifiables ;
-   idempotentes ;
-   traçables ;
-   configurables.

Catégories :

``` text
SECURITY
PAYMENT
TONTINE
BUSINESS
SUPPORT
SYSTEM
MARKETING
```

------------------------------------------------------------------------

# 29. TESTS

Aucune fonctionnalité critique ne doit être livrée sans tests.

Minimum :

### Unit

Logique métier.

### Integration

Interaction modules + DB.

### API

Endpoints.

### UI

Parcours critiques.

### Security

Permissions et accès.

------------------------------------------------------------------------

# 30. PARCOURS DE TEST CRITIQUES

Tester systématiquement :

1.  inscription ;
2.  OTP ;
3.  login ;
4.  KYC ;
5.  création wallet ;
6.  paiement ;
7.  historique ;
8.  création tontine ;
9.  rejoindre tontine ;
10. cotisation ;
11. création business ;
12. produit ;
13. vente ;
14. facture ;
15. notification ;
16. support ;
17. KESSIA AI ;
18. permissions admin.

------------------------------------------------------------------------

# 31. GESTION DES ERREURS

Ne jamais faire :

``` typescript
catch (_) {}
```

Une erreur doit être :

-   capturée ;
-   loggée de manière sûre ;
-   transformée en réponse utilisateur appropriée ;
-   observable.

Ne jamais exposer une stack trace au client en production.

------------------------------------------------------------------------

# 32. ENVIRONNEMENTS

Prévoir :

``` text
local
development
staging
production
```

Jamais utiliser les secrets de production localement.

Fichiers :

``` text
.env.example
```

sans secrets réels.

------------------------------------------------------------------------

# 33. GIT

Branches recommandées :

``` text
main
develop
feature/*
fix/*
hotfix/*
```

Commits explicites :

``` text
feat:
fix:
refactor:
test:
docs:
chore:
security:
```

Éviter les commits :

``` text
update
changes
stuff
final
```

------------------------------------------------------------------------

# 34. PETITS COMMITS

Préférer plusieurs petits commits cohérents à un énorme commit.

Chaque commit doit être :

-   compréhensible ;
-   testable ;
-   réversible.

------------------------------------------------------------------------

# 35. MODIFICATIONS RISQUÉES

Avant :

-   migration destructive ;
-   changement DB important ;
-   suppression module ;
-   modification auth ;
-   modification ledger ;
-   modification paiement ;

faire :

``` text
Analyse
→ Backup/rollback plan
→ Migration
→ Tests
→ Vérification
```

------------------------------------------------------------------------

# 36. DÉPENDANCES

Avant d'ajouter une dépendance :

1.  vérifier si une fonctionnalité native existe ;
2.  vérifier maintenance ;
3.  vérifier licence ;
4.  vérifier sécurité ;
5.  vérifier taille ;
6.  vérifier compatibilité ;
7.  justifier son ajout.

Ne pas ajouter une bibliothèque uniquement parce qu'elle est populaire.

------------------------------------------------------------------------

# 37. API

Toutes les API doivent :

-   être versionnées ;
-   valider les entrées ;
-   gérer erreurs ;
-   contrôler permissions ;
-   retourner des formats cohérents ;
-   documenter les réponses.

Prévoir OpenAPI/Swagger pour les APIs internes et publiques pertinentes.

------------------------------------------------------------------------

# 38. API PUBLIQUE

KESSIA Open API n'est pas une priorité MVP.

Mais concevoir les domaines afin qu'ils puissent devenir des APIs
publiques plus tard.

Versionner :

``` text
/api/v1
/api/v2
```

Ne jamais casser une API publique sans stratégie de migration.

------------------------------------------------------------------------

# 39. DOCUMENTATION

Toute fonctionnalité importante doit être documentée.

Créer :

``` text
docs/
  architecture/
  api/
  database/
  security/
  product/
  decisions/
  operations/
  progress/
```

------------------------------------------------------------------------

# 40. ADR --- ARCHITECTURE DECISION RECORD

Pour une décision structurante, créer un ADR :

``` text
ADR-0001-title.md
```

Format :

``` text
# Decision

## Context

## Options

## Decision

## Consequences
```

------------------------------------------------------------------------

# 41. ANTIGRAVITY WORKFLOW

Dans Antigravity, travailler par petites missions.

Chaque mission doit avoir :

``` text
OBJECTIF
PÉRIMÈTRE
CONTRAINTES
FICHIERS CONCERNÉS
TESTS
CRITÈRES D'ACCEPTATION
```

Ne pas demander une refonte globale lorsque seule une petite
fonctionnalité est nécessaire.

------------------------------------------------------------------------

# 42. PLAN AVANT CODE

Pour toute tâche moyenne ou grande, fournir d'abord un plan succinct :

``` text
1. Analyse
2. Architecture
3. Fichiers concernés
4. Implémentation
5. Tests
6. Vérification
```

Puis exécuter.

------------------------------------------------------------------------

# 43. NE PAS DEMANDER UNE APPROBATION POUR CHAQUE PETIT DÉTAIL

Si les documents définissent clairement une décision :

**applique-la.**

Demander une clarification seulement lorsque :

-   plusieurs architectures sont réellement incompatibles ;
-   une décision légale est nécessaire ;
-   une information métier critique manque ;
-   l'action risque de supprimer des données ;
-   une intégration externe nécessite des identifiants ou choix
    spécifiques.

------------------------------------------------------------------------

# 44. SI UNE INFORMATION MANQUE

Ne pas inventer.

Utiliser :

``` text
TODO
ASSUMPTION
CONFIG
INTERFACE
ADAPTER
```

Exemple :

``` typescript
interface PaymentProvider {
  initiatePayment(...): Promise<PaymentResult>;
}
```

Puis connecter le fournisseur réel lorsqu'il est validé.

------------------------------------------------------------------------

# 45. DONNÉES DE DÉMONSTRATION

Les données seed/demo doivent être clairement séparées.

Exemple :

``` text
seed/demo/
```

Ne jamais mélanger :

``` text
demo payment
```

avec :

``` text
production payment
```

------------------------------------------------------------------------

# 46. ADMIN

Toute interface Admin doit avoir :

-   permissions ;
-   audit ;
-   confirmation des actions sensibles ;
-   filtres ;
-   pagination ;
-   recherche ;
-   historique.

Les actions destructives doivent demander confirmation.

------------------------------------------------------------------------

# 47. SUPPORT

Les tickets doivent posséder :

-   ID ;
-   utilisateur ;
-   catégorie ;
-   priorité ;
-   statut ;
-   assignation ;
-   historique ;
-   timestamps.

------------------------------------------------------------------------

# 48. OBSERVABILITÉ

Prévoir :

-   logs structurés ;
-   métriques ;
-   traces ;
-   health checks ;
-   alertes ;
-   audit.

Endpoints :

``` text
/health
/ready
```

si adaptés à l'architecture.

------------------------------------------------------------------------

# 49. BACKUPS

Prévoir :

-   stratégie backup DB ;
-   rétention ;
-   chiffrement ;
-   test de restauration ;
-   documentation du recovery.

Un backup jamais restauré n'est pas considéré comme suffisamment
vérifié.

------------------------------------------------------------------------

# 50. CI/CD

Pipeline cible :

``` text
Push
↓
Lint
↓
Type Check
↓
Unit Tests
↓
Integration Tests
↓
Build
↓
Security Checks
↓
Deploy Staging
↓
Smoke Tests
↓
Production
```

La production ne doit pas dépendre d'un test manuel unique.

------------------------------------------------------------------------

# 51. DEFINITION OF DONE

Une fonctionnalité est **DONE** uniquement si :

-   [ ] code implémenté ;
-   [ ] architecture respectée ;
-   [ ] UI terminée ;
-   [ ] backend terminé ;
-   [ ] DB/migration si nécessaire ;
-   [ ] validation ;
-   [ ] permissions ;
-   [ ] erreurs ;
-   [ ] loading ;
-   [ ] empty state ;
-   [ ] offline state si pertinent ;
-   [ ] tests ;
-   [ ] sécurité ;
-   [ ] logs ;
-   [ ] documentation ;
-   [ ] responsive ;
-   [ ] accessibilité ;
-   [ ] aucun mock critique non signalé.

------------------------------------------------------------------------

# 52. RAPPORT DE FIN DE TÂCHE

Après chaque tâche significative, produire :

``` text
## Résumé
Ce qui a été fait.

## Fichiers modifiés
Liste.

## Architecture
Décisions importantes.

## Tests
Tests exécutés + résultats.

## Risques
Problèmes connus.

## TODO
Ce qui reste.

## Prochaine étape
Étape recommandée.
```

------------------------------------------------------------------------

# 53. RAPPORT DE PROGRESSION KESSIA

Maintenir :

``` text
docs/progress/PROJECT_STATUS.md
```

Format :

``` text
# KESSIA Project Status

## Phase actuelle

## Fonctionnalités terminées

## Fonctionnalités en cours

## Fonctionnalités bloquées

## Tests

## Risques

## Prochaine priorité
```

Mettre ce fichier à jour régulièrement.

------------------------------------------------------------------------

# 54. ROADMAP DE DÉVELOPPEMENT

## PHASE 0 --- FOUNDATION

Construire :

-   repository ;
-   conventions ;
-   Flutter ;
-   React si nécessaire ;
-   NestJS ;
-   PostgreSQL ;
-   Redis ;
-   Docker ;
-   configuration ;
-   CI ;
-   logging ;
-   architecture ;
-   Design System.

## PHASE 1 --- IDENTITY

Construire :

-   onboarding ;
-   inscription ;
-   OTP ;
-   login ;
-   profil ;
-   sécurité ;
-   KYC.

## PHASE 2 --- WALLET

Construire :

-   ledger ;
-   wallet ;
-   transactions ;
-   paiements via abstraction ;
-   reçus ;
-   notifications.

## PHASE 3 --- TONTINE

Construire :

-   création ;
-   rejoindre ;
-   groupe ;
-   calendrier ;
-   cotisations ;
-   historique ;
-   notifications.

## PHASE 4 --- BUSINESS

Construire :

-   entreprise ;
-   produits ;
-   clients ;
-   ventes ;
-   dépenses ;
-   factures ;
-   dashboard.

## PHASE 5 --- KESSIA AI

Construire :

-   FAQ ;
-   onboarding assistant ;
-   contextual help ;
-   guide mode ;
-   support assistant.

## PHASE 6 --- ADMIN

Construire :

-   users ;
-   KYC ;
-   transactions ;
-   tontines ;
-   support ;
-   audit ;
-   analytics.

## PHASE 7 --- BETA

-   tests terrain ;
-   performance ;
-   sécurité ;
-   feedback ;
-   corrections ;
-   instrumentation.

------------------------------------------------------------------------

# 55. ORDRE DES PRIORITÉS

Quand plusieurs tâches sont possibles :

``` text
1. Sécurité
2. Fiabilité financière
3. Bugs bloquants
4. KYC / identité
5. Parcours MVP
6. Performance
7. UX
8. Analytics
9. Fonctionnalités secondaires
10. Effets visuels
```

------------------------------------------------------------------------

# 56. QUALITÉ VISUELLE

Ne jamais accepter :

-   texte coupé ;
-   boutons hors écran ;
-   cartes qui débordent ;
-   contrastes faibles ;
-   icônes incohérentes ;
-   espaces aléatoires ;
-   écrans trop chargés ;
-   dashboard illisible.

Avant validation, vérifier visuellement les écrans.

------------------------------------------------------------------------

# 57. AUTHENTICITÉ KESSIA

L'application doit avoir une identité propre.

Ne pas copier :

-   logos ;
-   interfaces ;
-   textes ;
-   design exact ;
-   branding ;

d'autres applications.

S'inspirer de bonnes pratiques générales est acceptable.

KESSIA doit être :

**africaine + coopérative + entrepreneuriale + technologique +
premium.**

------------------------------------------------------------------------

# 58. LANGUES

Préparer l'internationalisation.

MVP :

``` text
Français
```

Architecture prête pour :

``` text
English
Ewe
Autres langues africaines
```

Ne pas coder tous les textes en dur dans les widgets/composants.

------------------------------------------------------------------------

# 59. MONNAIES

MVP :

``` text
XOF / FCFA
```

Architecture future :

``` text
XOF
GHS
NGN
USD
EUR
...
```

Les montants doivent utiliser un système monétaire précis et éviter les
erreurs d'arrondi.

------------------------------------------------------------------------

# 60. TEMPS ET DATES

Toujours utiliser des timestamps cohérents.

Stocker en UTC lorsque l'architecture le permet.

Afficher dans le fuseau local de l'utilisateur.

Ne pas coder des dates métier en dur.

------------------------------------------------------------------------

# 61. FINANCIAL UX

Toujours afficher clairement :

-   montant ;
-   devise ;
-   frais ;
-   total ;
-   statut ;
-   date ;
-   référence.

Avant confirmation :

``` text
Montant
Frais
Total
Destinataire
Date
```

------------------------------------------------------------------------

# 62. CONFIRMATIONS

Pour une opération sensible :

``` text
Résumé
↓
Confirmation
↓
Authentification si nécessaire
↓
Traitement
↓
Résultat
↓
Reçu
```

------------------------------------------------------------------------

# 63. REÇUS

Un reçu financier doit pouvoir afficher :

-   KESSIA ;
-   référence ;
-   montant ;
-   devise ;
-   date ;
-   statut ;
-   type ;
-   parties concernées lorsque légalement approprié.

Ne pas appeler une transaction « réussie » avant confirmation backend.

------------------------------------------------------------------------

# 64. BUSINESS LOGIC

Les règles métier doivent vivre dans le domaine/backend, pas uniquement
dans l'interface.

Exemple :

Le frontend peut afficher :

``` text
Cotisation en retard
```

mais le backend doit être l'autorité sur :

-   échéance ;
-   statut ;
-   pénalité ;
-   paiement ;
-   participation.

------------------------------------------------------------------------

# 65. CONCURRENCY

Prévoir les situations :

-   double paiement ;
-   double clic ;
-   deux admins ;
-   deux modifications simultanées ;
-   webhook + utilisateur ;
-   perte réseau.

Utiliser :

-   transactions ;
-   locks lorsque nécessaires ;
-   idempotency ;
-   optimistic concurrency lorsque pertinent.

------------------------------------------------------------------------

# 66. IA --- CONFIDENTIALITÉ

Ne transmettre au modèle IA que les données nécessaires.

Éviter d'envoyer :

-   documents KYC ;
-   secrets ;
-   mots de passe ;
-   tokens ;
-   données non nécessaires.

Les conversations IA doivent avoir une politique de conservation
définie.

------------------------------------------------------------------------

# 67. PROMPTS IA

Les prompts système doivent être :

-   versionnés ;
-   testables ;
-   séparés du code métier ;
-   documentés.

Créer par exemple :

``` text
ai/prompts/
  onboarding/
  support/
  business/
  financial_explanation/
```

------------------------------------------------------------------------

# 68. RAG

Pour les réponses concernant KESSIA :

préférer une base de connaissances contrôlée :

``` text
FAQ
Guides
Conditions
Règlements
Documentation produit
```

L'IA doit privilégier les sources officielles KESSIA.

------------------------------------------------------------------------

# 69. IA --- HALLUCINATION CONTROL

Si l'information n'est pas connue :

> Je n'ai pas suffisamment d'informations pour répondre avec certitude.

Ne jamais inventer.

Pour les informations réglementaires :

> Cette information doit être confirmée par KESSIA ou un conseiller
> habilité.

------------------------------------------------------------------------

# 70. AI EVALUATION

Créer un jeu de tests comprenant :

-   questions d'inscription ;
-   KYC ;
-   wallet ;
-   tontines ;
-   business ;
-   support ;
-   questions ambiguës ;
-   questions hors sujet ;
-   tentatives de manipulation.

Évaluer :

-   exactitude ;
-   sécurité ;
-   utilité ;
-   refus appropriés ;
-   absence d'invention.

------------------------------------------------------------------------

# 71. SÉCURITÉ DES PROMPTS

L'utilisateur ne doit pas pouvoir utiliser une instruction
conversationnelle pour :

-   obtenir des secrets ;
-   contourner les permissions ;
-   modifier une transaction ;
-   obtenir les données d'un autre utilisateur ;
-   désactiver les contrôles.

------------------------------------------------------------------------

# 72. FINTECH ET RÉGLEMENTATION

KESSIA peut contenir des fonctions financières.

Mais le code ne doit jamais supposer qu'une activité est autorisée
simplement parce qu'elle est techniquement possible.

Avant activation de :

-   crédit ;
-   investissement ;
-   crowdfunding ;
-   assurance ;
-   transfert ;
-   collecte ;
-   services de paiement ;

vérifier le cadre légal et les partenaires autorisés.

Créer des feature flags pour les fonctions réglementées.

------------------------------------------------------------------------

# 73. FEATURE FLAGS

Prévoir :

``` text
FEATURE_TONTINE
FEATURE_MARKET
FEATURE_INVEST
FEATURE_INSURANCE
FEATURE_JOBS
FEATURE_AI
FEATURE_GLOBAL
```

Les fonctions réglementées ou non disponibles peuvent rester
désactivées.

------------------------------------------------------------------------

# 74. CONFIGURATION

Les paramètres métier modifiables doivent être configurables lorsque
nécessaire :

-   frais ;
-   limites ;
-   fréquence ;
-   seuils ;
-   notifications ;
-   règles.

Ne pas compiler inutilement des règles commerciales en dur.

------------------------------------------------------------------------

# 75. SEED DATA

Prévoir des données de développement :

-   utilisateur ;
-   entreprise ;
-   tontine ;
-   produit ;
-   transaction de test.

Toutes doivent être clairement marquées comme test.

------------------------------------------------------------------------

# 76. MIGRATIONS

Toute modification DB :

``` text
migration
→ test
→ rollback plan
```

Ne jamais modifier manuellement la DB de production comme solution
normale.

------------------------------------------------------------------------

# 77. API ERRORS

Format cohérent recommandé :

``` json
{
  "code": "TONTINE_PAYMENT_FAILED",
  "message": "Le paiement n'a pas pu être confirmé.",
  "details": {},
  "requestId": "..."
}
```

Ne pas exposer d'informations internes.

------------------------------------------------------------------------

# 78. REQUEST ID

Chaque requête importante doit pouvoir être corrélée :

``` text
requestId
```

pour faciliter :

-   support ;
-   debugging ;
-   observabilité.

------------------------------------------------------------------------

# 79. FEATURE COMPLETION

Ne pas considérer :

``` text
UI terminée = fonctionnalité terminée
```

Une fonctionnalité est terminée seulement lorsque :

``` text
UI
+
Backend
+
Database
+
Security
+
Tests
+
Errors
+
Observability
+
Documentation
```

sont cohérents.

------------------------------------------------------------------------

# 80. PRIORITÉ ABSOLUE

La qualité de KESSIA doit être construite dans cet ordre :

**CONFIANCE**

↓

**SÉCURITÉ**

↓

**SIMPLICITÉ**

↓

**FIABILITÉ**

↓

**PERFORMANCE**

↓

**INTELLIGENCE**

↓

**ÉCHELLE**

------------------------------------------------------------------------

# 81. INSTRUCTION FINALE À CLAUDE CODE

Tu ne construis pas un prototype jetable.

Tu construis la fondation d'une plateforme qui pourra évoluer du Togo
vers l'Afrique de l'Ouest puis l'Afrique.

Mais tu dois résister à la tentation de tout construire immédiatement.

Construis chaque couche proprement.

Quand une décision est inconnue :

**ne l'invente pas.**

Quand une fonctionnalité est complexe :

**décompose-la.**

Quand une opération est financière :

**sécurise-la.**

Quand une fonctionnalité est terminée :

**teste-la.**

Quand un utilisateur peut être confus :

**simplifie-la.**

Quand une fonctionnalité doit évoluer :

**architecture-la correctement.**

Quand l'IA ne sait pas :

**elle doit le dire.**

------------------------------------------------------------------------

# 82. PHRASE DE DÉMARRAGE RECOMMANDÉE

Après avoir chargé les documents KESSIA, utiliser cette instruction
initiale :

> Tu es maintenant l'agent principal de développement de KESSIA.
>
> Lis intégralement `KESSIA_MASTER_PROMPT.md`, `CLAUDE_CODE_RULES.md`,
> `KESSIA_MVP_SPEC.md` et `KESSIA_DESIGN_SYSTEM.md`.
>
> Ne commence pas encore à coder.
>
> Commence par inspecter le dépôt, identifier la stack existante,
> vérifier les fichiers de configuration, analyser l'architecture
> actuelle et détecter les risques.
>
> Ensuite, prépare un **KESSIA FOUNDATION PLAN** détaillé avec :
>
> 1.  architecture proposée ;
> 2.  structure des dossiers ;
> 3.  stack finale recommandée ;
> 4.  modèle de données initial ;
> 5.  modules MVP ;
> 6.  stratégie sécurité ;
> 7.  stratégie KESSIA AI ;
> 8.  stratégie paiement ;
> 9.  stratégie tests ;
> 10. CI/CD ;
> 11. observabilité ;
> 12. ordre exact des tâches.
>
> Ne développe aucune fonctionnalité tant que cette analyse n'est pas
> terminée.
>
> Après validation du plan, commence par **PHASE 0 --- FOUNDATION**,
> puis avance fonctionnalité par fonctionnalité en respectant
> strictement `CLAUDE_CODE_RULES.md`.

------------------------------------------------------------------------

# 83. CHECKLIST DE DÉMARRAGE

Avant le premier code :

-   [ ] Documents lus
-   [ ] Repository inspecté
-   [ ] Git vérifié
-   [ ] Stack vérifiée
-   [ ] Architecture définie
-   [ ] DB définie
-   [ ] Auth définie
-   [ ] KYC défini
-   [ ] Ledger défini
-   [ ] Paiements abstraits
-   [ ] Design System intégré
-   [ ] CI définie
-   [ ] Tests définis
-   [ ] Observabilité définie
-   [ ] Plan Phase 0 écrit

Puis seulement :

**COMMENCER LE DÉVELOPPEMENT.**
