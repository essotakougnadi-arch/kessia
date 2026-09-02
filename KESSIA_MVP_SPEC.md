# KESSIA_MVP_SPEC.md

# KESSIA --- MVP PRODUCT SPECIFICATION

**Version :** 1.0\
**Marché initial :** Togo\
**Objectif :** lancer une première version réellement utilisable,
mesurable et sécurisée.

------------------------------------------------------------------------

# 1. OBJECTIF DU MVP

Le MVP doit prouver cinq hypothèses :

1.  Les utilisateurs comprennent KESSIA.
2.  Ils peuvent créer un compte et compléter leur profil/KYC.
3.  Ils peuvent participer à une tontine.
4.  Les entrepreneurs peuvent commencer à gérer leur activité.
5.  KESSIA AI réduit la friction et améliore l'accompagnement.

Le MVP ne doit pas tenter de livrer immédiatement tous les modules de la
Super App.

------------------------------------------------------------------------

# 2. UTILISATEURS CIBLES

## Persona A --- Membre de tontine

Besoin :

-   épargner ;
-   cotiser ;
-   suivre le calendrier ;
-   recevoir des rappels ;
-   consulter les opérations.

## Persona B --- Micro-entrepreneur

Besoin :

-   vendre ;
-   gérer produits ;
-   suivre clients ;
-   facturer ;
-   comprendre ses finances ;
-   trouver des formations.

## Persona C --- Responsable de groupe

Besoin :

-   créer une tontine ;
-   inviter ;
-   suivre membres ;
-   suivre cotisations ;
-   gérer calendrier ;
-   communiquer.

## Persona D --- Administrateur

Besoin :

-   vérifier ;
-   superviser ;
-   résoudre les problèmes ;
-   auditer.

------------------------------------------------------------------------

# 3. PARCOURS MVP PRINCIPAL

``` text
Téléchargement
    ↓
Bienvenue
    ↓
Découverte KESSIA
    ↓
Inscription
    ↓
OTP
    ↓
Profil
    ↓
KYC
    ↓
Dashboard
    ↓
Choisir :
  Wallet / Tontine / Business
    ↓
Action
    ↓
Confirmation
    ↓
Notification
    ↓
Historique
```

------------------------------------------------------------------------

# 4. ÉCRANS MVP

## 4.1 Splash

Contenu :

-   logo ;
-   animation légère ;
-   chargement.

## 4.2 Bienvenue

Actions :

-   Créer un compte ;
-   Se connecter ;
-   Découvrir KESSIA.

KESSIA AI doit être accessible.

------------------------------------------------------------------------

## 4.3 Présentation

3 à 4 écrans maximum :

1.  Épargner ensemble.
2.  Entreprendre ensemble.
3.  Développer son activité.
4.  Être accompagné par KESSIA AI.

Possibilité de passer.

------------------------------------------------------------------------

# 5. INSCRIPTION

Champs minimum :

-   téléphone ;
-   prénom ;
-   nom ;
-   mot de passe/PIN selon architecture ;
-   consentements requis.

Flux :

``` text
Téléphone
→ OTP
→ Profil
→ Sécurité
→ Consentements
→ KYC
```

Ne pas demander trop d'informations avant que cela soit nécessaire.

------------------------------------------------------------------------

# 6. KYC MVP

Écran :

-   statut ;
-   document demandé ;
-   capture ;
-   vérification ;
-   progression ;
-   aide IA.

Statuts :

-   non commencé ;
-   en cours ;
-   en vérification ;
-   validé ;
-   rejeté ;
-   action requise.

Chaque rejet doit expliquer clairement la raison exploitable.

------------------------------------------------------------------------

# 7. DASHBOARD

Le dashboard doit être personnalisé.

Sections :

### Bonjour, \[Prénom\]

### Solde

-   Wallet ;
-   épargne ;
-   engagements.

### Actions rapides

-   Envoyer ;
-   Recevoir ;
-   Tontine ;
-   Vendre ;
-   Ajouter une dépense.

### À faire

-   KYC ;
-   cotisation ;
-   facture ;
-   formation.

### KESSIA AI

> ✨ Que puis-je faire pour vous ?

### Activité récente

5 à 10 dernières activités.

------------------------------------------------------------------------

# 8. WALLET MVP

Fonctions :

-   solde ;
-   historique ;
-   recevoir ;
-   envoyer ;
-   dépôt/retrait via intégration disponible ;
-   QR code si intégration prête ;
-   détails transaction.

Architecture :

Le frontend ne modifie jamais directement un solde.

------------------------------------------------------------------------

# 9. PAIEMENTS

Créer une abstraction :

``` text
PaymentProvider
├── MobileMoneyProvider
├── BankProvider
└── CashReceiptProvider
```

Le MVP peut commencer avec les prestataires réellement disponibles et
autorisés.

Ne pas coupler le code métier à un seul fournisseur.

------------------------------------------------------------------------

# 10. KESSIA TONTINE MVP

## Création

Champs :

-   nom ;
-   description ;
-   type ;
-   montant ;
-   fréquence ;
-   date de début ;
-   nombre de membres ;
-   règles ;
-   visibilité.

## Rejoindre

-   invitation ;
-   code ;
-   lien sécurisé.

## Groupe

Afficher :

-   membres ;
-   prochaine échéance ;
-   montant ;
-   progression ;
-   ordre/tour selon modèle ;
-   historique.

## Cotisation

Flux :

``` text
Échéance
→ Rappel
→ Paiement
→ Vérification
→ Reçu
→ Mise à jour du groupe
```

## Notifications

-   prochaine cotisation ;
-   paiement confirmé ;
-   retard ;
-   tour ;
-   changement important.

------------------------------------------------------------------------

# 11. BUSINESS MVP

## Profil entreprise

-   nom ;
-   secteur ;
-   description ;
-   localisation générale ;
-   téléphone ;
-   logo ;
-   statut.

## Produits

-   nom ;
-   prix ;
-   coût ;
-   stock ;
-   catégorie ;
-   image.

## Vente

-   produit ;
-   quantité ;
-   prix ;
-   client optionnel ;
-   paiement ;
-   date.

## Dépenses

-   catégorie ;
-   montant ;
-   date ;
-   note ;
-   justificatif optionnel.

## Facture

-   numéro ;
-   vendeur ;
-   client ;
-   lignes ;
-   total ;
-   statut.

------------------------------------------------------------------------

# 12. BUSINESS DASHBOARD

Indicateurs :

-   ventes du jour ;
-   ventes du mois ;
-   dépenses ;
-   marge estimée ;
-   produits les plus vendus ;
-   stock faible.

KESSIA AI peut expliquer :

> Votre chiffre d'affaires a augmenté de X % par rapport à la période
> précédente.

Uniquement si les données nécessaires existent.

------------------------------------------------------------------------

# 13. KESSIA AI MVP

Le MVP doit se concentrer sur :

### A. Onboarding

Aider à créer le compte.

### B. FAQ

Répondre aux questions KESSIA.

### C. Guide

Expliquer les étapes.

### D. Business Assistant

Aider à comprendre ventes/dépenses.

### E. Support

Orienter vers les bons services.

------------------------------------------------------------------------

# 14. KESSIA AI --- EXEMPLES

Question :

> Comment créer une tontine ?

Réponse :

1.  Ouvrez Tontines.
2.  Appuyez sur Créer.
3.  Choisissez le type.
4.  Définissez montant et fréquence.
5.  Invitez les membres.
6.  Vérifiez les règles.
7.  Confirmez.

Bouton :

**Me guider maintenant**

------------------------------------------------------------------------

Question :

> Pourquoi mon KYC est refusé ?

Réponse basée sur le motif réel :

> Votre document semble illisible. Essayez avec une photo nette, sans
> reflet et avec les quatre coins visibles.

------------------------------------------------------------------------

Question :

> Comment enregistrer une vente ?

Réponse :

> Je peux vous guider. Ouvrez Business puis sélectionnez « Nouvelle
> vente ».

------------------------------------------------------------------------

# 15. SUPPORT MVP

Créer :

-   FAQ ;
-   KESSIA AI ;
-   tickets ;
-   catégorie ;
-   priorité ;
-   statut ;
-   réponse agent.

Statuts :

-   ouvert ;
-   en cours ;
-   en attente ;
-   résolu ;
-   fermé.

------------------------------------------------------------------------

# 16. NOTIFICATIONS MVP

Prévoir un Notification Center.

Catégories :

-   sécurité ;
-   paiement ;
-   tontine ;
-   business ;
-   support ;
-   système.

Préférences utilisateur.

------------------------------------------------------------------------

# 17. PROFIL

Sections :

-   identité ;
-   KYC ;
-   sécurité ;
-   préférences ;
-   notifications ;
-   langue ;
-   confidentialité ;
-   aide ;
-   déconnexion.

------------------------------------------------------------------------

# 18. SÉCURITÉ MVP

Obligatoire :

-   OTP ;
-   session sécurisée ;
-   verrouillage après tentatives ;
-   MFA si applicable ;
-   biométrie appareil si disponible ;
-   RBAC ;
-   validation backend ;
-   audit ;
-   rate limiting.

------------------------------------------------------------------------

# 19. ADMIN MVP

## Dashboard

-   utilisateurs ;
-   KYC ;
-   transactions ;
-   tontines ;
-   tickets ;
-   alertes.

## Utilisateur

-   recherche ;
-   profil ;
-   KYC ;
-   statut ;
-   historique autorisé.

## Tontine

-   groupes ;
-   membres ;
-   cotisations ;
-   incidents.

## Transactions

-   recherche ;
-   filtres ;
-   détail ;
-   statut ;
-   audit.

## Support

-   tickets ;
-   assignation ;
-   réponse ;
-   historique.

------------------------------------------------------------------------

# 20. BASE DE DONNÉES MVP

Entités principales :

-   users
-   user_profiles
-   roles
-   permissions
-   kyc_cases
-   kyc_documents
-   wallets
-   ledger_accounts
-   ledger_entries
-   payment_transactions
-   payment_providers
-   tontines
-   tontine_members
-   tontine_contributions
-   tontine_schedules
-   businesses
-   products
-   inventory_movements
-   customers
-   sales
-   sale_items
-   expenses
-   invoices
-   notifications
-   support_tickets
-   audit_logs
-   ai_conversations

Toutes les relations doivent être documentées.

------------------------------------------------------------------------

# 21. API MVP

Versionner l'API :

`/api/v1/...`

Exemples :

``` text
POST /auth/register
POST /auth/verify-otp
POST /auth/login
POST /auth/refresh

GET /me
PATCH /me

POST /kyc
GET /kyc/status
POST /kyc/documents

GET /wallet
GET /wallet/transactions

POST /payments
GET /payments/:id

POST /tontines
GET /tontines
GET /tontines/:id
POST /tontines/:id/join
POST /tontines/:id/contributions

GET /business
POST /business
GET /business/products
POST /business/products
POST /business/sales
GET /business/dashboard

POST /ai/chat
GET /notifications
POST /support/tickets
```

Les noms finaux peuvent être adaptés à l'architecture.

------------------------------------------------------------------------

# 22. ÉTATS UI OBLIGATOIRES

Chaque écran doit prévoir :

-   loading ;
-   success ;
-   empty ;
-   error ;
-   offline ;
-   permission denied ;
-   retry.

------------------------------------------------------------------------

# 23. PERFORMANCE

Objectifs MVP :

-   démarrage rapide ;
-   images optimisées ;
-   pagination ;
-   lazy loading ;
-   cache ;
-   compression ;
-   requêtes indexées ;
-   aucune requête inutile.

Tester sur Android entrée de gamme.

------------------------------------------------------------------------

# 24. ACCESSIBILITÉ

Prévoir :

-   contraste suffisant ;
-   taille de texte adaptable ;
-   zones tactiles correctes ;
-   labels pour lecteurs d'écran ;
-   erreurs compréhensibles ;
-   navigation cohérente.

------------------------------------------------------------------------

# 25. ANALYTICS PRODUIT

Mesurer avec respect de la confidentialité :

-   inscription commencée ;
-   inscription terminée ;
-   KYC commencé ;
-   KYC terminé ;
-   première tontine ;
-   première cotisation ;
-   première vente ;
-   activation IA ;
-   rétention ;
-   tickets support.

------------------------------------------------------------------------

# 26. KPI MVP

### Acquisition

-   nouveaux inscrits ;
-   coût acquisition.

### Activation

-   \% utilisateurs KYC terminés ;
-   \% première action.

### Engagement

-   sessions ;
-   tontines actives ;
-   ventes enregistrées.

### Finance

-   volume transactions ;
-   valeur moyenne ;
-   fréquence.

### Satisfaction

-   taux de résolution support ;
-   satisfaction ;
-   NPS si pertinent.

------------------------------------------------------------------------

# 27. HORS MVP

Ne pas implémenter immédiatement :

-   crowdfunding réglementé ;
-   investissement réel ;
-   assurance réelle ;
-   crédit réel ;
-   crypto ;
-   trading ;
-   appels vidéo complexes ;
-   blockchain obligatoire ;
-   microservices distribués inutilement.

Créer des interfaces d'extension plutôt que de faux services.

------------------------------------------------------------------------

# 28. CRITÈRES DE LANCEMENT

Le MVP peut être présenté comme pilote lorsque :

-   les parcours critiques fonctionnent ;
-   les erreurs critiques sont corrigées ;
-   les tests passent ;
-   les données sont sécurisées ;
-   les opérations sont auditables ;
-   les intégrations sont réelles ou explicitement simulées ;
-   le support fonctionne ;
-   les conditions légales et partenaires nécessaires sont validés.

------------------------------------------------------------------------

# 29. ROADMAP APRÈS MVP

### V1.1

-   Marketplace ;
-   Learn ;
-   Community ;
-   Business avancé.

### V1.2

-   KESSIA Score ;
-   Business DNA ;
-   Analytics avancés.

### V2

-   Investissement conforme ;
-   diaspora ;
-   assurance via partenaires ;
-   Jobs.

### V3

-   API ;
-   agriculture ;
-   santé ;
-   immobilier ;
-   énergie ;
-   expansion UEMOA.

------------------------------------------------------------------------

# 30. PRINCIPE DE PRIORITÉ

Quand deux fonctionnalités sont en conflit :

**Sécurité \> conformité \> fiabilité financière \> simplicité \>
vitesse \> sophistication.**
