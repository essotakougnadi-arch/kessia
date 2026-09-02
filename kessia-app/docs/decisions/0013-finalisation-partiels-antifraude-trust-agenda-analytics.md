# ADR 0013 — Finalisation des partiels : anti-fraude, Trust Center, plafonds KYC, agenda, analytics, canaux de notification, voix, ops

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
Après les ADR 0010–0012, il restait 24 sections « partielles » et 2 « à
construire » (§32 anti-fraude, §48 backups). Cet ADR pousse chacune aussi
loin que le code le permet et **documente précisément ce qui reste un
verrou externe** (licence BCEAO, contrats opérateurs, prestataire IDV,
infrastructure de production, traduction).

## Décisions

### §32 — Anti-fraude (nouveau)
- `lib/fraud/rules.ts` (**pur, testé**) : score de risque 0–100 à partir de
  signaux mesurés — nouvel appareil, vélocité de transferts (10 min),
  fan-out (destinataires distincts / 24 h), montant anormal vs historique
  30 j, quasi-vidage du solde, compte dormant, compte très récent + gros
  montant, burst d'échecs de connexion.
- `lib/fraud/devices.ts` : `Device` par compte, empreinte **prudente**
  (en-têtes HTTP hachés — pas de fingerprinting invasif). Premier appareil
  d'un compte = « de confiance ».
- `lib/fraud/engine.ts` : rassemble les signaux, crée une `FraudAlert`
  (`OPEN`) si score ≥ 30, notifie l'utilisateur en `SECURITY` si risque
  `HIGH`/`CRITICAL`, audite. **Aucun blocage automatique de fonds** — un
  humain (`COMPLIANCE`) tranche via `/admin/fraud` (`GET`/`PATCH
  /api/v1/admin/fraud[/id]`). Câblé (non bloquant) sur `auth/login`,
  `wallet/transfer`, `payments` (OUTBOUND).

### §30 — Plafonds KYC + screening
- `lib/kyc/limits.ts` (**testé**) : plafonds **par opération** et **mensuel
  sortant** selon le palier (0 non vérifié / 1 / 2). `checkOutboundLimit()`
  appliqué **côté serveur** dans `wallet/transfer` et `payments` (OUTBOUND).
- `lib/kyc/screening.ts` : **stub local** de screening sanctions/PPE — pose
  un drapeau pour la revue humaine, ne bloque rien. Le screening habilité
  reste un bloquant pilote (matrice de conformité).

### §21 — Trust Center (nouveau)
- `lib/fees.ts` : grille tarifaire, **source unique** (aussi utilisée par
  KESSIA AI).
- `GET /api/v1/trust` + écran `/trust` : tarifs, plafonds KYC + consommation
  du mois, état sécurité (2FA, sessions), état des données (export /
  suppression), Fonds de Garantie (démonstration), **mentions
  réglementaires** centralisées. Entrée dans le menu Profil.

### §26 — Agenda (nouveau)
- `lib/calendar/aggregate.ts` : agrège cotisations de tontine, factures à
  encaisser, échéances du plan de croissance et relances clients sur
  [-14 j, +60 j], retards signalés. `GET /api/v1/calendar` + écran
  `/calendar` (groupé par jour, filtres par type).

### §28 — Data & Analytics + §17 Admin Copilot (nouveau)
- `lib/analytics/platform.ts` : KPI **agrégés** (aucun nominatif) — membres,
  wallet, tontines (dont taux de cotisation à temps), business, risque,
  croissance + série 30 j (inscriptions, volume).
- `lib/admin/copilot.ts` : « priorités du jour » à base de règles (KYC en
  revue > 48 h, tickets urgents, demandes garantie, alertes fraude,
  cotisations en retard, comptes suspendus).
- `GET /api/v1/admin/analytics` → les deux. Écran `/admin/analytics` +
  bloc « Priorités du jour » sur `/admin/dashboard`.

### §33 — Canaux de notification
- `lib/notifications/channels.ts` : abstraction multi-canal (analogue à
  `PaymentProvider`). `IN_APP` réel ; `PUSH` / `SMS` / `EMAIL` en
  **simulation** tant qu'aucun fournisseur (`*_PROVIDER_KEY`,
  `NOTIFY_WEBHOOK_URL`) n'est configuré. Chaque tentative journalisée
  (`NotificationDelivery`). `notify()` distribue selon la priorité
  (`CRITICAL` → in-app + push + SMS ; `HIGH` → + push).

### §34 — Voix : commandes de navigation
- `lib/voice/commands.ts` (**pur, testé**) : `matchVoiceCommand()` reconnaît
  une intention de navigation (« va au wallet », « ouvre mon agenda »…).
  Intégré à la dictée de KESSIA AI : une commande ouvre l'écran, sinon la
  phrase est traitée comme une question.

### §47 — Observabilité
- `GET /api/metrics` : métriques format Prometheus, **protégées par
  `METRICS_TOKEN`** (pas d'exposition publique sans jeton).

### §41, §48, §50, §31 — Documentation & scripts d'exploitation
- `docs/database/schema.md`, `docs/security/overview.md`,
  `docs/operations/backup-recovery.md` (runbook sauvegarde / restauration /
  RPO-RTO / test trimestriel / réponse à incident / secrets).
- `scripts/db-backup.mjs` (`pg_dump` format custom) + `npm run db:backup`.
- `scripts/smoke.mjs` + `npm run smoke` : santé → login → wallet → tontines.
- `.github/workflows/staging.yml` : squelette déploiement staging + smoke,
  ignoré proprement tant que les secrets ne sont pas définis.

## Ce qui reste un verrou externe (documenté, non codable)

| § | Verrou |
|---|---|
| 5 | App mobile Flutter, Open API — Phase 8 |
| 6.5 | Fonds de Garantie : qualification juridique + partenaire habilité |
| 30 | IDV liveness + screening sanctions/PPE habilité |
| 31, 47 | APM/alertes, gestionnaire de secrets — infrastructure |
| 33 | Fournisseurs push/SMS/email réels (abstraction prête) |
| 38 | Traduction EN/Ewe des écrans (infra + FR prêts) — grind Phase 7 |
| 39 | Redis (rate-limit distribué), Docker/K8s — déploiement |
| 48 | Rétention 30 j + copie hors-hébergeur + test DR consigné |
| 49, 50 | Base de test dédiée, staging/production, tests d'intégration |
| 59, 60 | Validation juridique, entité exploitante, intégrations paiement réelles |

## Conséquences
- ✅ §21, §26, §28 conformes ; §32 construit (moteur de règles + revue
  humaine) ; §30 renforcé (plafonds serveur) ; §17, §33, §34, §45, §47
  nettement avancés ; §41/§48/§50 outillés et documentés.
- ✅ Règles MASTER respectées : aucun blocage automatique de fonds, aucun
  screening qui décide seul, aucune donnée nominative dans les analytics,
  canaux réels honnêtement marqués « simulation ».
- ⏭️ Les partiels restants sont des dépendances externes explicitées
  ci-dessus et dans `docs/compliance/matrix.md`.
