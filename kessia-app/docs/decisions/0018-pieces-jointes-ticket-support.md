# ADR 0018 — Pièces jointes de ticket support (§46)

**Statut :** accepté · **Date :** 2026-08-29

## Contexte
§46 (Support) était « Conforme » à une réserve près, consignée depuis
plusieurs itérations : **pièces jointes à finaliser**. Un demandeur ne pouvait
pas joindre une capture d'écran ou un justificatif à son ticket, ni l'agent
en retour.

## Décision
Réutiliser l'infrastructure de stockage objet déjà en place (Supabase Storage,
ADR 0003 / 0014) plutôt que d'introduire un nouveau mécanisme.

### Modèle
- `TicketAttachment` : `ticketId`, `uploadedById`, `fileName`, `mimeType`,
  `size`, `storageKey?`, `dataUrl?`, `isInternal`, `createdAt`.
- `storageKey` renseigné si le bucket est configuré, sinon `dataUrl` (repli en
  base, comme les pièces KYC).
- `isInternal` : pièce jointe visible des agents seulement (miroir de
  `TicketMessage.isInternal`).

### Stockage — `lib/storage/ticket-storage.ts`
- Bucket **privé** `SUPABASE_TICKET_BUCKET` (défaut `ticket-attachments`),
  chemin `{ticketId}/{attachmentId}.{ext}`, URL signées 5 min.
- `describeAttachment(dataUrl)` — **pur, testé** (`ticket-storage.test.ts`, 5) :
  valide le format data-URI, le type MIME (images courantes + PDF) et la
  taille (≤ 5 Mo, calculée depuis la longueur base64).
- Limites : 5 Mo par fichier, 10 pièces jointes par ticket.

### API — `GET/POST/DELETE /api/v1/support/[id]/attachments`
- Accès : demandeur du ticket **ou** agent (assigné / rôle `ADMIN` /
  `SUPER_ADMIN` / `SUPPORT`). Les pièces internes ne sont jamais renvoyées au
  demandeur.
- `POST` : rate-limité (15 / 10 min), refusé si ticket `CLOSED`, seul un agent
  peut marquer `isInternal`. Une pièce ajoutée par le demandeur d'un ticket
  `WAITING` le fait repasser `IN_PROGRESS` (comme une réponse). Audit
  `support.attachment_added` (jamais le contenu du fichier).
- `DELETE ?attachmentId=` : l'auteur retire sa pièce ; un agent retire
  n'importe laquelle. Audit `support.attachment_removed`. Nettoyage best-effort
  du bucket.
- `GET` renvoie pour chaque pièce une `url` (signée si bucket, sinon le
  data-URI) + `uploadedByMe`.

### Client
- `lib/files/attachment-file.ts::prepareAttachment(file)` : images
  redimensionnées / recompressées (canvas, ~1600 px, JPEG q .82), PDF transmis
  tel quel ; refuse tout autre type et > 5 Mo. La validation finale est refaite
  côté serveur.
- `components/support/TicketAttachments.tsx` : liste + bouton « 📎 Joindre un
  fichier » (+ case « Interne » côté agent). Monté dans le fil de discussion
  de `/support` **et** dans `/admin/support/[id]`.
- `hooks/useSupport.ts::useTicketAttachments(ticketId)` : `attachments`,
  `upload`, `remove`.

### Seed
Une pièce jointe de démonstration (PNG 1×1, repli data-URI) sur le ticket KYC
d'Adjoa. Étape de purge `ticketAttachment.deleteMany()` ajoutée.

## Conséquences
- ✅ §46 complètement conforme (dernière réserve levée).
- ✅ `tsc` + `lint` (0 warning) + `vitest` (**106**, +5) + `build` +
  `playwright` (**36**, +3) au vert. Reseed OK.
- Dégrade proprement sans Supabase Storage (data-URI en base), comme le KYC.
- ⏭️ Possible plus tard : miniatures d'aperçu inline, antivirus sur upload,
  nettoyage du bucket à la suppression RGPD (même chantier que les pièces KYC).
