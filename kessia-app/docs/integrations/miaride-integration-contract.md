# Contrat d'intégration KESSIA ↔ MiaRide — état réel et besoins

**Statut : aucun partenariat MiaRide réel n'existe aujourd'hui.** Ce document ne décrit aucune API MiaRide réelle — MiaRide n'a jamais fourni de documentation d'API à ce dépôt. Il distingue strictement :
- **Ce qui existe déjà dans le code KESSIA** (vérifié par lecture + tests, références `fichier:ligne`) ;
- **Ce qu'il faudrait obtenir de MiaRide** pour remplacer la simulation par une intégration réelle — présenté comme une liste de questions/exigences à faire confirmer par MiaRide, jamais comme un endpoint ou un format déjà convenu.

Ce document répond à l'instruction explicite de ne jamais présenter le mode simulé comme une intégration réelle, et de ne jamais inventer d'API.

---

## 1. Ce qui existe réellement côté KESSIA aujourd'hui

### 1.1 Côté sortant (KESSIA → MiaRide) : **aucun appel réseau réel**

| Mode | Fichier | Comportement réel |
|---|---|---|
| `SIMULATED` | `lib/delivery/miaride.ts:49-57` (`createSimulated`) | Génère une référence fictive (`MIA-XXXXXX`, aléatoire locale), un nom de coursier tiré d'une liste statique, une URL de suivi construite localement. **Zéro requête HTTP sortante.** |
| `HANDOFF` | `lib/delivery/miaride.ts:68-83` (`buildHandoffLink`) | Construit un lien `wa.me`/web pré-rempli (texte du bon de livraison) et le renvoie à l'acheteur, qui doit lui-même ouvrir ce lien et commander un coursier. **KESSIA n'appelle aucune API MiaRide — c'est un humain qui agit, pas un système.** |
| `requestDelivery()` | `lib/delivery/index.ts:89-247` | Orchestration complète (frais, séquestre, notifications) mais appelle uniquement les deux fonctions ci-dessus — jamais de `fetch`/appel réseau vers un domaine MiaRide. |

Confirmé par recherche exhaustive dans le dépôt : aucune URL de domaine MiaRide (hors les deux variables d'environnement `MIARIDE_DISPATCH_URL`/`MIARIDE_TRACKING_BASE`, qui sont des gabarits d'URL de confort, jamais appelées programmatiquement par KESSIA — elles sont données au navigateur de l'utilisateur), aucune clé d'API MiaRide, aucun client HTTP dédié.

### 1.2 Côté entrant (MiaRide → KESSIA) : **un récepteur existe, mais rien de réel ne l'appelle**

`POST /api/v1/marketplace/deliveries/webhooks/miaride` (`app/api/v1/marketplace/deliveries/webhooks/miaride/route.ts`) est un webhook entrant **construit et testé**, mais **jamais appelé par un vrai MiaRide** puisqu'aucun partenariat n'existe. Ce qu'il fait réellement :

- **Signature attendue** (anticipée côté KESSIA, jamais confirmée par MiaRide) : en-tête `x-miaride-signature` au format `t=<unix_seconds>,v1=<HMAC-SHA256 hex de "${t}.${corpsBrut}">`, secret `MIARIDE_WEBHOOK_SECRET` (`lib/webhooks/verify.ts:1-98`). **Fail-closed en production** si le secret est absent — aucun événement n'est accepté sans vérification tant qu'aucun secret réel n'est configuré.
- **Schéma d'événement attendu** (anticipé, pas confirmé) : `{ event: 'delivery.status', reference: string, status: string, courierName?: string }` (`route.ts:42-47`), avec une table de correspondance `status → DeliveryStatus` codée en dur (`assigned/accepted/picked_up/collected/in_transit/on_the_way/delivered/completed/cancelled/canceled`).
- **Idempotence** : `WebhookEvent.eventKey = "miaride:<reference>:<statut mappé>"`, rejeu exact ignoré proprement (`route.ts:81-90`).
- **`reference`** doit correspondre à `MarketplaceDelivery.providerRef` existant (`route.ts:92-95`) — pas au nouveau `kessiaTrackingCode`.

**Point important** : ce format de signature et ce schéma d'événement sont une **conception anticipative côté KESSIA** (cf. ADR 0042 : « Pas d'API ni de partenariat Miaride à ce stade. On applique donc le patron maison… adaptateur simulé, honnête, prêt à recevoir le vrai le jour venu »). Rien ne garantit que MiaRide, le jour d'un vrai partenariat, utilisera ce format — il devra être validé ou adapté contre leur documentation réelle.

### 1.3 Ce que KESSIA a ajouté ce tour (Phase 6, commit `941e970`)

- `kessiaTrackingCode` (`KSA-XXXXXXXX`) : généré par KESSIA, **jamais transmis à aucun système MiaRide** — c'est un identifiant interne affiché à l'acheteur/au vendeur, distinct de `providerRef` (qui reste la référence MiaRide existante, inchangée).
- `labelPhotoUrl`/`labelPhotoUploadedAt`/`labelPhotoUploadedById` : photo transmise **par le vendeur à l'acheteur, à l'intérieur de l'app KESSIA**. MiaRide ne reçoit ni ne fournit cette photo — l'agent MiaRide colle l'étiquette physiquement sur le terrain, mais aucune donnée ne circule entre KESSIA et MiaRide à cette étape.

---

## 2. Ce qu'il faudrait obtenir de MiaRide (à faire confirmer — rien ici n'est acquis)

Pour remplacer la simulation par une intégration réelle, les questions suivantes devront être posées à MiaRide et répondues par **leur** documentation, pas par ce dépôt :

1. **Existence et accès à une API partenaire** : MiaRide propose-t-il une API B2B pour les marketplaces, ou seulement une appli grand public ? Sous quel compte/contrat commercial ?
2. **Authentification sortante** : clé API statique, OAuth2, identifiants de compte marchand ? Aucun mécanisme n'existe aujourd'hui côté KESSIA pour s'authentifier auprès de MiaRide — à construire entièrement une fois connu.
3. **Création de livraison** : existe-t-il un endpoint pour soumettre un enlèvement + une livraison (adresse, destinataire, valeur du colis) et recevoir une référence de suivi *leur* système ? C'est ce qui remplacerait `MiarideProvider.createSimulated()`.
4. **Devis réel** : MiaRide expose-t-il un calcul de tarif réel, ou le tarif reste-t-il la responsabilité de KESSIA (`estimateFee()`, actuellement une estimation locale par anneaux de quartier, **jamais un prix ferme MiaRide**) ?
5. **Événements de statut réels** : quels événements MiaRide envoie-t-il réellement (noms, charge utile, ordre), et selon quel mécanisme (webhook sortant de leur côté, polling obligatoire, SDK) ? Le schéma `delivery.status` ci-dessus (§1.2) est une hypothèse KESSIA, pas une confirmation.
6. **Signature/sécurité des webhooks réels** : MiaRide signe-t-il ses webhooks, selon quel schéma (HMAC ? autre ?) ? Le format `t=…,v1=…` actuel devra être adapté au schéma réel de MiaRide, qui peut différer entièrement.
7. **Preuve de livraison réelle** : MiaRide fournit-il une preuve (signature destinataire, photo de remise, code OTP livreur) au-delà du simple changement de statut ? Aujourd'hui, la preuve de livraison dans KESSIA est **la confirmation de réception par l'acheteur lui-même dans l'app** (`confirmDelivered()`, `lib/delivery/index.ts:458-470`), jamais une preuve émanant de MiaRide.
8. **Gestion des erreurs et SLA** : codes d'erreur, délais de réponse garantis, politique de retry, procédure en cas d'échec de livraison (colis perdu, destinataire absent) — rien de ceci n'est modélisé aujourd'hui au-delà du statut `CANCELLED` générique.
9. **Couverture géographique réelle** : les 23 quartiers du Grand Lomé (`lib/delivery/zones.ts:20-44`) sont une liste **KESSIA**, jamais confirmée contre la couverture réelle de MiaRide.
10. **Contrat commercial** : tarification de la prestation MiaRide elle-même (commission, forfait), responsabilité en cas de colis endommagé/perdu — hors périmètre technique, à traiter par le propriétaire du produit, pas par ce dépôt.

## 3. Bascule prévue (déjà actée dans ADR 0042, rappelée ici)

Le jour d'un vrai partenariat MiaRide confirmé avec réponses aux points ci-dessus :
1. Remplacer l'intérieur de `MiarideProvider.quote()`/`createSimulated()` (`lib/delivery/miaride.ts`) par de vrais appels à l'API MiaRide — passer `simulated = false`.
2. Configurer `MIARIDE_WEBHOOK_SECRET` avec le secret réel négocié avec MiaRide (adapter le format de signature si MiaRide n'utilise pas le schéma `t=…,v1=…`).
3. Adapter `eventSchema`/`EXTERNAL_STATUS` dans `app/api/v1/marketplace/deliveries/webhooks/miaride/route.ts` au format réel des événements MiaRide, s'il diffère de l'hypothèse actuelle.
4. Aucun changement de schéma de données ni d'UI n'est anticipé comme nécessaire (machine à états `DeliveryStatus`, séquestre, `kessiaTrackingCode`, photo d'étiquette restent valables tels quels).

## 4. Rappel produit

Tout affichage utilisateur du mode `SIMULATED` doit rester accompagné d'un indicateur explicite de simulation (bandeau « aperçu », cf. ADR 0042) — ne jamais présenter une livraison simulée comme un vrai suivi de coursier. Ceci est déjà en place côté UI au moment de la rédaction de ce document ; toute évolution future doit préserver cette distinction visible.
