# ADR 0020 — i18n : parcours d'authentification + coquille (§38)

**Statut :** accepté · **Date :** 2026-08-30

## Contexte
§38 restait « Partiel » : l'infrastructure i18n existait (`lib/i18n`, `useT()`,
fallback FR, formatage `Intl` piloté par la locale) mais **`useT()` n'était
câblé qu'à un seul endroit** — `BottomNav`. Tout le reste de l'application
portait du texte français en dur. Un nouvel utilisateur ne pouvait même pas
choisir sa langue avant de s'inscrire (le sélecteur n'existait que dans le
profil).

La traduction complète des ~40 écrans est un chantier volumineux. Cette
itération traite un **périmètre cohérent et à fort trafic** : le parcours
pré-connexion et la coquille de navigation.

## Décisions

### 1. Fondations i18n renforcées
- `t()` accepte désormais l'**interpolation** `{var}` :
  `t('auth.verifyOtp.resendIn', { s: 42 })`. Signature rétro-compatible :
  `t(key)`, `t(key, 'texte de repli')`, `t(key, { vars })`,
  `t(key, { vars }, 'repli')`.
- `resolve()` ne renvoie que des chaînes (les nœuds intermédiaires ne peuvent
  plus « fuiter »).
- `ee` (Éwé) est **branché** dans `CATALOGS` (auparavant `{}`).
- `<html lang>` suit la locale (effet client, inchangé).

### 2. Catalogues (`lib/i18n/messages/`)
- `fr.ts` = **source de vérité**, réorganisée par écran :
  `nav`, `common`, `errors`, `auth.{login,register,verifyOtp,onboarding}`,
  `home`, `wallet`, `profile`.
- `en.ts` = **traduction complète** du périmètre ci-dessus.
- `ee.ts` = **NOUVEAU, partiel et provisoire** : `nav` + `common` de base
  uniquement, en-tête d'avertissement explicite, `LOCALE_META.ee.ready`
  reste `false`. Tout le reste retombe sur le Français. **La traduction Éwé
  du vocabulaire financier / juridique / KYC doit être réalisée et relue par
  un·e locuteur·rice natif·ve** avant d'être présentée comme finalisée.
- Test `catalogs.test.ts` (3) : aucune clé de `en`/`ee` absente de `fr` ;
  `en` couvre tout `auth.*` ; aucune valeur vide.

### 3. Écrans câblés (`useT()`)
- `app/(auth)/login/page.tsx`, `register/page.tsx`, `verify-otp/page.tsx`,
  `onboarding/onboarding-client.tsx` — **100 % des chaînes**.
- `components/layout/Sidebar.tsx` (BottomNav l'était déjà).
- Les libellés contenant un lien (`J'accepte les {link}`) sont rendus via un
  helper `withLink()` qui coupe la chaîne autour de `{link}`.

### 4. Sélecteur de langue hors connexion
- `components/i18n/LanguageSwitcher.tsx` — `<select>` compact, discret,
  accessible. Placé sur les 3 pages d'auth + l'onboarding. Ne persiste que le
  choix local (`useLocaleStore`), suffisant avant connexion ; le profil
  continue de synchroniser `language` côté serveur pour fr/en.

## Conséquences
- ✅ Le parcours pré-connexion (onboarding → inscription → OTP → connexion) et
  la navigation sont **entièrement disponibles en anglais**. Éwé : navigation
  + actions de base, reste en français, marqué « partielle » dans le sélecteur.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**109**, +3) + `build` +
  `playwright` (36) au vert. E2E inchangés : la locale par défaut reste `fr`,
  les assertions FR passent.
- ⏭️ **Reste à traduire** (mécanique, même méthode) : landing (`app/page.tsx`),
  puis les écrans du tableau de bord — home, wallet, tontines, business, KYC,
  profil, support, trust, growth, simulator, admin. Chaque écran = passer ses
  chaînes dans `fr.ts` + `en.ts` et câbler `useT()`. Puis relecture native de
  l'Éwé.
