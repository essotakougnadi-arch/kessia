# ADR 0047 — Traduction éwé : le « chrome » de l'interface

**Statut :** accepté · **Date :** 2026-09-10

## Contexte

`lib/i18n/messages/ee.ts` ne contenait qu'un socle (nav + common, ~17
clés). Le français est la source de vérité et complet ; l'anglais est
quasi complet ; l'éwé (ee) était marginal. Toute clé absente de `ee`
retombe automatiquement sur le français (`lib/i18n`), donc l'app reste
utilisable — mais l'expérience « en éwé » n'existait quasiment pas.

## Décision

Étendre `ee.ts` au **chrome de l'interface uniquement** — le
vocabulaire à haute fréquence et à faible risque :

- `nav` (complété : accueil, wallet, tontines, business, asime, profil,
  explorer, support, notifications, déconnexion, KESSIA AI…) ;
- `common` (actions génériques : enregistrer, annuler, fermer,
  réessayer, suivant, retour, passer, tout voir) ;
- `freq` + `format.freq` (hebdomadaire / bimensuel / mensuel) ;
- un sous-ensemble d'`auth` (se connecter, créer un compte, onboarding) ;
- quelques libellés courts d'`home` et `pinLock`.

Orthographe normalisée sur le standard Eʋegbe (ɖ ƒ ŋ ɔ ɛ ʋ) — les
caractères erronés du socle initial (`ↄ` U+2184 au lieu de `ɔ` U+0254)
sont corrigés.

### Ce qui reste EN FRANÇAIS (fallback automatique)

Volontairement non traduit ici, car la précision compte trop et exige
un·e traducteur·rice natif·ve du domaine :

- tout le vocabulaire **financier** (soldes, cotisations, séquestre,
  frais, plafonds) ;
- le **juridique / KYC / conformité** (CGU, confidentialité, motifs de
  rejet, matrice de conservation) ;
- les **contrats de tontine**, la prose des simulateurs, du module
  Business, de l'assistant IA ;
- tout le **back-office**.

`LOCALE_META.ee.ready` **reste `false`** : le sélecteur de langue
affiche l'éwé avec le marqueur « en cours ».

## Conséquences

- L'ossature de l'app (menus, boutons, écrans d'accueil / connexion)
  s'affiche en éwé ; le fond métier reste en français tant qu'un·e
  professionnel·le ne l'a pas traduit et relu.
- `catalogs.test.ts` (toute clé ee/en doit exister en fr, pas de chaîne
  vide) reste vert : `ee` est un sous-ensemble strict de `fr`, ce qui
  est autorisé.
- Pour finaliser : compléter `ee.ts` module par module avec relecture
  native, puis passer `ready: true`.

## Élargissement (2026-09-10, « compléter module par module »)

`ee.ts` étendu au vocabulaire d'interface de l'espace membre — libellés
de sections, boutons, états, champs de formulaire courts — pour :
**accueil, wallet, tontines, support, profil, connexion**. Restent en
français (fallback) tant qu'un·e professionnel·le ne les a pas traités :
statuts KYC, prose juridique, mécanique financière détaillée (séquestre,
contrat, plafonds, calculs), messages d'erreur nuancés, réponses IA,
back-office. `ready` toujours `false`.

Prochain passage : business, academy, community, invest/insurance/loans,
calendrier — avec relecture native avant `ready: true`.

## Vérification

`vitest` (**182**) — `catalogs.test.ts` + `core.test.ts` verts (ee reste
un sous-ensemble strict de fr). `tsc` + `lint` + `build` OK.
