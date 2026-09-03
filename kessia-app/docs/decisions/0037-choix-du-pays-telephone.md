# ADR 0037 — Choix du pays à la saisie du numéro de téléphone

**Statut :** accepté · **Date :** 2026-09-03

## Contexte

L'inscription et la connexion imposaient l'indicatif **`+228` (Togo)** en
dur : un préfixe statique `🇹🇬 +228` devant le champ, et le client
préfixait `+228` au numéro saisi. Impossible pour un membre de la
**diaspora** ou d'un autre pays **UEMOA** de créer un compte ou de se
connecter avec son numéro réel.

Le back-end, lui, était déjà prêt : `phoneSchema` (Zod) accepte tout
numéro `+…` de 8 à 20 caractères et `normalizePhone()` conserve un
numéro déjà en `+indicatif…`. Seul le front-end bloquait.

## Décision

### Liste de pays — `lib/constants/countries.ts`
- **16 pays d'Afrique de l'Ouest** : les 15 États de la CEDEAO + la
  Mauritanie. Ordre d'affichage : **UEMOA d'abord** (Togo par défaut),
  puis les autres États CEDEAO, puis la Mauritanie.
  _(Révisé le 2026-09-03 : la liste initiale incluait l'Afrique centrale
  et la diaspora — retirées, périmètre recentré sur l'Afrique de l'Ouest.)_
- Par pays : `iso` (ISO 3166-1 alpha-2), `name` (FR), `dial`, `flag`,
  `example`, `min`/`max` (longueur nationale — validation **indicative**
  côté client ; la validation qui fait foi reste le serveur).
- Helpers : `findCountry` (repli Togo), `toE164(iso, national)`
  (compose `+indicatif` + chiffres, retire le `0` initial),
  `isNationalLengthPlausible`, `readStoredCountryIso` / `storeCountryIso`
  (mémorise le dernier pays choisi dans `localStorage`, SSR-safe).

### Composant — `components/auth/CountryPhoneField.tsx`
- Contrôlé : le parent détient `{ iso, national }`.
- **Liste déroulante maison** (bouton `role="combobox"` + `ul role="listbox"`)
  accolée à l'`<input type="tel">` — un `<select>` natif **n'affiche pas les
  drapeaux emoji sous Windows** (rendu OS des `<option>`). Clavier
  (↑↓ / Début / Fin / Entrée / Échap / Tab), saisie au clavier (type-ahead),
  fermeture au clic extérieur, `aria-activedescendant`.
- **Drapeaux SVG réels** : `public/flags/<iso>.svg` (16 fichiers, ~8 Ko au
  total, source `flag-icons` 4×3, non versionné en dépendance) rendus en
  `<img>` — fonctionnent partout, y compris hors ligne (SW).
- Émet **deux champs cachés** pour la soumission classique du formulaire :
  `phone` = numéro **E.164**, `country` = code ISO.
- Libellé d'aide dynamique « Sénégal · +221 » ; bordure rouge non
  bloquante si la longueur nationale est hors fourchette. Thème clair/sombre.

### Câblage
- `/register` et `/login` (mots de passe **et** OTP) : état
  `phone = { iso: readStoredCountryIso(), national: '' }`, le handler
  compose `toE164(...)` au lieu de préfixer `+228`.
- Les puces « comptes de démo » forcent `iso: 'TG'` (comptes togolais).
- **`registerSchema`** : `country` optionnel (`/^[A-Z]{2}$/`).
  `POST /auth/register` le passe à `UserProfile.country` (le champ existait
  déjà, défaut `"TG"`).
- i18n : `auth.{login,register}.countryLabel`, `auth.register.phoneError`
  (FR + EN).

## Conséquences
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**153**, +6 : `countries.test.ts`)
  + `build` + E2E auth (5/5) au vert.
- ✅ Un membre d'un autre pays d'Afrique de l'Ouest s'inscrit / se connecte
  avec son vrai numéro ; le pays est mémorisé d'une session à l'autre et
  enregistré au profil.
- ✅ Drapeaux **SVG réels** dans le sélecteur (le `<select>` natif rendait
  « TG », « SN »… sous Windows) — d'où la liste déroulante maison.
- La validation fine par pays reste indicative ; pas d'intégration
  `libphonenumber` (poids). Le serveur valide le format générique.
