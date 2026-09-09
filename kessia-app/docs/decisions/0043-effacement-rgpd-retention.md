# ADR 0043 — Effacement RGPD encadré + purge de rétention automatique

**Statut :** accepté · **Date :** 2026-09-09

## Contexte

Deux trous de conformité restaient ouverts dans la matrice
(`docs/compliance/matrix.md`) :

1. **Droit à l'effacement (RGPD art. 17)** — `POST /profile/privacy
   {action:'delete-request'}` enregistrait la *demande* mais aucune
   procédure ne l'exécutait. Le nettoyage du bucket KYC à la
   suppression d'un compte figurait explicitement dans la synthèse des
   bloquants (§6).
2. **Durées de conservation (art. 5-1-e)** — le §9 de la matrice
   listait des durées « proposées » sans aucune purge branchée. OTP,
   sessions expirées, notifications lues et vieux journaux d'audit
   s'accumulaient indéfiniment.

L'effacement d'un compte **ne peut pas être un simple `DELETE`** :
obligations de conservation LCB-FT (dossier KYC), comptables (grand
livre 10 ans), valeur probante du journal d'audit (5 ans). Il faut
distinguer *purge*, *anonymisation* et *conservation*.

## Décision

### 1. Effacement d'un compte — `lib/privacy/erasure.ts`

`eraseUserData(userId)` : **encadré, manuel, déclenché par un rôle
conformité**, une fois la demande instruite.

| Catégorie | Traitement |
|---|---|
| **Purgé** | Pièces KYC (bucket Supabase + lignes `KycDocument`), conversations + messages IA, notifications, empreintes d'appareil (`Device`), état du plan de croissance, pièces jointes de ticket (bucket + lignes), contenu libre des messages support (`→ '[contenu effacé]'`), sujet des tickets, sessions, OTP, motifs de rejet KYC |
| **Anonymisé** | `User` (pierre tombale `Compte supprimé`, `phone = deleted:<id>` pour garder l'unicité, `email`/`passwordHash`/`twoFactorSecret`/`pinHash` → `null`, comptes désactivés) ; `UserProfile` (`avatar`/`bio`/`city`/`profession` → `null`) |
| **Conservé** | Grand livre / transactions, `audit_logs`, **dossier KYC** (`KycCase` sans les pièces — preuve LCB-FT), tickets (coquille anonymisée pour la traçabilité) |

Purge du stockage objet **avant** la transaction SQL, tolérante aux
erreurs (`.catch`). Puis une seule `prisma.$transaction([...])` pour
l'atomicité du reste.

**Point d'entrée** : `PATCH /api/v1/admin/users/[id] {action:'erase'}`
— `requireAdmin(request, COMPLIANCE_ROLES)`, exige `deletionRequestedAt`
posé (garde-fou : on n'efface pas un compte qui ne l'a pas demandé),
audit `admin.user_erased` avec le détail des volumes. Bouton dédié
« Effacer (RGPD) » dans `/admin/users`, visible uniquement sur les
comptes portant le badge « Suppression demandée ».

### 2. Purge de rétention — `lib/privacy/retention.ts`

`runRetentionPurge(now?)` applique `RETENTION_DAYS` :

| Donnée | Fenêtre | Note |
|---|---|---|
| OTP | 7 j après expiration | usage unique déjà, on purge la trace |
| Sessions | 1 j après expiration | expiration applicative 30 j |
| Notifications **lues** | 12 mois | les non lues ne sont **jamais** purgées |
| `audit_logs` | 5 ans | aligné sur la matrice §9 |

Chaque `deleteMany` est isolé (`.catch(() => 0)`) : une table en échec
ne bloque pas les autres. Retourne les compteurs.

**Déclenchement** :
- **Automatique** — ajouté au `Promise.all` du tick horaire
  (`/api/v1/cron/tontine-tick`), à côté de `runTontineTick`,
  `runCustomerReminders`, `runDeliveryTick`. Résultat inclus dans
  l'audit `cron.tontine_tick`.
- **Manuel** — `npm run privacy:purge` (`scripts/privacy-purge.ts`),
  pour planifier via cron externe si le tick applicatif n'est pas actif.

## Conséquences

- La matrice §2 (droit à l'effacement, durées de conservation,
  chiffrement au repos) et le bloquant §6 passent de 📋/🟡 « à faire »
  à 🟡 « fait, reste la validation juridique du délai / de la fenêtre
  de rétractation ».
- Les deux suites E2E qui flanchaient par accumulation de données sur
  la base de démo partagée bénéficieront aussi de la purge horaire en
  production ; l'isolation de la base de test reste traitée séparément
  (ADR 0044).
- `eraseUserData` est **irréversible** et hors transaction pour la
  partie stockage — documenté, réservé conformité, jamais exposé côté
  membre.

## Le jour où le délai légal est arrêté

Ajouter une fenêtre de rétractation (p. ex. « effacement possible
J+30 après la demande ») : un simple garde-fou de date dans la route
`erase`, la logique de `eraseUserData` ne bouge pas.

## Vérification

`tsc` + `lint` (0 warning) + `vitest` (**178**) + `build` OK.
`test/integration/privacy-erasure.itest.ts` (3 tests) : effacement
complet vérifié contre une vraie base (purge effective, anonymisation,
traçabilité conservée) ; purge de rétention (fenêtres respectées,
notification non lue épargnée). Script `npm run privacy:purge` exécuté.
