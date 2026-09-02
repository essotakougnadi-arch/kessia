# ADR 0033 — KPI §54, anti-fraude comportemental, couverture voix (§28/§32/§34)

**Statut :** accepté · **Date :** 2026-09-01

## Contexte
Fin de la liste des travaux de dev sous notre contrôle (feuille de route de
clôture) : p0-8 (KPI finance/IA), p2-5 partiel (anti-fraude comportementale +
miniatures des pièces jointes), p0-10 (couverture voix).

## Décision

### p0-8 — KPI plus fins dans `/admin/analytics` (§54)
`lib/analytics/platform.ts` gagne trois axes, tous en agrégats non nominatifs :

- **Finance / revenu KESSIA** : `feesEarned30d` + `feesEarnedTotal` (Σ écritures
  `FEE` — le vrai revenu), `netInflow30d` (dépôts − retraits), `withdrawalVolume`,
  `transferVolume`, `payoutVolume`, `avgUserBalance`, `expenseVolume` (business).
- **Activation & assiduité** : `activated` / `activatedRate` (a fait ≥ 1 dépôt /
  tontine / business), `active7d` / `active30d` (via `lastLoginAt`), `stickiness`
  (7 j / 30 j). **Entonnoir KYC** : répartition par statut, rendue en barre
  empilée.
- **Assistant KESSIA AI** : `conversations30d`, `messages30d`, `usersEngaged30d`,
  répartition par contexte, et **`answerMix`** — part des réponses issues des
  données réelles / de la KB / du repli générique. Pour l'alimenter,
  `POST /api/v1/ai/chat` marque désormais chaque réponse assistant d'un
  `metadata.source` (`data` | `kb` | `fallback`).

`/admin/analytics` : nouvelles grilles Finance et Assistant, Membres enrichie,
deux barres empilées (`MixBar`). Catalogue `admin.analytics.*` (~25 clés) FR + EN.

### p2-5 partiel — anti-fraude comportemental (§32)
`lib/fraud/rules.ts` — 5 signaux comportementaux (dans le temps) ajoutés au
moteur pur, sans changer le principe (score → file de revue humaine, **aucun
blocage automatique**) :

- `pass_through` — fonds reçus puis renvoyés ~à l'identique dans l'heure (layering)
- `structuring` — plusieurs transferts frôlant le plafond KYC en 24 h (smurfing)
- `new_recipient_high_value` — 1ᵉʳ envoi vers un bénéficiaire + montant élevé
- `velocity_accel` — rythme très supérieur à la moyenne quotidienne du compte
- `odd_hour` — opération importante en pleine nuit (1 h–5 h)

`lib/fraud/engine.ts` calcule les nouveaux signaux (fenêtres 1 h, moyenne 30 j,
1ᵉʳ transfert vers le destinataire via `metadata.recipientUserId`) et, surtout,
**déduplique** : si une alerte est déjà ouverte pour ce compte + contexte dans
l'heure, elle est **enrichie** (score max, signaux fusionnés) plutôt que
dupliquée — la file de revue reste lisible. La notification `SECURITY` n'est
envoyée qu'en cas d'escalade réelle.

### p2-5 partiel — miniatures des pièces jointes (§46)
`TicketAttachment += thumbnail String?`. `prepareAttachment` (client, canvas)
produit en plus une miniature JPEG ~180 px (≤ 60 ko) ; `sanitizeThumbnail`
(serveur, PUR, testé) valide le data-URI ; `TicketAttachments` affiche une
vignette 40 px cliquable (`loading="lazy"`) au lieu d'une icône. L'original reste
servi tel quel. Pas de bibliothèque image serveur, pas de navigateur.

### p0-10 — couverture voix (§34)
`lib/voice/commands.ts` : +7 destinations (`recevoir`, `créer une tontine`, Fonds
de Garantie, KESSIA AI, préférences de notification, confidentialité…), **mots-clés
anglais** sur chaque route + déclencheurs EN (`go to`, `open`, `show me`…), et une
intention **retour arrière** (`href: 'back'` → `router.back()`).

## p0-9 — thème sombre de la landing : non fait, par choix
`app/page.module.css` (568 lignes) est un design **mono-thème clair assumé**, comme
beaucoup de pages marketing. Le rétrofit theme-aware de ~40 couleurs codées en dur
sur la page de première impression, sans revue visuelle possible des deux thèmes,
présente plus de risque de régression que de valeur. Laissé tel quel, documenté.

## Conséquences
- ✅ Le back-office répond à « combien KESSIA gagne-t-il ? », « combien de comptes
  sont réellement actifs ? », « l'assistant répond-il avec des faits ou du
  générique ? ».
- ✅ Détection de fraude nettement plus riche (layering / smurfing / social
  engineering / accélération) sans un seul blocage automatique de fonds ; file de
  revue dédupliquée.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**135**, +11) + `build` au vert.
- ⏭️ Non fait, hors de notre contrôle : antivirus des pièces jointes (scanner
  externe), et tout le palier 1 (juridique / contrats / infra).
