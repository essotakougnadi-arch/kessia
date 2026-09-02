# KESSIA_DESIGN_SYSTEM.md

# KESSIA --- DESIGN SYSTEM

**Version :** 1.0\
**Principe :** Africaine dans ses racines. Moderne dans son expression.
Internationale dans sa qualité.

------------------------------------------------------------------------

# 1. IDENTITÉ

KESSIA doit être immédiatement reconnaissable.

L'identité doit évoquer :

-   coopération ;
-   confiance ;
-   croissance ;
-   terre ;
-   entrepreneuriat ;
-   communauté ;
-   technologie.

Éviter :

-   design fintech générique ;
-   surcharge de motifs ;
-   couleurs criardes ;
-   clichés africains ;
-   interface trop bancaire.

------------------------------------------------------------------------

# 2. COULEUR SIGNATURE

## KESSIA Terracotta

`#B65A3A`

Utilisations :

-   boutons principaux ;
-   éléments de marque ;
-   CTA ;
-   liens importants ;
-   navigation active ;
-   illustrations principales.

------------------------------------------------------------------------

# 3. PALETTE

  Token     Valeur         Usage
  --------- -------------- ----------------------
  primary   #B65A3A        marque / CTA
  gold      #D6A84F        récompense / premium
  green     #1F5D4A        croissance / succès
  earth     #F3E8DA        fonds chauds
  dark      #17201D        texte / dark mode
  white     #FFFFFF        surfaces
  danger    configurable   erreurs
  warning   configurable   avertissements
  info      configurable   information

Les couleurs danger/warning/info doivent respecter les contrastes
d'accessibilité.

------------------------------------------------------------------------

# 4. TOKENS

Créer un système de tokens.

Exemple conceptuel :

``` text
color.primary
color.primaryHover
color.primaryPressed
color.background
color.surface
color.surfaceElevated
color.text
color.textSecondary
color.border
color.success
color.warning
color.danger
color.info

spacing.xs
spacing.sm
spacing.md
spacing.lg
spacing.xl
spacing.2xl

radius.sm
radius.md
radius.lg
radius.xl
radius.full

shadow.sm
shadow.md
shadow.lg
```

Ne jamais disperser les valeurs hexadécimales dans les composants.

------------------------------------------------------------------------

# 5. TYPOGRAPHIE

Utiliser une famille moderne et lisible avec support multilingue.

Hiérarchie :

-   Display
-   H1
-   H2
-   H3
-   Body Large
-   Body
-   Body Small
-   Caption
-   Button
-   Financial Number

Les chiffres monétaires doivent avoir une excellente lisibilité.

------------------------------------------------------------------------

# 6. ICONOGRAPHIE

Les icônes doivent être :

-   simples ;
-   cohérentes ;
-   reconnaissables ;
-   accessibles.

Éviter de mélanger plusieurs familles d'icônes.

Créer des icônes KESSIA spécifiques pour les concepts centraux :

-   Tontine ;
-   Coopération ;
-   Business ;
-   Wallet ;
-   KESSIA AI ;
-   Score ;
-   Récompense.

------------------------------------------------------------------------

# 7. LOGO

Le logo doit communiquer :

**communauté + croissance + protection + technologie.**

Explorer des concepts :

-   cercle ;
-   personnes ;
-   graine ;
-   croissance ;
-   lien.

Le logo doit fonctionner :

-   en couleur ;
-   monochrome ;
-   petit format ;
-   favicon ;
-   app icon ;
-   impression.

------------------------------------------------------------------------

# 8. MOTIFS AFRICAINS

Utiliser des micro-patterns inspirés de formes géométriques africaines.

Règle :

**10 % identité / 90 % lisibilité**

Les motifs ne doivent jamais gêner :

-   texte ;
-   boutons ;
-   données financières ;
-   formulaires.

------------------------------------------------------------------------

# 9. PRINCIPES UX

## Clarté

Une action principale par écran.

## Progressivité

Ne pas présenter toutes les options simultanément.

## Confiance

Toujours expliquer :

-   ce qui va arriver ;
-   combien ;
-   quand ;
-   pourquoi.

## Feedback

Chaque action importante doit avoir un retour visuel.

------------------------------------------------------------------------

# 10. NAVIGATION MOBILE

Navigation principale recommandée :

``` text
Accueil
Tontine
Business
Market
Profil
```

Les fonctions secondaires sont accessibles depuis Home ou un menu
organisé.

KESSIA AI reste disponible globalement.

------------------------------------------------------------------------

# 11. HOME

Structure :

``` text
Bonjour [Prénom]

[ Solde / situation ]

Actions rapides

À faire aujourd'hui

Mes tontines

Mon activité

Recommandations

KESSIA AI

Activité récente
```

Le contenu doit être personnalisable.

------------------------------------------------------------------------

# 12. BOUTONS

Types :

### Primary

Action principale.

### Secondary

Action secondaire.

### Tertiary

Action discrète.

### Destructive

Suppression/annulation.

### AI

Bouton distinctif :

**✨ Demander à KESSIA**

------------------------------------------------------------------------

# 13. CARTES

Les cards servent à regrouper l'information.

Exemples :

-   Wallet ;
-   prochaine cotisation ;
-   ventes ;
-   formation ;
-   recommandation IA.

Éviter une interface composée uniquement de cartes.

------------------------------------------------------------------------

# 14. FORMULAIRES

Principes :

-   labels toujours visibles ;
-   aide contextuelle ;
-   validation en temps utile ;
-   erreurs près du champ ;
-   exemples ;
-   clavier adapté ;
-   progression pour formulaires longs.

------------------------------------------------------------------------

# 15. KYC UI

Le KYC doit être rassurant.

Afficher :

``` text
Étape 2 sur 4

Votre identité

[ Capture document ]

Pourquoi cette information ?
✨ Demander à KESSIA

[ Continuer ]
```

Afficher les exigences avant la capture.

------------------------------------------------------------------------

# 16. WALLET UI

Le solde doit être immédiatement lisible.

Exemple :

``` text
Solde disponible
125 000 FCFA

[ Envoyer ] [ Recevoir ]

Épargne
75 000 FCFA

Activité récente
...
```

Ne jamais utiliser un graphisme qui rend le montant difficile à lire.

------------------------------------------------------------------------

# 17. TONTINE UI

Carte :

``` text
Tontine Entrepreneurs

8 membres
25 000 FCFA / mois

Prochaine cotisation
12 août

████████░░ 80 %

[ Voir la tontine ]
```

Utiliser la couleur verte pour progression réussie et terracotta pour
les actions de marque.

------------------------------------------------------------------------

# 18. BUSINESS UI

Dashboard :

``` text
CA
1 250 000 FCFA

Marge estimée
320 000 FCFA

Ventes
48

Stock faible
3 produits
```

Les informations doivent être lisibles même sur petit écran.

------------------------------------------------------------------------

# 19. KESSIA AI UI

KESSIA AI possède un langage visuel identifiable.

Élément principal :

**✨**

Couleur :

Terracotta + Gold.

Interface :

-   messages courts ;
-   suggestions ;
-   boutons d'action ;
-   références aux données réelles ;
-   possibilité de passer à un humain.

------------------------------------------------------------------------

# 20. AI CONTEXTUAL CARD

Exemple :

``` text
✨ KESSIA AI

Votre stock du produit "X" semble faible.

Voulez-vous voir les produits concernés ?

[ Voir le stock ]
[ Plus tard ]
```

Ne pas créer de fausses alertes.

------------------------------------------------------------------------

# 21. NOTIFICATIONS

Hiérarchie :

-   critique ;
-   important ;
-   information ;
-   promotion.

Les notifications promotionnelles ne doivent pas ressembler aux alertes
de sécurité.

------------------------------------------------------------------------

# 22. BADGES

Badges possibles :

-   Profil vérifié ;
-   Entrepreneur actif ;
-   Membre fiable ;
-   Formé ;
-   Ambassadeur.

Les critères doivent être explicites.

------------------------------------------------------------------------

# 23. KESSIA SCORE

Design :

-   score ;
-   niveau ;
-   évolution ;
-   explication.

Exemple :

``` text
KESSIA Score
87 / 100

↑ +4 ce mois-ci

Pourquoi ?

✓ Cotisations à temps
✓ Profil vérifié
✓ Activité régulière
```

Éviter tout système opaque.

------------------------------------------------------------------------

# 24. DARK MODE

Fond sombre :

`#17201D`

Surfaces :

teintes sombres dérivées.

Accent :

Terracotta.

Accent secondaire :

Gold.

Le contraste doit rester élevé.

------------------------------------------------------------------------

# 25. ANIMATIONS

Animations :

-   rapides ;
-   utiles ;
-   discrètes.

Exemples :

-   validation ;
-   progression ;
-   succès ;
-   changement de solde ;
-   ouverture AI.

Respecter `prefers-reduced-motion` lorsque disponible.

------------------------------------------------------------------------

# 26. ÉTATS DES COMPOSANTS

Chaque composant interactif doit prévoir :

-   default ;
-   hover ;
-   focus ;
-   pressed ;
-   disabled ;
-   loading ;
-   error ;
-   success.

------------------------------------------------------------------------

# 27. ACCESSIBILITÉ

Minimum :

-   contraste WCAG approprié ;
-   focus visible ;
-   taille tactile suffisante ;
-   labels ;
-   support lecteur d'écran ;
-   texte redimensionnable ;
-   erreurs compréhensibles.

Ne jamais communiquer une information uniquement par couleur.

------------------------------------------------------------------------

# 28. RESPONSIVE WEB

Breakpoints à définir selon les besoins réels.

Le design doit fonctionner :

-   mobile ;
-   tablette ;
-   desktop.

La version web ne doit pas être une simple version mobile agrandie.

------------------------------------------------------------------------

# 29. ILLUSTRATIONS

Style :

-   moderne ;
-   humain ;
-   africain ;
-   professionnel ;
-   chaleureux.

Personnages :

-   entrepreneurs ;
-   commerçants ;
-   artisans ;
-   agriculteurs ;
-   femmes et hommes ;
-   jeunes ;
-   coopératives.

Éviter les représentations stéréotypées.

------------------------------------------------------------------------

# 30. DESIGN POUR CONNECTIVITÉ LIMITÉE

Prévoir :

-   placeholders légers ;
-   compression ;
-   images adaptatives ;
-   faible quantité d'animations lourdes ;
-   cache ;
-   écrans utilisables avec réseau instable.

------------------------------------------------------------------------

# 31. MICROCOPY

Le langage doit être :

-   simple ;
-   direct ;
-   positif ;
-   précis.

Préférer :

> Votre paiement a été confirmé.

À :

> Transaction successfully processed.

Préférer :

> Votre document est illisible. Prenez une photo plus nette.

À :

> KYC failed.

------------------------------------------------------------------------

# 32. ERREURS

Toute erreur doit répondre à trois questions :

1.  Que s'est-il passé ?
2.  Pourquoi ?
3.  Que faire maintenant ?

Exemple :

> Votre document n'a pas pu être vérifié.
>
> La photo est trop sombre.
>
> Prenez une nouvelle photo dans un endroit bien éclairé.
>
> \[ Réessayer \]

------------------------------------------------------------------------

# 33. DESIGN SYSTEM COMPONENTS

Créer au minimum :

-   AppBar ;
-   BottomNavigation ;
-   Button ;
-   IconButton ;
-   TextField ;
-   SearchField ;
-   Dropdown ;
-   Checkbox ;
-   Radio ;
-   Switch ;
-   Card ;
-   Badge ;
-   Avatar ;
-   Modal ;
-   BottomSheet ;
-   Toast/Snackbar ;
-   Dialog ;
-   Tabs ;
-   Progress ;
-   Skeleton ;
-   EmptyState ;
-   ErrorState ;
-   SuccessState ;
-   AI Assistant ;
-   MoneyDisplay ;
-   TransactionItem ;
-   Timeline ;
-   KPI Card ;
-   ProductCard ;
-   TontineCard.

------------------------------------------------------------------------

# 34. DESIGN TOKENS ET CODE

Créer un seul système source de vérité.

Exemple :

``` text
/design-system
  /tokens
    colors
    typography
    spacing
    radius
    shadows
  /components
  /icons
  /illustrations
  /themes
```

Les composants ne doivent pas contenir de valeurs arbitraires.

------------------------------------------------------------------------

# 35. TEST VISUEL

Tester :

-   petit Android ;
-   écran standard ;
-   grand écran ;
-   tablette ;
-   dark mode ;
-   texte agrandi ;
-   connexion lente ;
-   erreurs ;
-   champs longs ;
-   montants élevés.

------------------------------------------------------------------------

# 36. OBJECTIF DESIGN FINAL

Lorsque l'utilisateur ouvre KESSIA, il doit ressentir :

**Confiance.**

Puis :

**Simplicité.**

Puis :

**Possibilité de croissance.**

KESSIA doit être perçue comme une application africaine de niveau
international, et non comme une copie d'une fintech existante.
