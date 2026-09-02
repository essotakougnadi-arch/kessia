'use client';
// ============================================================
// KESSIA — Vérification KYC (Client Component)
// Cahier des charges §30 : statuts, pièces, revue, motifs de rejet.
// Stockage MVP : data-URI (voir app/api/v1/kyc/documents/route.ts).
// ============================================================

import { useRef, useState, ChangeEvent } from 'react';
import Link from 'next/link';
import styles from './kyc.module.css';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useUiStore } from '@/store/uiStore';
import { useKyc, type KycDocType } from '@/hooks/useProfile';
import { useT, type TFunction } from '@/lib/i18n';

const ID_TYPE_KEYS: KycDocType[] = ['NATIONAL_ID', 'PASSPORT', 'DRIVER_LICENSE', 'RESIDENCE_PERMIT'];
const docLabel = (t: TFunction, d: KycDocType | string) => t(`kycPage.docType.${d}`, String(d));

// Réduit l'image côté client (§35 low-bandwidth)
function compressImage(file: File, maxSize = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponible.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function KycClient() {
  const t = useT();
  const { kyc, isLoading, error, refresh, startKyc, submitDocument } = useKyc();
  const addToast = useUiStore((s) => s.addToast);

  const [idType, setIdType] = useState<KycDocType>('NATIONAL_ID');
  const [busy, setBusy] = useState<KycDocType | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const idInput = useRef<HTMLInputElement>(null);
  const selfieInput = useRef<HTMLInputElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);

  const status = kyc?.kycStatus ?? 'NOT_STARTED';
  const docs = kyc?.activeCase?.documents ?? [];
  const hasDoc = (types: KycDocType[]) => docs.some((d) => types.includes(d.type as KycDocType));
  const hasId = hasDoc(['NATIONAL_ID', 'PASSPORT', 'DRIVER_LICENSE', 'RESIDENCE_PERMIT']);
  const hasSelfie = hasDoc(['SELFIE']);

  const submittedCount = [hasId, hasSelfie].filter(Boolean).length;
  const pct =
    status === 'VERIFIED' ? 100 :
    status === 'UNDER_REVIEW' ? 90 :
    status === 'NOT_STARTED' ? 0 :
    Math.round((submittedCount / 2) * 80);

  async function handleFile(type: KycDocType, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError(null);
    setBusy(type);
    try {
      const dataUrl = await compressImage(file);
      const result = await submitDocument(type, dataUrl);
      if (result.success) addToast({ type: 'success', message: result.message });
      else setFormError(result.message);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('kycPage.sendError'));
    } finally {
      setBusy(null);
    }
  }

  async function handleStart() {
    setStarting(true);
    const result = await startKyc();
    setStarting(false);
    if (result.success) addToast({ type: 'success', message: result.message });
    else addToast({ type: 'error', message: result.message });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/profile" className={styles.backBtn} aria-label={t('kycPage.back')}>←</Link>
        <h1 className={styles.headerTitle}>{t('kycPage.title')}</h1>
        <div className={styles.headerPct}>{pct}%</div>
      </header>

      <div className={styles.progressSection}>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
        <div className={styles.progressLabel}>{t('kycPage.level1')}</div>
      </div>

      {error && !isLoading && <ErrorNote message={t('kycPage.loadError')} onRetry={refresh} />}

      {isLoading && (
        <div className={styles.stateCard}>
          <div className={styles.stateIcon}>⏳</div>
          <div className={styles.stateDesc}>{t('kycPage.loading')}</div>
        </div>
      )}

      {/* ─── ÉTAT : VÉRIFIÉ ─── */}
      {!isLoading && status === 'VERIFIED' && (
        <div className={styles.stateCard}>
          <div className={styles.stateIcon}>✅</div>
          <div className={styles.stateTitle}>{t('kycPage.verifiedTitle')}</div>
          <div className={styles.statusPill + ' ' + styles.pill_verified}>{t('kycPage.levelN', { level: kyc?.kycLevel ?? 1 })}</div>
          <div className={styles.stateDesc}>{t('kycPage.verifiedDesc')}</div>
        </div>
      )}

      {/* ─── ÉTAT : EN REVUE ─── */}
      {!isLoading && status === 'UNDER_REVIEW' && (
        <div className={styles.stateCard}>
          <div className={styles.stateIcon}>🔎</div>
          <div className={styles.stateTitle}>{t('kycPage.reviewTitle')}</div>
          <div className={styles.statusPill + ' ' + styles.pill_review}>{t('kycPage.reviewPill')}</div>
          <div className={styles.stateDesc}>{t('kycPage.reviewDesc')}</div>
          {docs.length > 0 && (
            <div className={styles.docList}>
              {docs.map((d) => (
                <div key={d.id} className={styles.docRow}>
                  <span>📄 {docLabel(t, d.type)}</span>
                  <span className={styles.docRowStatus}>{d.status === 'PENDING' ? t('kycPage.docPending') : d.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ÉTAT : EXPIRÉ ─── */}
      {!isLoading && status === 'EXPIRED' && (
        <div className={styles.stateCard}>
          <div className={styles.stateIcon}>⌛</div>
          <div className={styles.stateTitle}>{t('kycPage.expiredTitle')}</div>
          <div className={styles.stateDesc}>{t('kycPage.expiredDesc')}</div>
          <button className={`btn btn-primary btn-lg btn-full ${styles.primaryBtn}`} onClick={handleStart} disabled={starting}>
            {starting ? t('kycPage.opening') : t('kycPage.restart')}
          </button>
        </div>
      )}

      {/* ─── ÉTAT : NON DÉMARRÉ ─── */}
      {!isLoading && status === 'NOT_STARTED' && (
        <>
          <div className={styles.unlockBanner}>
            <span className={styles.unlockIcon}>🔓</span>
            <div>
              <div className={styles.unlockTitle}>{t('kycPage.unlockTitle')}</div>
              <div className={styles.unlockSub}>{t('kycPage.unlockSub')}</div>
            </div>
          </div>
          <div className={styles.stateCard}>
            <div className={styles.stateIcon}>🛡️</div>
            <div className={styles.stateTitle}>{t('kycPage.verifyTitle')}</div>
            <div className={styles.stateDesc}>{t('kycPage.verifyDesc')}</div>
            <button
              className={`btn btn-primary btn-lg btn-full ${styles.primaryBtn}`}
              onClick={handleStart}
              disabled={starting}
              id="btn-start-kyc"
            >
              {starting ? t('kycPage.openingCase') : t('kycPage.startVerify')}
            </button>
            <Link href="/ai?q=Comment fonctionne la vérification KYC ?" className={styles.aiHelpLink}>
              {t('kycPage.askAi')}
            </Link>
          </div>
        </>
      )}

      {/* ─── ÉTAT : EN COURS / ACTION REQUISE / REJETÉ ─── */}
      {!isLoading && ['IN_PROGRESS', 'ACTION_REQUIRED', 'REJECTED'].includes(status) && (
        <div className={styles.actionSection}>
          {(status === 'REJECTED' || status === 'ACTION_REQUIRED') && (
            <div className={styles.rejectBox}>
              <strong>{status === 'REJECTED' ? t('kycPage.rejectedTitle') : t('kycPage.actionRequiredTitle')}</strong>{' '}
              {kyc?.activeCase?.rejectionReason ?? t('kycPage.defaultRejectReason')}
            </div>
          )}

          {/* Pièce d'identité */}
          <div className={styles.uploadCard} style={{ marginTop: 16 }}>
            <div className={styles.uploadTitle}>{t('kycPage.step1Id')}</div>
            <div className={styles.uploadSub}>{t('kycPage.step1IdSub')}</div>

            <div className={styles.docTypeRow}>
              {ID_TYPE_KEYS.map((k) => (
                <button
                  key={k}
                  className={`${styles.docTypeBtn} ${idType === k ? styles.docTypeBtnActive : ''}`}
                  onClick={() => setIdType(k)}
                >
                  {docLabel(t, k)}
                </button>
              ))}
            </div>

            <div className={styles.uploadZones}>
              <div
                className={`${styles.uploadZone} ${hasId ? styles.zoneDone : ''} ${busy === idType ? styles.zoneBusy : ''}`}
                onClick={() => idInput.current?.click()}
              >
                {busy === idType ? (
                  <div className={styles.uploadZoneLabel}>{t('kycPage.sending')}</div>
                ) : hasId ? (
                  <>
                    <div className={styles.uploadZoneIcon}>✅</div>
                    <div className={styles.uploadZoneLabel}>{t('kycPage.receivedReplace')}</div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadZoneIcon}>📷</div>
                    <div className={styles.uploadZoneLabel}>{t('kycPage.photograph')}</div>
                    <div className={styles.uploadZoneSub}>{docLabel(t, idType)}</div>
                  </>
                )}
              </div>
              <div className={styles.uploadTips}>
                <div className={styles.uploadTip}>{t('kycPage.tipSharp')}</div>
                <div className={styles.uploadTip}>{t('kycPage.tipNotExpired')}</div>
                <div className={styles.uploadTip}>{t('kycPage.tipFourCorners')}</div>
                <div className={styles.uploadTip}>{t('kycPage.tipNoGlare')}</div>
              </div>
            </div>
            <input
              ref={idInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handleFile(idType, e)}
            />
          </div>

          {/* Selfie */}
          <div className={styles.uploadCard} style={{ marginTop: 12 }}>
            <div className={styles.uploadTitle}>{t('kycPage.step2Selfie')}</div>
            <div className={styles.uploadSub}>{t('kycPage.step2SelfieSub')}</div>
            <div
              className={`${styles.uploadZone} ${hasSelfie ? styles.zoneDone : ''} ${busy === 'SELFIE' ? styles.zoneBusy : ''}`}
              style={{ aspectRatio: '16/7' }}
              onClick={() => selfieInput.current?.click()}
            >
              {busy === 'SELFIE' ? (
                <div className={styles.uploadZoneLabel}>{t('kycPage.sending')}</div>
              ) : hasSelfie ? (
                <>
                  <div className={styles.uploadZoneIcon}>✅</div>
                  <div className={styles.uploadZoneLabel}>{t('kycPage.selfieReceived')}</div>
                </>
              ) : (
                <>
                  <div className={styles.uploadZoneIcon}>🤳</div>
                  <div className={styles.uploadZoneLabel}>{t('kycPage.takeSelfie')}</div>
                </>
              )}
            </div>
            <input
              ref={selfieInput}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => handleFile('SELFIE', e)}
            />
          </div>

          {/* Justificatif domicile (niveau 2, optionnel) */}
          <div className={styles.uploadCard} style={{ marginTop: 12 }}>
            <div className={styles.uploadTitle}>{t('kycPage.step3Address')} <span style={{ fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{t('kycPage.step3AddressOptional')}</span></div>
            <div className={styles.uploadSub}>{t('kycPage.step3AddressSub')}</div>
            <div
              className={`${styles.uploadZone} ${hasDoc(['PROOF_OF_ADDRESS']) ? styles.zoneDone : ''} ${busy === 'PROOF_OF_ADDRESS' ? styles.zoneBusy : ''}`}
              style={{ aspectRatio: '16/7' }}
              onClick={() => addressInput.current?.click()}
            >
              {busy === 'PROOF_OF_ADDRESS' ? (
                <div className={styles.uploadZoneLabel}>{t('kycPage.sending')}</div>
              ) : hasDoc(['PROOF_OF_ADDRESS']) ? (
                <>
                  <div className={styles.uploadZoneIcon}>✅</div>
                  <div className={styles.uploadZoneLabel}>{t('kycPage.receivedReplace')}</div>
                </>
              ) : (
                <>
                  <div className={styles.uploadZoneIcon}>🏠</div>
                  <div className={styles.uploadZoneLabel}>{t('kycPage.addAddressProof')}</div>
                </>
              )}
            </div>
            <input
              ref={addressInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleFile('PROOF_OF_ADDRESS', e)}
            />
          </div>

          {formError && <div className={styles.modalError}>⚠️ {formError}</div>}

          <div className={styles.stateDesc} style={{ marginTop: 16 }}>
            {hasId && hasSelfie ? t('kycPage.docsComplete') : t('kycPage.docsIncomplete')}
          </div>

          <Link href="/ai?q=Que faire si mon KYC est refusé ?" className={styles.aiHelpLink}>
            {t('kycPage.askAi')}
          </Link>

          <div className={styles.secureNote}>{t('kycPage.secureNote')}</div>
        </div>
      )}
    </div>
  );
}
