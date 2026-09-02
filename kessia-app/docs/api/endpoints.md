# API v1 — endpoints

Base : `/api/v1`. Auth : `Authorization: Bearer <accessToken>` sauf `/auth/*`.
Enveloppe de réponse : `{ success, data?, message?, error?, code?, details? }`.

## Auth
| Méthode | Route | Rôle | Note |
|---|---|---|---|
| POST | `/auth/register` | public | `{ phone, firstName, lastName, password, consentTerms, consentData, termsVersion? }` → OTP ; `termsVersion` (défaut `LEGAL_VERSION`) est horodaté sur le compte + tracé à l'audit |
| POST | `/auth/verify-otp` | public | `{ phone, code, purpose }` → user + tokens |
| POST | `/auth/login` | public | mot de passe → user + tokens ; lockout 5 essais |
| POST | `/auth/request-otp` | public | OTP par SMS |
| POST | `/auth/refresh` | public | `{ refreshToken }` → nouveaux tokens (rotation) |
| POST | `/auth/logout` | auth | révoque la session |
| GET / POST / DELETE | `/auth/2fa` | auth | MFA TOTP : `POST {step:'setup'}` → secret+URI · `POST {step:'enable',code}` → active + codes de secours · `DELETE {code}` → désactive |
| POST | `/auth/2fa/verify` | public | `{ challengeToken, code }` (TOTP ou code de secours) → user + tokens |
| POST | `/auth/change-password` | auth | `{ currentPassword, newPassword }` → révoque toutes les sessions |
| GET / DELETE | `/auth/sessions` | auth | liste des sessions actives · `DELETE ?id=` ou `?all=true` |

Connexion avec 2FA : `login` / `verify-otp` renvoient `{ requires2fa: true, challengeToken }` au lieu des tokens.

## Profil / KYC
| Méthode | Route | Note |
|---|---|---|
| GET / PATCH | `/profile` | profil complet + `notifications` (préférences §33) ; alias : `GET/PATCH /me` (§43, §46). `PATCH { notifications: { notifyPayment, notifyTontine, … } }` |
| GET / POST | `/profile/privacy` | RGPD (§4.5) : `GET` → consentements + statut demandes · `POST {action:'export'}` → archive JSON · `POST {action:'delete-request', reason?}` · `POST {action:'cancel-delete'}` |
| GET | `/ai/insights` | Smart Alerts — `{ insights: [{ kind, icon, title, body, actionUrl?, priority }] }`, dérivés des données réelles |
| GET / POST | `/kyc` | statut + dossier ; POST initie un dossier |
| GET / POST / DELETE | `/kyc/documents` | POST `{ type, dataUrl }` — voir ADR 0003 |

## Wallet
| Méthode | Route |
|---|---|
| GET | `/wallet` — solde + stats 30 j |
| GET | `/wallet/transactions` — historique paginé |
| POST | `/wallet/deposit` — `{ amount, method }` (simulation MVP) |
| POST | `/wallet/transfer` — `{ recipientPhone, amount, description? }` · en-tête `Idempotency-Key` supporté · reversal auto si le crédit échoue |

## KESSIA Score (§10, §22)
| Méthode | Route | Note |
|---|---|---|
| GET | `/score` | score `[0,1000]` + `band` + `factors[]` (points/max/detail) + `advice[]` — modèle à base de règles, persisté dans `UserProfile.kessiaScore` |

## Tontine
| Méthode | Route | Cahier §43 |
|---|---|---|
| GET / POST | `/tontine` | `/tontines` |
| GET / PATCH | `/tontine/[id]` | PATCH `{action:'start'}` (créateur) démarre la tontine ; sinon champs éditables |
| GET / POST | `/tontine/[id]/members` | POST rejoint via `{inviteCode}` en connaissant l'id ; complète le groupe → démarrage auto |
| POST | `/tontine/join` | rejoindre via le seul `{code}` d'invitation → notifie le gestionnaire ; complète le groupe → démarrage auto |
| POST | `/tontine/[id]/contribute` | cotisation · en-tête `Idempotency-Key` supporté · tour complet → **versement au bénéficiaire + tour suivant** |
| GET / POST | `/tontine/[id]/agreement` | contrat numérique (§6.4) : `GET` → termes + acceptations + journal d'événements · `POST {action:'accept'}` |

## Fonds de Garantie Solidaire (§6.5 — mode démonstration)
| Méthode | Route | Note |
|---|---|---|
| GET | `/guarantee` | projection du solde + règles + éligibilité + mes demandes |
| POST | `/guarantee/claims` | ouvrir une demande (`GUARANTEE_FUND_USER_REQUESTS=1`) |
| GET | `/admin/guarantee` | back-office conformité : file de demandes + journal + reporting |
| PATCH | `/admin/guarantee/claims/[id]` | `{decision:'APPROVED'\|'REJECTED', note}` (rôles conformité) |

## Business (§7, §8)
| Méthode | Route | Note |
|---|---|---|
| GET / POST | `/business` | |
| GET / PATCH | `/business/[id]` | |
| GET / POST | `/business/[id]/products` | |
| GET / POST | `/business/[id]/sales` | POST accepte `customerId` (validé) |
| GET / POST | `/business/[id]/expenses` | POST accepte `supplierId` (validé) |
| GET / POST | `/business/[id]/invoices` | POST `{kind:'QUOTE'\|'INVOICE', customerId?, ...}` → `DEV-`/`FAC-AAAA-####` |
| PATCH | `/business/[id]/invoices/[invoiceId]` | `{action:'convert'}` (devis→facture) ou `{action:'status', status}` |
| GET / POST | `/business/[id]/customers` | liste segmentée + résumé ; POST `{name, type, phone?, email?, address?, notes?}` |
| GET / PATCH / DELETE | `/business/[id]/customers/[customerId]` | fiche + historique ; PATCH notes/relance ; DELETE bloqué si ventes/factures |
| GET / POST | `/business/[id]/suppliers` | répertoire + achats cumulés |
| GET / PATCH / DELETE | `/business/[id]/suppliers/[supplierId]` | |
| GET / POST / DELETE | `/business/[id]/goals` | progression calculée ; POST `{metric, period, targetValue, label?}` (max 6) ; DELETE `?goalId=` |
| GET | `/business/[id]/treasury` | vue calculée : encaissé/décaissé 6 mois + créances |
| GET | `/business/[id]/dna` | profil agrégé + score de santé + recommandations (§8) |
| GET / PUT / POST | `/business/[id]/plan` | Business Plan AI (§17) : GET génère/renvoie le brouillon ; PUT enregistre le contenu édité ; POST `{action:'regenerate'}` |
| GET | `/business/[id]/invoices/[invoiceId]` | document complet d'un devis / d'une facture (aperçu HTML, §7) |
| GET | `/business/[id]/invoices/[invoiceId]/pdf` | **PDF serveur** du devis / de la facture (`application/pdf`, cookie GET autorisé) — ADR 0032 |
| POST | `/business/[id]/invoices/[invoiceId]/email` | envoie le PDF par e-mail `{to?}` (Resend ou SIMULATION) → `{sent, simulated, to}` — ADR 0032 |
| GET | `/wallet/transactions/[id]` | reçu d'une opération wallet (aperçu HTML, §6.1) |
| GET | `/wallet/transactions/[id]/pdf` | **PDF serveur** du reçu (`application/pdf`, cookie GET autorisé) — ADR 0032 |

## Croissance & opportunités (§17, §23)
| Méthode | Route | Note |
|---|---|---|
| GET | `/growth` | plan de croissance calculé (Score + ADN + tontines + KYC) + progression |
| PATCH | `/growth/steps/[key]` | `{status:'TODO'\|'DOING'\|'DONE'\|'SKIPPED', note?}` — progression d'une étape |
| GET | `/opportunities` | opportunités concrètes dérivées des données de l'utilisateur |

## Transparence & agenda (§21, §26)
| Méthode | Route | Note |
|---|---|---|
| GET | `/trust` | Trust Center : tarifs, plafonds KYC + consommation du mois, sécurité, données, Fonds de Garantie, mentions réglementaires, `legal: { acceptedVersion, acceptedAt, currentVersion, currentVersionLabel, upToDate }` (§8) |
| GET | `/legal/acceptance` | État d'acceptation des CGU : `{ acceptedVersion, acceptedAt, currentVersion, currentVersionLabel, upToDate, documents[] }` (§8) |
| POST | `/legal/acceptance` | Enregistre l'acceptation de la version en vigueur (`termsAcceptedVersion`/`At` + audit `legal.terms_accepted`). Utilisé par `LegalGate` |
| GET | `/support/[id]/attachments` | Pièces jointes du ticket (demandeur ou agent) ; `url` signée ou data-URI, `uploadedByMe`. Internes masquées au demandeur (§46) |
| POST | `/support/[id]/attachments` | `{ fileName, dataUrl, isInternal? }` — images / PDF ≤ 5 Mo, ≤ 10 / ticket. Rate-limité, refusé si ticket fermé, `isInternal` réservé aux agents. Audit `support.attachment_added` |
| DELETE | `/support/[id]/attachments?attachmentId=` | Retire une pièce (auteur, ou agent). Audit `support.attachment_removed` |
| GET | `/calendar` | agenda agrégé : cotisations, factures, échéances du plan de croissance, relances (fenêtre −14 j / +60 j) |

## Observabilité & anti-fraude (§32, §47)
| Méthode | Route | Note |
|---|---|---|
| GET | `/api/metrics` | métriques format Prometheus — **non authentifié mais protégé par `METRICS_TOKEN`** (`Authorization: Bearer` ou `x-metrics-token`). Hors `/api/v1`. |
| GET | `/admin/fraud` (`?status`) · PATCH `/admin/fraud/[id]` | file d'alertes anti-fraude + décision `{status:'REVIEWING'\|'CONFIRMED'\|'DISMISSED', note?}` (rôles conformité) |
| GET | `/admin/analytics` | KPI plateforme agrégés (sans nominatif) + série 30 j + « priorités du jour » (Admin Copilot) |

## Modules — feuille de route (§9–§16)
| Méthode | Route | Note |
|---|---|---|
| GET / POST / DELETE | `/modules/interest` | mes intérêts ; POST/DELETE `{module}` (clé validée contre le catalogue) |
| GET | `/admin/modules` | demande agrégée par module (priorisation) |

## Paiements (§6.3, §43, §44)
| Méthode | Route | Note |
|---|---|---|
| GET / POST | `/payments` | POST `{ direction: INBOUND\|OUTBOUND, method, amount, account? }` → PaymentProvider |
| GET | `/payments/[id]` | |
| POST | `/payments/webhooks/[provider]` | notification fournisseur — **non authentifié**, signature HMAC-SHA256 `x-kessia-signature`, idempotent. Body `{ event: 'payment.completed'\|'payment.failed', reference, externalRef?, failureReason? }`. Providers : `mobile-money`, `bank`, `qr`, `cash`, `simulator` |

## Divers
| Méthode | Route |
|---|---|
| POST | `/ai/chat` |
| GET / PATCH | `/notifications` |
| GET / POST | `/support` (tickets) · `/support/[id]/messages` |

## Back-office (§45 — `withAuthAndRole`)
| Méthode | Route |
|---|---|
| GET | `/admin/overview` |
| GET | `/admin/users` (`?q`, `?kyc`) · GET/PATCH `/admin/users/[id]` (`{action:'suspend'\|'reactivate', reason?}` — rôles conformité) |
| GET | `/admin/kyc` (`?status`) · GET/PATCH `/admin/kyc/[id]` (revue : VERIFIED / REJECTED / ACTION_REQUIRED) |
| GET | `/admin/transactions` (`?q`, `?status`) |
| GET | `/admin/tontines` |
| GET | `/admin/support` · GET/PATCH `/admin/support/[id]` (`{action:'assign'\|'unassign'\|'status'\|'reply'}`) |

## Santé & tâches planifiées
| Méthode | Route | Note |
|---|---|---|
| GET | `/api/health` | `{ status, db, version, latencyMs, time }` — 200 / 503 (hors `/api/v1`) |
| GET · POST | `/api/v1/cron/tontine-tick` | ordonnanceur — `x-cron-secret` == `CRON_SECRET` ou `Authorization: Bearer` (obligatoire en prod). Renvoie `{ tontine, reminders }` : retards / relances / rattrapage des versements **+ relances clients échues** (§7). `GET` pour Vercel Cron, `POST` pour GitHub Actions (`cron.yml`). |

## À implémenter (cahier §43-44)
- Gestion tontine depuis l'admin (suspendre, forcer un tour)
- Réconciliation des règlements avec les relevés partenaires
- Chat AI génératif (LLM) — le mode règles est celui du MVP
