# KESSIA_MASTER_PROMPT.md

# KESSIA --- MASTER DEVELOPMENT PROMPT

## Super App Coopérative de l'Entrepreneuriat Africain

**Slogan :** Épargner ensemble. Entreprendre ensemble. Grandir ensemble.

**Statut du document :** Master Prompt de référence pour Claude Code /
Antigravity\
**Version :** 1.0\
**Cible initiale :** Togo\
**Expansion :** UEMOA → CEDEAO → Afrique\
**Principe directeur :** construire progressivement un produit
réellement utilisable, sécurisé, maintenable et évolutif, plutôt qu'une
simple démonstration.

------------------------------------------------------------------------

## 1. RÔLE DE CLAUDE CODE

Tu es l'architecte logiciel principal, lead developer, product engineer,
UX engineer et responsable qualité du projet KESSIA.

Tu dois transformer les spécifications de ce document en une application
réelle, fonctionnelle et évolutive.

### Règles absolues

1.  Ne pas produire uniquement des maquettes statiques lorsque la
    fonctionnalité doit être fonctionnelle.
2.  Ne pas inventer de paiements, soldes, KYC ou transactions.
3.  Toute donnée financière affichée doit provenir du backend ou d'un
    état explicitement identifié comme démonstration.
4.  Toute opération financière sensible exige une validation explicite.
5.  Ne jamais contourner KYC, AML, permissions ou contrôles de sécurité.
6.  Ne jamais exposer une donnée appartenant à un autre utilisateur.
7.  Séparer clairement frontend, backend, données, logique métier et
    intégrations externes.
8.  Prévoir l'internationalisation dès le début.
9.  Prévoir l'accessibilité et les appareils Android modestes.
10. Documenter les décisions techniques importantes.
11. Tester les fonctionnalités critiques avant de les déclarer
    terminées.
12. Si une information réglementaire ou fournisseur est inconnue,
    utiliser un adaptateur/configuration et signaler le point à valider
    au lieu d'inventer une règle.
13. Construire d'abord un MVP solide puis activer progressivement les
    fonctions avancées.
14. Ne jamais introduire une dépendance lourde sans justification.
15. Toute action critique doit être auditable.

------------------------------------------------------------------------

# 2. VISION

KESSIA est une plateforme numérique coopérative destinée à l'inclusion
financière, à l'entrepreneuriat, à la mise en réseau et au développement
des PME africaines.

KESSIA doit accompagner un utilisateur :

**Idée → Inscription → KYC → Épargne → Tontine → Projet → Vente →
Gestion → Financement → Croissance → Investissement →
Internationalisation**

KESSIA n'est pas une simple application de tontine.

Elle combine progressivement :

-   coopérative numérique ;
-   services financiers réglementés via partenaires appropriés ;
-   gestion simplifiée d'entreprise ;
-   marketplace ;
-   communauté ;
-   formation ;
-   emploi ;
-   assurance via partenaires ;
-   investissement selon cadre légal ;
-   intelligence artificielle ;
-   analytics ;
-   API.

------------------------------------------------------------------------

# 3. POSITIONNEMENT

KESSIA doit être perçue comme :

> « Le système d'exploitation numérique de l'entrepreneur africain. »

Le produit doit être :

-   africain dans ses racines ;
-   international dans sa qualité ;
-   simple dans son utilisation ;
-   rigoureux dans sa sécurité ;
-   coopératif dans son esprit ;
-   intelligent dans son assistance.

------------------------------------------------------------------------

# 4. PRINCIPES PRODUIT

## 4.1 Simplicité

Un utilisateur peu technophile doit comprendre les parcours essentiels.

## 4.2 Confiance

Les opérations, statuts, frais et échéances doivent être transparents.

## 4.3 Coopération

La plateforme doit valoriser l'entraide et la responsabilité collective.

## 4.4 Inclusion

Le produit doit tenir compte :

-   de la connectivité variable ;
-   des smartphones modestes ;
-   des utilisateurs débutants ;
-   des paiements locaux ;
-   des langues ;
-   des réalités des microentreprises.

## 4.5 Sécurité par conception

Security by design, privacy by design et auditabilité doivent être
intégrés dès l'architecture.

## 4.6 IA responsable

L'IA aide, explique, recommande et automatise certaines tâches
autorisées, mais ne contourne jamais les contrôles réglementaires ou
financiers.

------------------------------------------------------------------------

# 5. MODULES KESSIA

Architecture fonctionnelle cible :

1.  KESSIA Home
2.  KESSIA Identity / KYC
3.  KESSIA Wallet
4.  KESSIA Tontine
5.  KESSIA Business
6.  KESSIA Market
7.  KESSIA Learn
8.  KESSIA Community
9.  KESSIA Invest
10. KESSIA Jobs
11. KESSIA Insurance
12. KESSIA AI
13. KESSIA Analytics
14. KESSIA Global / Diaspora
15. KESSIA Agriculture
16. KESSIA Health
17. KESSIA Housing / Immobilier
18. KESSIA Transport
19. KESSIA Energy
20. KESSIA Admin
21. KESSIA Open API

Les modules 15 à 21 sont des capacités futures et ne doivent pas
alourdir inutilement le MVP.

------------------------------------------------------------------------

# 6. KESSIA AI

KESSIA AI est l'assistant intelligent natif de la plateforme.

## 6.1 Rôle

Il doit pouvoir :

-   expliquer KESSIA ;
-   accompagner l'inscription ;
-   expliquer le KYC ;
-   guider dans les écrans ;
-   répondre aux FAQ ;
-   expliquer les transactions ;
-   aider à créer un business plan ;
-   analyser des données autorisées ;
-   aider à rédiger des factures/devis ;
-   proposer des formations ;
-   résumer des informations ;
-   préparer certaines actions avec confirmation ;
-   assister vocalement à terme.

## 6.2 Assistance à l'inscription

Premier lancement :

> Bonjour et bienvenue sur KESSIA. Je suis KESSIA AI. Je peux vous
> accompagner pour créer votre compte et vous expliquer chaque étape.

Actions :

-   Commencer mon inscription
-   Comment fonctionne KESSIA ?
-   Demander à KESSIA

## 6.3 Assistant contextuel

Chaque écran important peut afficher :

**✨ Demander à KESSIA**

L'assistant connaît le contexte autorisé de l'écran.

Exemples :

-   Wallet : expliquer solde, historique, frais.
-   Tontine : expliquer cotisations, calendrier et règles.
-   Business : expliquer ventes, marge, stock.
-   KYC : expliquer une erreur ou une étape.

## 6.4 Mode Guide-moi

L'utilisateur peut demander :

> Guide-moi pour créer une tontine.

Flux :

1.  identifier le parcours ;
2.  expliquer l'étape ;
3.  indiquer l'action suivante ;
4.  vérifier les champs ;
5.  signaler les erreurs ;
6.  poursuivre jusqu'à la fin.

## 6.5 Actions assistées

Une action sensible suit :

``` text
Commande utilisateur
→ Compréhension IA
→ Prévisualisation
→ Confirmation utilisateur
→ Validation backend
→ Exécution
→ Reçu / résultat
```

L'IA ne doit jamais prétendre avoir exécuté une action non confirmée.

## 6.6 IA et données financières

L'IA doit utiliser uniquement les données autorisées et réellement
disponibles.

Elle ne doit jamais :

-   inventer un solde ;
-   inventer une transaction ;
-   inventer un rendement ;
-   garantir un financement ;
-   promettre un résultat financier ;
-   contourner les contrôles.

## 6.7 Escalade humaine

Créer une option :

**Parler à un conseiller**

Le système peut ouvrir un ticket support avec consentement.

------------------------------------------------------------------------

# 7. IDENTITÉ VISUELLE

KESSIA doit avoir une identité authentique, africaine, premium et
technologique.

## Couleur signature

**KESSIA Terracotta --- #B65A3A**

Couleurs complémentaires :

-   KESSIA Gold --- #D6A84F
-   KESSIA Deep Green --- #1F5D4A
-   KESSIA Earth --- #F3E8DA
-   KESSIA Dark --- #17201D
-   White --- #FFFFFF

Ne pas utiliser les couleurs de manière décorative excessive.

L'identité africaine doit être subtile :

-   géométrie ;
-   textures ;
-   artisanat ;
-   terre ;
-   nature ;
-   communauté ;
-   croissance.

Éviter les clichés.

------------------------------------------------------------------------

# 8. PRODUITS CIBLES

## KESSIA Mobile

Android / iOS.

## KESSIA Web

Entrepreneurs, partenaires, coopératives et utilisateurs avancés.

## KESSIA Business Suite

ERP léger pour micro et petites entreprises.

## KESSIA Admin

Back-office sécurisé pour opérations, support, conformité, finance et
analytics.

------------------------------------------------------------------------

# 9. STACK TECHNIQUE CIBLE

Frontend mobile :

-   Flutter

Frontend web :

-   React / Next.js selon décision d'architecture

Backend :

-   NestJS / TypeScript

Base :

-   PostgreSQL

Cache / files :

-   Redis

Notifications :

-   Firebase Cloud Messaging ou abstraction équivalente

Conteneurisation :

-   Docker

Orchestration :

-   Kubernetes lorsque l'échelle le justifie

Cloud :

-   architecture cloud sécurisée et portable

API :

-   REST versionné et/ou GraphQL lorsque justifié

Authentification :

-   tokens courts + refresh sécurisé ;
-   MFA ;
-   biométrie côté appareil lorsque disponible.

IA :

-   couche d'abstraction LLM ;
-   RAG pour connaissances KESSIA ;
-   journalisation contrôlée ;
-   garde-fous.

------------------------------------------------------------------------

# 10. ARCHITECTURE MÉTIER

Domaines principaux :

-   Identity
-   User
-   KYC
-   Wallet
-   Payments
-   Ledger
-   Tontine
-   Notifications
-   Community
-   Business
-   CRM
-   Inventory
-   Invoicing
-   Marketplace
-   Learning
-   Support
-   AI
-   Analytics
-   Admin

Commencer avec un **modular monolith bien séparé** si cela accélère le
MVP.

Ne pas imposer des microservices uniquement pour faire « futuriste ».

Migrer vers des microservices lorsque :

-   le volume ;
-   les équipes ;
-   les contraintes de disponibilité ;
-   les frontières métier

le justifient.

------------------------------------------------------------------------

# 11. FINANCE ET LEDGER

Toutes les opérations financières critiques doivent être basées sur un
ledger fiable.

Le solde ne doit pas être simplement modifié par une valeur arbitraire.

Prévoir :

-   transaction ID ;
-   type ;
-   montant ;
-   devise ;
-   source ;
-   destination ;
-   statut ;
-   timestamp ;
-   référence externe ;
-   idempotency key ;
-   audit metadata.

États possibles :

-   pending ;
-   processing ;
-   completed ;
-   failed ;
-   reversed ;
-   cancelled.

------------------------------------------------------------------------

# 12. KESSIA TONTINE

Types MVP :

### Classique tournante

Les membres cotisent périodiquement et bénéficient selon l'ordre défini.

### Tontine projet

Épargne collective destinée à un objectif.

### Tontine croissance

Objectif orienté développement d'activité.

Fonctions :

-   créer ;
-   rejoindre ;
-   inviter ;
-   définir montant ;
-   fréquence ;
-   calendrier ;
-   membres ;
-   règles ;
-   cotisations ;
-   pénalités selon règlement applicable ;
-   fonds de garantie selon modèle validé ;
-   reçus ;
-   historique ;
-   notifications.

Chaque groupe possède un contrat numérique interne et un journal
d'audit.

------------------------------------------------------------------------

# 13. KESSIA BUSINESS

Fonctions :

-   profil entreprise ;
-   catalogue ;
-   produits ;
-   services ;
-   clients ;
-   ventes ;
-   dépenses ;
-   factures ;
-   devis ;
-   stocks ;
-   fournisseurs ;
-   marges ;
-   objectifs ;
-   calendrier ;
-   rapports.

Dashboard :

-   chiffre d'affaires ;
-   ventes ;
-   dépenses ;
-   marge ;
-   trésorerie ;
-   stock ;
-   clients ;
-   alertes.

------------------------------------------------------------------------

# 14. KESSIA MARKET

Marketplace multi-vendeurs :

-   boutique ;
-   catalogue ;
-   recherche ;
-   catégories ;
-   panier ;
-   commande ;
-   paiement ;
-   livraison ;
-   avis ;
-   vendeur vérifié.

Prévoir l'intégration future avec des partenaires logistiques.

------------------------------------------------------------------------

# 15. KESSIA LEARN

-   cours ;
-   vidéos ;
-   documents ;
-   quiz ;
-   certifications ;
-   mentorat ;
-   webinaires ;
-   parcours personnalisés.

KESSIA AI peut recommander une formation selon :

-   secteur ;
-   niveau ;
-   objectifs ;
-   difficultés observées.

------------------------------------------------------------------------

# 16. KESSIA COMMUNITY

-   profils ;
-   groupes ;
-   publications ;
-   commentaires ;
-   messagerie ;
-   notifications ;
-   signalement ;
-   modération.

Prévoir appels audio/vidéo comme capacité future.

------------------------------------------------------------------------

# 17. KESSIA INVEST

Le module d'investissement doit être activé uniquement dans un cadre
juridique et réglementaire validé.

Capacités possibles :

-   présentation de projets ;
-   recherche de partenaires ;
-   financement participatif lorsque légalement autorisé ;
-   investissement coopératif selon structure validée ;
-   suivi des participations.

Ne pas coder de promesse de rendement.

------------------------------------------------------------------------

# 18. KESSIA REPUTATION

Créer le **KESSIA Score**.

Le score doit être explicable.

Il peut intégrer, selon les règles approuvées :

-   ponctualité ;
-   engagements respectés ;
-   activité vérifiée ;
-   ancienneté ;
-   qualité des interactions ;
-   historique pertinent.

Ne pas utiliser de variables discriminatoires.

Afficher pourquoi un score évolue.

------------------------------------------------------------------------

# 19. BUSINESS DNA

Chaque entreprise peut disposer d'un profil numérique synthétique :

-   activité ;
-   performances ;
-   objectifs ;
-   compétences ;
-   besoins ;
-   score de confiance ;
-   historique autorisé ;
-   opportunités.

KESSIA AI peut recommander :

-   formation ;
-   fournisseur ;
-   partenaire ;
-   financement potentiel ;
-   optimisation.

------------------------------------------------------------------------

# 20. KESSIA ANALYTICS

Dashboards :

### Utilisateur

-   revenus ;
-   dépenses ;
-   objectifs ;
-   épargne.

### Entreprise

-   CA ;
-   marge ;
-   produits ;
-   clients ;
-   stock.

### Coopérative

-   membres ;
-   cotisations ;
-   participation ;
-   incidents.

### Institution

Données anonymisées et agrégées uniquement, selon base légale et
permissions.

------------------------------------------------------------------------

# 21. NOTIFICATIONS

Canaux :

-   push ;
-   in-app ;
-   SMS selon intégration ;
-   email selon besoin.

Types :

-   paiement ;
-   cotisation ;
-   KYC ;
-   sécurité ;
-   commande ;
-   support ;
-   formation ;
-   opportunité.

Les notifications doivent être idempotentes et configurables.

------------------------------------------------------------------------

# 22. HORS LIGNE ET CONNECTIVITÉ

Prévoir :

-   cache local ;
-   affichage des dernières données autorisées ;
-   file d'actions non sensibles ;
-   synchronisation ;
-   gestion des conflits.

Ne jamais permettre une opération financière critique hors ligne sans
mécanisme sécurisé et explicitement conçu pour cela.

------------------------------------------------------------------------

# 23. SÉCURITÉ

Minimum :

-   TLS ;
-   chiffrement des secrets ;
-   gestion sécurisée des tokens ;
-   MFA ;
-   contrôle RBAC ;
-   validation backend ;
-   rate limiting ;
-   protection brute-force ;
-   audit log ;
-   sauvegardes ;
-   détection d'anomalies ;
-   gestion des sessions ;
-   révocation ;
-   protection des données.

------------------------------------------------------------------------

# 24. KYC / AML

Créer un système configurable :

-   identité ;
-   document ;
-   selfie/biométrie via prestataire si applicable ;
-   statut ;
-   niveau de vérification ;
-   revue manuelle ;
-   motifs de rejet ;
-   journal d'audit.

Ne pas intégrer de règles réglementaires inventées.

Les exigences exactes doivent être validées par conseil
juridique/compliance au Togo et dans chaque pays d'expansion.

------------------------------------------------------------------------

# 25. ADMIN

Back-office avec :

-   utilisateurs ;
-   KYC ;
-   tontines ;
-   transactions ;
-   litiges ;
-   support ;
-   marketplace ;
-   contenu ;
-   formations ;
-   modération ;
-   paramètres ;
-   rôles ;
-   audit ;
-   analytics.

RBAC :

-   Super Admin
-   Compliance
-   Finance
-   Support
-   Moderator
-   Content Manager
-   Operations
-   Analyst

------------------------------------------------------------------------

# 26. SUPPORT

Créer :

-   FAQ ;
-   KESSIA AI ;
-   ticket ;
-   chat humain ;
-   statut ;
-   SLA configurable ;
-   historique.

------------------------------------------------------------------------

# 27. ROADMAP

## Phase 0 --- Fondation

-   architecture ;
-   design system ;
-   auth ;
-   CI/CD ;
-   base de données ;
-   sécurité ;
-   observabilité.

## Phase 1 --- MVP

-   onboarding ;
-   KYC simulé/adapté aux intégrations disponibles ;
-   wallet ledger ;
-   paiements via adaptateurs ;
-   tontines ;
-   notifications ;
-   Business basique ;
-   support ;
-   KESSIA AI FAQ/onboarding.

## Phase 2

-   marketplace ;
-   Learn ;
-   Community ;
-   CRM ;
-   stock avancé ;
-   analytics ;
-   réputation.

## Phase 3

-   Invest ;
-   Jobs ;
-   Insurance ;
-   diaspora ;
-   Business DNA ;
-   IA avancée.

## Phase 4

-   Open API ;
-   Agriculture ;
-   Health ;
-   Housing ;
-   Energy ;
-   expansion internationale.

------------------------------------------------------------------------

# 28. TESTS ET QUALITÉ

Chaque fonctionnalité doit avoir :

-   unit tests ;
-   integration tests ;
-   API tests ;
-   UI tests pour parcours critiques ;
-   tests de sécurité ;
-   tests de permissions ;
-   tests de régression.

Parcours critiques :

1.  inscription ;
2.  login ;
3.  KYC ;
4.  création tontine ;
5.  cotisation ;
6.  paiement ;
7.  historique ;
8.  création entreprise ;
9.  vente ;
10. facture ;
11. support.

------------------------------------------------------------------------

# 29. OBSERVABILITÉ

Prévoir :

-   logs structurés ;
-   métriques ;
-   traces ;
-   alertes ;
-   monitoring ;
-   audit.

Ne jamais logger inutilement des données sensibles.

------------------------------------------------------------------------

# 30. LIVRABLES ATTENDUS DE CLAUDE CODE

À chaque grande phase :

1.  code ;
2.  migrations ;
3.  tests ;
4.  documentation ;
5.  variables d'environnement documentées ;
6.  README ;
7.  changelog ;
8.  décisions d'architecture ;
9.  rapport de tests ;
10. liste des limites connues.

Ne jamais déclarer « terminé » sans validation.

------------------------------------------------------------------------

# 31. DEFINITION OF DONE

Une fonctionnalité est terminée seulement si :

-   UI terminée ;
-   backend terminé ;
-   validation ;
-   erreurs gérées ;
-   permissions ;
-   tests ;
-   logs ;
-   documentation ;
-   responsive ;
-   accessibilité minimale ;
-   sécurité ;
-   état loading/empty/error/success ;
-   aucun mock critique non signalé.

------------------------------------------------------------------------

# 32. INSTRUCTION FINALE

Construis KESSIA comme un produit réel destiné à des millions
d'utilisateurs à terme, mais développe-le par étapes.

**Ne cherche pas à construire tout l'avenir dans le MVP.**

Construis une fondation excellente, puis ajoute les capacités une par
une.

Priorités absolues :

**Confiance → Sécurité → Simplicité → Performance → Utilité → Croissance
→ Intelligence.**
