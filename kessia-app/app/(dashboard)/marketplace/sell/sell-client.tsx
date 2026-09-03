'use client';
// ============================================================
// KESSIA — Marketplace : mettre un article en vente (§16)
// ============================================================

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMarketplaceActions } from '@/hooks/useMarketplace';
import { MARKETPLACE_CATEGORIES } from '@/lib/validations/marketplace';
import { compressImage } from '@/lib/files/compress-image';
import { useUiStore } from '@/store/uiStore';
import { useT } from '@/lib/i18n';
import styles from '../marketplace.module.css';

export default function SellClient() {
  const t = useT();
  const router = useRouter();
  const addToast = useUiStore((s) => s.addToast);
  const { createItem } = useMarketplaceActions();

  const [image, setImage] = useState<string | null>(null);
  const [payableByTontine, setPayableByTontine] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImage(await compressImage(file, 1200, 0.8));
    } catch {
      setErr(t('market.imageError'));
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    const price = Number(f.get('price'));
    if (!(price > 0)) return setErr(t('market.priceError'));

    const payload: Record<string, unknown> = {
      title: (f.get('title') as string).trim(),
      description: (f.get('description') as string).trim() || undefined,
      category: (f.get('category') as string) || undefined,
      price,
      city: (f.get('city') as string).trim() || undefined,
      stock: Math.max(1, Number(f.get('stock')) || 1),
      payableByTontine,
      ...(payableByTontine ? { tontineInstallments: Math.max(2, Math.min(24, Number(f.get('installments')) || 6)) } : {}),
      ...(image ? { imageUrl: image } : {}),
    };

    setBusy(true);
    const res = await createItem(payload);
    setBusy(false);
    addToast({ type: res.success ? 'success' : 'error', message: res.message });
    if (res.success) {
      const d = res.data as { id?: string } | undefined;
      router.push(d?.id ? `/marketplace/${d.id}` : '/marketplace/mine');
    } else {
      setErr(res.message);
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/marketplace" className={styles.back}>← {t('market.backToList')}</Link>
      <h1 className={styles.title}>{t('market.sellTitle')}</h1>
      <p className={styles.sub}>{t('market.sellSub')}</p>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className="form-group">
          <label className="label" htmlFor="title">{t('market.fieldTitle')}</label>
          <input id="title" name="title" className="input" required minLength={3} maxLength={120}
            placeholder={t('market.fieldTitlePlaceholder')} />
        </div>

        <div className={styles.formRow}>
          <div className="form-group">
            <label className="label" htmlFor="price">{t('market.fieldPrice')}</label>
            <input id="price" name="price" type="number" className="input" required min={1} placeholder="50000" />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="category">{t('market.fieldCategory')}</label>
            <select id="category" name="category" className="input" defaultValue="">
              <option value="">{t('market.chooseCategory')}</option>
              {MARKETPLACE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`market.category.${c}`, c)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className="form-group">
            <label className="label" htmlFor="city">{t('market.fieldCity')}</label>
            <input id="city" name="city" className="input" maxLength={80} placeholder="Lomé" />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="stock">{t('market.fieldStock')}</label>
            <input id="stock" name="stock" type="number" className="input" min={1} defaultValue={1} />
          </div>
        </div>

        <div className="form-group">
          <label className="label" htmlFor="description">{t('market.fieldDescription')}</label>
          <textarea id="description" name="description" className="input" rows={4} maxLength={2000}
            placeholder={t('market.fieldDescriptionPlaceholder')} />
        </div>

        <div className="form-group">
          <label className="label" htmlFor="image">{t('market.fieldImage')}</label>
          <input id="image" name="image" type="file" accept="image/*" className="input" onChange={onImage} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image && <img src={image} alt="" className={styles.preview} />}
        </div>

        <label className={styles.tontineToggle}>
          <input type="checkbox" checked={payableByTontine} onChange={(e) => setPayableByTontine(e.target.checked)} />
          <span>
            <strong>🔄 {t('market.fieldPayableTontine')}</strong>
            <span className={styles.toggleHint}>{t('market.fieldPayableTontineHint')}</span>
          </span>
        </label>

        {payableByTontine && (
          <div className="form-group">
            <label className="label" htmlFor="installments">{t('market.fieldInstallments')}</label>
            <input id="installments" name="installments" type="number" className="input" min={2} max={24} defaultValue={6} />
          </div>
        )}

        {err && <div className={styles.formError}>⚠️ {err}</div>}

        <button type="submit" className="btn btn-primary btn-lg btn-full" id="btn-publish" disabled={busy}>
          {busy ? t('market.publishing') : t('market.publish')}
        </button>
      </form>
    </div>
  );
}
