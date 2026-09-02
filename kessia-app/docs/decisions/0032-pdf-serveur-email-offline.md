# ADR 0032 — PDF serveur, e-mail transactionnel, cache offline avancé (§7, §35, §51)

**Statut :** accepté · **Date :** 2026-09-01

## Contexte
Trois actions de la feuille de route de clôture, regroupées car elles se
recouvrent (documents + réseau) :
- **p0-5** — génération PDF côté serveur des devis/factures/reçus (l'impression
  navigateur était le seul moyen) + envoi par e-mail.
- **p0-6** — cache applicatif offline « avancé » (le service worker était
  volontairement minimal).
- **p0-7** — états empty/offline manquants (§51 DoD).

## Décision

### PDF serveur — `lib/pdf/mini-pdf.ts` (aucune dépendance)
Générateur PDF minimal maison : page A4, polices standard **Helvetica /
Helvetica-Bold non intégrées** (tables de largeurs WinAnsi embarquées pour le
retour à la ligne), primitives `text` / `keyValue` / `tableRow` / `hr`,
pagination automatique. **Ni navigateur headless, ni police à charger, ni
dépendance** — fonctionne à l'identique en dev, `next build` et serverless.
- `lib/business/invoice-pdf.ts` — `loadInvoiceDoc()` (chargement partagé) +
  `renderInvoicePdf()`.
- `lib/wallet/receipt-pdf.ts` — `loadReceiptDoc()` + `renderReceiptPdf()`.
- `GET /api/v1/business/[id]/invoices/[invoiceId]/pdf` et
  `GET /api/v1/wallet/transactions/[id]/pdf` → `application/pdf` en flux.
- **`withAuth` accepte le cookie `kessia-access-token` UNIQUEMENT sur les GET** —
  permet la navigation directe du navigateur vers un PDF ; aucune surface CSRF
  (toute écriture exige toujours l'en-tête Bearer).
- UI : lien « ⬇ PDF » sur les documents (`/documents/*`) et la ligne de facture.

### E-mail transactionnel — `lib/email/email.ts`
Abstraction analogue aux canaux de notification : `sendEmail({ to, subject,
text, attachments })` → **Resend** si `RESEND_API_KEY` (déjà en dépendance),
sinon **SIMULATION** (log serveur, journalisée, aucun mail réel). Ne lève jamais.
- `POST /api/v1/business/[id]/invoices/[invoiceId]/email` — génère le PDF,
  l'attache, envoie (ou simule), audite `business.invoice_emailed` (domaine
  destinataire seulement, jamais l'adresse complète), `enforceRateLimit`
  10 / 10 min. Répond `{ sent, simulated, to }`.
- `.env.example` : `RESEND_API_KEY`, `EMAIL_FROM`.

### Offline — `hooks/useOnline.ts` + `components/ui/OfflineBanner.tsx` (§51)
- `useOnline()` (`useSyncExternalStore` sur `online`/`offline`).
- `<OfflineBanner>` : bandeau fixe discret quand le navigateur perd le réseau,
  monté dans `(dashboard)/layout.tsx` et `AdminGuard`. `role="status"`.
- `ErrorNote` devient **offline-aware** : message « Vous êtes hors ligne » +
  icône 📡 quand `!navigator.onLine`, et est passé à l'i18n (`common.*`).
- **Audit des écrans** : l'espace membre gère déjà bien loading / empty / error
  (skeletons, `ErrorNote` + retry, empty distinguant « aucune donnée » de
  « aucun résultat pour ce filtre »). Le vrai manque était le **signal
  offline global**, désormais comblé.

### Service worker `kessia-v2` (§5, §35)
- **Navigations** : réseau d'abord avec **timeout 3,5 s** → coquille de la MÊME
  route en cache → `/offline`. Les navigations réussies sont mises en cache
  (`NAV`, plafonné à 16 entrées).
- **Coquilles pré-cachées** à l'installation : `/home`, `/wallet`, `/tontine`,
  `/business`, `/profile`, `/login` — une 1ʳᵉ visite hors ligne atterrit sur un
  écran réel (squelettes + bandeau hors ligne) plutôt que sur un cul-de-sac.
- **`/api/**` : réseau uniquement, jamais de cache, jamais de repli** — inchangé.
  Le client gère l'échec (bandeau + `ErrorNote`) et SWR re-valide au retour.
- `/offline` : bouton « Réessayer » réel (`location.reload()`) + rechargement
  automatique sur l'événement `online`.
- **Aucune donnée financière n'est mise en cache** : seules les coquilles
  (layout + îlots clients + squelettes) le sont.

## Conséquences
- ✅ Devis / factures / reçus téléchargeables en PDF et **envoyables par e-mail**
  (simulé tant qu'aucun fournisseur n'est branché — même patron que push/SMS).
- ✅ L'utilisateur sait quand il est hors ligne ; les pages déjà visitées restent
  atteignables ; rien de critique n'est mis en cache.
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**124**, +5 `mini-pdf.test.ts`) +
  `build` au vert. Vérifié en direct : PDF facture (3,4 ko) + reçu (2,3 ko)
  `%PDF-1.4…%%EOF`, e-mail `{ sent:true, simulated:true }`.
- ⏭️ Non fait : file d'attente offline des mutations — **volontairement exclu**
  (règle MASTER : « opérations critiques = confirmation serveur »).
