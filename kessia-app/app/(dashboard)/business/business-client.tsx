'use client';
// ============================================================
// KESSIA — Business (Client Component)
// Liste réelle + création. Détail/ventes/produits à venir.
// ============================================================

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './business.module.css';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { useUiStore } from '@/store/uiStore';
import { useBusinesses, type Business } from '@/hooks/useBusinesses';
import { initials } from '@/lib/utils/format';
import { useT } from '@/lib/i18n';

const SECTOR_KEYS = [
  'Commerce', 'Restauration', 'Services', 'Artisanat', 'Agriculture', 'Mode & Beauté', 'Tech', 'Autre',
] as const;

export default function BusinessClient() {
  const t = useT();
  const router = useRouter();
  const { businesses, isLoading, error, refresh, createBusiness } = useBusinesses();
  const addToast = useUiStore((s) => s.addToast);
  const [showCreate, setShowCreate] = useState(false);

  // Une activité rapide cible la première entreprise de l'utilisateur ;
  // sans entreprise, elle ouvre directement la création plutôt qu'un
  // toast « bientôt disponible ».
  function quickAction(action: 'sale' | 'product' | 'expense' | 'invoice') {
    if (businesses.length === 0) { setShowCreate(true); return; }
    router.push(`/business/${businesses[0].id}?action=${action}`);
  }

  const totals = businesses.reduce(
    (acc, b) => ({
      products: acc.products + b._count.products,
      sales: acc.sales + b._count.sales,
      customers: acc.customers + b._count.customers,
    }),
    { products: 0, sales: 0, customers: 0 }
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('business.listTitle')}</h1>
          <p className={styles.subtitle}>{t('business.listSubtitle')}</p>
        </div>
        <button className={styles.addBtn} id="btn-add-business" onClick={() => setShowCreate(true)}>
          <span>+</span> {t('business.add')}
        </button>
      </div>

      {error && !isLoading && (
        <ErrorNote message={t('business.loadError')} onRetry={refresh} />
      )}

      {/* KPI agrégés */}
      <div className={styles.kpiBar}>
        <div className={styles.kpiItem}>
          <div className={styles.kpiLabel}>{t('business.kpiProducts')}</div>
          <div className={styles.kpiValue}>{totals.products}</div>
        </div>
        <div className={styles.kpiDivider} />
        <div className={styles.kpiItem}>
          <div className={styles.kpiLabel}>{t('business.kpiSales')}</div>
          <div className={`${styles.kpiValue} ${styles.kpiGreen}`}>{totals.sales}</div>
        </div>
        <div className={styles.kpiDivider} />
        <div className={styles.kpiItem}>
          <div className={styles.kpiLabel}>{t('business.kpiCustomers')}</div>
          <div className={styles.kpiValue}>{totals.customers}</div>
        </div>
      </div>

      {/* Actions rapides — ciblent la 1ère entreprise, ou proposent d'en créer une */}
      <div className={styles.quickActions}>
        {([
          { icon: '➕', key: 'quickNewSale', color: 'green', action: 'sale' },
          { icon: '📦', key: 'quickAddProduct', color: 'primary', action: 'product' },
          { icon: '💸', key: 'quickExpense', color: 'gold', action: 'expense' },
          { icon: '🧾', key: 'quickInvoice', color: 'primary', action: 'invoice' },
        ] as const).map((a) => (
          <button
            key={a.key}
            className={`${styles.quickAction} ${styles[`quickAction_${a.color}`]}`}
            onClick={() => quickAction(a.action)}
            id={`btn-${a.key}`}
          >
            <div className={styles.quickActionIcon}>{a.icon}</div>
            <span className={styles.quickActionLabel}>{t(`business.${a.key}`)}</span>
          </button>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            {t('business.activitiesCount', { count: isLoading ? '…' : businesses.length })}
          </h2>
        </div>

        <div className={styles.businessList}>
          {isLoading && (
            <div className={styles.bizCard}>
              <div className={styles.bizCardHeader}>
                <div className={styles.bizAvatar}>··</div>
                <div className={styles.bizInfo}>
                  <div className={`${styles.bizName} ${styles.skeleton}`}>{t('business.loading')}</div>
                  <div className={`${styles.bizSector} ${styles.skeleton}`}>secteur</div>
                </div>
              </div>
            </div>
          )}

          {!isLoading && !error && businesses.length === 0 && (
            <div className={styles.emptyRow}>{t('business.noActivities')}</div>
          )}

          {!isLoading && businesses.map((biz) => (
            <BizCard key={biz.id} biz={biz} />
          ))}
        </div>
      </div>

      <div className={styles.ctaSection}>
        <div className={styles.ctaCard}>
          <div className={styles.ctaIcon}>🏪</div>
          <div className={styles.ctaText}>
            <div className={styles.ctaTitle}>{t('business.ctaTitle')}</div>
            <div className={styles.ctaDesc}>{t('business.ctaDesc')}</div>
          </div>
          <button className={styles.ctaBtn} id="btn-cta-create-biz" onClick={() => setShowCreate(true)}>
            {t('business.ctaCreate')}
          </button>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('business.createTitle')}>
        <CreateBusinessForm
          onSubmit={createBusiness}
          onDone={(msg) => {
            addToast({ type: 'success', message: msg });
            setShowCreate(false);
          }}
        />
      </Modal>
    </div>
  );
}

function BizCard({ biz }: { biz: Business }) {
  const t = useT();
  return (
    <div className={styles.bizCard}>
      <div className={styles.bizCardHeader}>
        <div className={styles.bizAvatar}>{initials(biz.name.split(' ')[0], biz.name.split(' ')[1])}</div>
        <div className={styles.bizInfo}>
          <div className={styles.bizName}>{biz.name}</div>
          <div className={styles.bizSector}>
            <span>{biz.sector}</span>
            {biz.city && (<><span className={styles.bizDot}>·</span><span>{biz.city}</span></>)}
          </div>
        </div>
        <div className={`${styles.bizStatus} ${styles[`bizStatus_${biz.status.toLowerCase()}`]}`}>
          {biz.status === 'ACTIVE' ? t('business.statusActive') : t('business.statusInactive')}
        </div>
      </div>

      <div className={styles.bizKpis} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className={styles.bizKpi}>
          <div className={styles.bizKpiValue}>{biz._count.products}</div>
          <div className={styles.bizKpiLabel}>{t('business.kpiProducts')}</div>
        </div>
        <div className={styles.bizKpi}>
          <div className={styles.bizKpiValue}>{biz._count.sales}</div>
          <div className={styles.bizKpiLabel}>{t('business.kpiSales')}</div>
        </div>
        <div className={styles.bizKpi}>
          <div className={styles.bizKpiValue}>{biz._count.customers}</div>
          <div className={styles.bizKpiLabel}>{t('business.kpiCustomers')}</div>
        </div>
      </div>

      <div className={styles.bizCardActions}>
        <Link href={`/business/${biz.id}?tab=ventes`} className={styles.bizActionBtn}>{t('business.cardSales')}</Link>
        <Link href={`/business/${biz.id}?tab=produits`} className={styles.bizActionBtn}>{t('business.cardProducts')}</Link>
        <Link href={`/business/${biz.id}`} className={`${styles.bizActionBtn} ${styles.bizActionBtnPrimary}`}>{t('business.cardManage')}</Link>
      </div>
    </div>
  );
}

function CreateBusinessForm({
  onSubmit,
  onDone,
}: {
  onSubmit: (p: { name: string; sector: string; city?: string; phone?: string; description?: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (message: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [sector, setSector] = useState<string>(SECTOR_KEYS[0]);
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t('business.nameError2'));
    setLoading(true);
    const result = await onSubmit({
      name: name.trim(),
      sector,
      city: city.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setLoading(false);
    if (result.success) onDone(result.message);
    else setError(result.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="label" htmlFor="biz-name">{t('business.bizName')}</label>
        <input id="biz-name" className="input" placeholder={t('business.bizNamePlaceholder')}
          maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="biz-sector">{t('business.sector')}</label>
        <select id="biz-sector" className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
          {SECTOR_KEYS.map((s) => <option key={s} value={s}>{t(`business.sectors.${s}`)}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label className="label" htmlFor="biz-city">{t('business.city')}</label>
        <input id="biz-city" className="input" placeholder={t('business.cityPlaceholder')} maxLength={100}
          value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <div className="form-group">
        <label className="label" htmlFor="biz-phone">{t('business.phoneOptional')}</label>
        <input id="biz-phone" type="tel" className="input" placeholder="+228 90 00 00 00" maxLength={20}
          value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>

      {error && <div className={styles.modalError}>⚠️ {error}</div>}

      <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading ? t('business.creating') : t('business.createBtn')}
      </button>
    </form>
  );
}
