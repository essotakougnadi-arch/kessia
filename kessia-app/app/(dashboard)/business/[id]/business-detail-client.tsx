'use client';
// ============================================================
// KESSIA — Détail Business : dashboard, produits, ventes,
// dépenses, factures/devis, CRM clients & fournisseurs,
// objectifs, trésorerie, ADN de l'entreprise
// (cahier des charges §7, §8, §11-12)
// ============================================================

import { useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from './business-detail.module.css';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote } from '@/components/ui/ErrorNote';
import { DraftNotice } from '@/components/ui/DraftNotice';
import { useUiStore } from '@/store/uiStore';
import { useFormDraft } from '@/hooks/useFormDraft';
import {
  useBusinessDetail, useCustomerDetail,
  type Product, type CustomerRow, type SupplierRow, type GoalProgress,
} from '@/hooks/useBusinessDetail';
import { useBusinessPlan, type BusinessPlanContent } from '@/hooks/useBusinessPlan';
import { PLAN_SECTIONS } from '@/lib/business/plan-shared';
import { formatCurrency, formatNumber, formatRelativeDate, formatDate } from '@/lib/utils/format';
import { downloadCsv } from '@/lib/utils/csv';
import { useT, type TFunction } from '@/lib/i18n';
import type { CustomerType, GoalMetric, GoalPeriod, InvoiceStatus } from '@prisma/client';

const TAB_KEYS = [
  'resume', 'clients', 'fournisseurs', 'produits', 'ventes', 'depenses',
  'factures', 'objectifs', 'tresorerie', 'adn', 'plan',
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const invoiceStatusLabel = (t: TFunction, s: InvoiceStatus) => t(`business.invoiceStatus.${s}`);
const segmentLabel = (t: TFunction, s: string) => t(`business.segment.${s}`);

export default function BusinessDetailClient({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const addToast = useUiStore((s) => s.addToast);
  const b = useBusinessDetail(id);

  const tab = (params.get('tab') as TabKey) || 'resume';
  const setTab = (k: TabKey) => router.replace(`/business/${id}?tab=${k}`);

  const [modal, setModal] = useState<null | 'product' | 'sale' | 'expense' | 'invoice' | 'customer' | 'supplier' | 'goal'>(null);
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const done = (msg: string) => { addToast({ type: 'success', message: msg }); setModal(null); };
  const toast = (r: { success: boolean; message: string }) =>
    addToast({ type: r.success ? 'success' : 'error', message: r.message });

  // Ouvre directement le formulaire demandé depuis les actions rapides
  // de /business (ex. ?action=sale) — même patron que le wallet
  // (?action=deposit), pour que « Nouvelle vente »/« Ajouter produit »/
  // « Dépense »/« Facture » ne soient plus des culs-de-sac (« bientôt
  // disponible »). Attend la fin du chargement pour ne pas juger
  // `b.products` vide à tort avant que les données arrivent.
  useEffect(() => {
    const action = params.get('action');
    if (!action || b.isLoading) return;
    const tabForAction: Record<string, TabKey> = { sale: 'ventes', product: 'produits', expense: 'depenses', invoice: 'factures' };
    const nextTab = tabForAction[action];
    if (!nextTab) return;
    if (action === 'sale' && b.products.length === 0) {
      addToast({ type: 'info', message: t('business.addProductsFirst') });
    } else if (action === 'sale' || action === 'product' || action === 'expense' || action === 'invoice') {
      setModal(action);
    }
    router.replace(`/business/${id}?tab=${nextTab}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, b.isLoading]);

  if (b.error && !b.isLoading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <Link href="/business" className={styles.backBtn}>←</Link>
          <h1 className={styles.title}>Business</h1>
        </header>
        <ErrorNote message={t('business.inaccessible')} onRetry={b.refresh} />
      </div>
    );
  }

  const d = b.dashboard?.dashboard;
  const biz = b.dashboard?.business;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/business" className={styles.backBtn} aria-label={t('business.back')}>←</Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className={styles.title}>{biz?.name ?? t('business.headerLoading')}</h1>
          {biz && <div className={styles.sub}>{biz.sector}{biz.city ? ` · ${biz.city}` : ''}</div>}
        </div>
      </header>

      <div className={styles.tabs}>
        {TAB_KEYS.map((k) => (
          <button key={k} className={`${styles.tab} ${tab === k ? styles.tabActive : ''}`} onClick={() => setTab(k)}>
            {t(`business.tabs.${k}`)}
          </button>
        ))}
      </div>

      {/* ── RÉSUMÉ ── */}
      {tab === 'resume' && (
        <div className={styles.section}>
          <div className={styles.kpiGrid}>
            <Kpi label={t('business.salesToday')} value={d ? formatCurrency(d.todaySales) : '—'} sub={d ? t('business.salesCount', { count: d.todaySalesCount }) : ''} />
            <Kpi label={t('business.salesMonth')} value={d ? formatCurrency(d.monthSales) : '—'} sub={d ? t('business.salesCount', { count: d.monthSalesCount }) : ''} />
            <Kpi label={t('business.expensesMonth')} value={d ? formatCurrency(d.monthExpenses) : '—'} tone="neg" />
            <Kpi label={t('business.estMargin')} value={d ? formatCurrency(d.estimatedMargin) : '—'} tone={d && d.estimatedMargin >= 0 ? 'pos' : 'neg'} />
          </div>

          <div className={styles.blockTitle}>{t('business.topProductsMonth')}</div>
          <div className={styles.list}>
            {!d && <div className={styles.row}><span className={`${styles.rowMain} ${styles.skeleton}`}>{t('business.loading')}</span></div>}
            {d && d.topProducts.length === 0 && <div className={styles.emptyRow}>{t('business.noSalesMonth')}</div>}
            {d?.topProducts.map((p) => (
              <div key={p.productId} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{p.name}</div>
                  <div className={styles.rowSub}>{t('business.unitsCount', { count: formatNumber(p.count) })}</div>
                </div>
                <div className={`${styles.rowRight} ${styles.pos}`}>{formatCurrency(p.revenue)}</div>
              </div>
            ))}
          </div>

          {d && d.lowStockProducts.length > 0 && (
            <>
              <div className={styles.blockTitle}>{t('business.lowStock')}</div>
              <div className={styles.list}>
                {d.lowStockProducts.map((p) => (
                  <div key={p.id} className={styles.row}>
                    <div className={styles.rowMain}>{p.name}</div>
                    <span className={`${styles.badge} ${styles.warn}`}>{t('business.inStock', { count: p.stock })}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.blockTitle}>{t('business.recentSales')}</div>
          <div className={styles.list}>
            {d && d.recentSales.length === 0 && <div className={styles.emptyRow}>{t('business.noSalesRecorded')}</div>}
            {d?.recentSales.slice(0, 6).map((s) => (
              <div key={s.id} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{s.customer?.name ?? t('business.walkInClient')}</div>
                  <div className={styles.rowSub}>{formatRelativeDate(s.createdAt)}</div>
                </div>
                <div className={`${styles.rowRight} ${styles.pos}`}>+{formatCurrency(s.totalAmount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CLIENTS (CRM §7) ── */}
      {tab === 'clients' && (
        <ClientsTab
          rows={b.customers}
          summary={b.customersSummary}
          onAdd={() => setModal('customer')}
          onOpen={setOpenCustomer}
        />
      )}

      {/* ── FOURNISSEURS ── */}
      {tab === 'fournisseurs' && (
        <SuppliersTab rows={b.suppliers} summary={b.suppliersSummary} onAdd={() => setModal('supplier')} />
      )}

      {/* ── PRODUITS ── */}
      {tab === 'produits' && (
        <div className={styles.section}>
          <div className={styles.addBar}>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('product')}>{t('business.addProduct')}</button>
          </div>
          <div className={styles.list}>
            {b.products.length === 0 && <div className={styles.emptyRow}>{t('business.noProducts')}</div>}
            {b.products.map((p) => (
              <div key={p.id} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{p.name}</div>
                  <div className={styles.rowSub}>
                    {p.category ? `${p.category} · ` : ''}{t('business.stockLabel')} : {p.stock}{p.cost != null ? ` · ${t('business.costLabel')} ${formatNumber(p.cost)}` : ''}
                  </div>
                </div>
                <div className={styles.rowRight}>{formatCurrency(p.price)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VENTES ── */}
      {tab === 'ventes' && (
        <div className={styles.section}>
          <div className={styles.addBar}>
            <button className="btn btn-primary btn-sm" disabled={b.products.length === 0} onClick={() => setModal('sale')}>
              {t('business.addSale')}
            </button>
          </div>
          {b.products.length === 0 && <p className={styles.emptyRow}>{t('business.addProductsFirst')}</p>}
          <div className={styles.list}>
            {b.sales.length === 0 && b.products.length > 0 && <div className={styles.emptyRow}>{t('business.noSalesShort')}</div>}
            {b.sales.map((s) => (
              <div key={s.id} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{s.items.map((i) => `${i.quantity}× ${i.product.name}`).join(', ')}</div>
                  <div className={styles.rowSub}>
                    {s.customer?.name ? `${s.customer.name} · ` : ''}{formatRelativeDate(s.createdAt)}{s.paymentMethod ? ` · ${s.paymentMethod}` : ''}
                  </div>
                </div>
                <div className={`${styles.rowRight} ${styles.pos}`}>+{formatCurrency(s.totalAmount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DÉPENSES ── */}
      {tab === 'depenses' && (
        <div className={styles.section}>
          <div className={styles.addBar}>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('expense')}>{t('business.addExpense')}</button>
          </div>
          <div className={styles.list}>
            {b.expenses.length === 0 && <div className={styles.emptyRow}>{t('business.noExpenses')}</div>}
            {b.expenses.map((e) => (
              <div key={e.id} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{t(`business.expenseCat.${e.category}`, e.category)}{e.supplier ? ` · ${e.supplier.name}` : ''}</div>
                  <div className={styles.rowSub}>{e.description ?? ''}{e.description ? ' · ' : ''}{formatRelativeDate(e.date)}</div>
                </div>
                <div className={`${styles.rowRight} ${styles.neg}`}>-{formatCurrency(e.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DEVIS & FACTURES ── */}
      {tab === 'factures' && (
        <InvoicesTab
          businessId={id}
          invoices={b.invoices}
          onAdd={() => setModal('invoice')}
          onConvert={async (invId) => toast(await b.convertQuote(invId))}
          onStatus={async (invId, status) => toast(await b.setInvoiceStatus(invId, status))}
          onEmail={async (invId, to) => toast(await b.emailInvoice(invId, to))}
        />
      )}

      {/* ── OBJECTIFS ── */}
      {tab === 'objectifs' && (
        <GoalsTab
          goals={b.goals}
          onAdd={() => setModal('goal')}
          onDelete={async (goalId) => toast(await b.deleteGoal(goalId))}
        />
      )}

      {/* ── TRÉSORERIE ── */}
      {tab === 'tresorerie' && <TreasuryTab data={b.treasury} />}

      {/* ── ADN ── */}
      {tab === 'adn' && <DnaTab data={b.dna} />}

      {/* ── PLAN D'AFFAIRES (§17) ── */}
      {tab === 'plan' && <PlanTab businessId={id} />}

      {/* ── MODALES ── */}
      <Modal open={modal === 'product'} onClose={() => setModal(null)} title={t('business.addProductTitle')}>
        <ProductForm onSubmit={b.addProduct} onDone={done} />
      </Modal>
      <Modal open={modal === 'sale'} onClose={() => setModal(null)} title={t('business.newSaleTitle')}>
        <SaleForm products={b.products} customers={b.customers} onSubmit={b.addSale} onDone={done} />
      </Modal>
      <Modal open={modal === 'expense'} onClose={() => setModal(null)} title={t('business.newExpenseTitle')}>
        <ExpenseForm suppliers={b.suppliers} onSubmit={b.addExpense} onDone={done} />
      </Modal>
      <Modal open={modal === 'invoice'} onClose={() => setModal(null)} title={t('business.newInvoiceTitle')}>
        <InvoiceForm customers={b.customers} onSubmit={b.addInvoice} onDone={done} />
      </Modal>
      <Modal open={modal === 'customer'} onClose={() => setModal(null)} title={t('business.newCustomerTitle')}>
        <CustomerForm onSubmit={b.addCustomer} onDone={done} />
      </Modal>
      <Modal open={modal === 'supplier'} onClose={() => setModal(null)} title={t('business.newSupplierTitle')}>
        <SupplierForm onSubmit={b.addSupplier} onDone={done} />
      </Modal>
      <Modal open={modal === 'goal'} onClose={() => setModal(null)} title={t('business.newGoalTitle')}>
        <GoalForm onSubmit={b.addGoal} onDone={done} />
      </Modal>

      <Modal open={openCustomer !== null} onClose={() => setOpenCustomer(null)} title={t('business.customerCard')}>
        {openCustomer && (
          <CustomerDetailPanel
            businessId={id}
            customerId={openCustomer}
            onChanged={() => b.refresh()}
            onClose={() => setOpenCustomer(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={`${styles.kpiValue} ${tone === 'pos' ? styles.pos : tone === 'neg' ? styles.neg : ''}`}>{value}</div>
      {sub && <div className={styles.rowSub}>{sub}</div>}
    </div>
  );
}

// ── CLIENTS ─────────────────────────────────────────────────
function ClientsTab({ rows, summary, onAdd, onOpen }: {
  rows: CustomerRow[];
  summary: { total: number; clients: number; prospects: number; followUpsDue: number; revenue: number } | null;
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<'ALL' | CustomerRow['segment']>('ALL');
  const now = Date.now();
  const filtered = filter === 'ALL' ? rows : rows.filter((r) => r.segment === filter);
  const FILTERS: Array<'ALL' | CustomerRow['segment']> = ['ALL', 'PROSPECT', 'NOUVEAU', 'REGULIER', 'FIDELE', 'INACTIF'];

  function exportCsv() {
    downloadCsv('clients-kessia', rows.map((r) => ({
      [t('business.fName')]: r.name,
      [t('business.fType')]: r.type,
      [t('business.tabs.clients')]: segmentLabel(t, r.segment),
      [t('business.fPhone')]: r.phone ?? '',
      [t('business.fEmail')]: r.email ?? '',
      [t('business.orders')]: r.orderCount,
      [`${t('business.totalSpent')} (FCFA)`]: r.totalSpent,
      [t('business.lastOrder')]: r.lastOrderAt ? formatDate(r.lastOrderAt) : '',
      [t('business.followUpDate')]: r.nextFollowUpAt ? formatDate(r.nextFollowUpAt) : '',
    })));
  }

  return (
    <div className={styles.section}>
      {summary && (
        <div className={styles.kpiGrid}>
          <Kpi label={t('business.clientsValue')} value={String(summary.clients)} sub={t('business.prospectsCount', { count: summary.prospects })} />
          <Kpi label={t('business.followUpsDue')} value={String(summary.followUpsDue)} tone={summary.followUpsDue > 0 ? 'neg' : undefined} />
        </div>
      )}
      <div className={styles.addBar} style={{ gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={rows.length === 0}>{t('business.exportCsv')}</button>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>{t('business.addClient')}</button>
      </div>
      <div className={styles.filterBar}>
        {FILTERS.map((f) => (
          <button key={f} className={`${styles.chip} ${filter === f ? styles.chipOn : ''}`} onClick={() => setFilter(f)}>
            {f === 'ALL' ? t('business.filterAll') : segmentLabel(t, f)}
          </button>
        ))}
      </div>
      <div className={styles.list}>
        {filtered.length === 0 && <div className={styles.emptyRow}>{t('business.noClientsSegment')}</div>}
        {filtered.map((c) => {
          const due = c.nextFollowUpAt && new Date(c.nextFollowUpAt).getTime() <= now;
          return (
            <button key={c.id} className={`${styles.row} ${styles.rowBtn}`} onClick={() => onOpen(c.id)}>
              <div>
                <div className={styles.rowMain}>
                  {c.name} <span className={`${styles.seg} ${styles[`seg${c.segment}`]}`}>{segmentLabel(t, c.segment)}</span>
                </div>
                <div className={styles.rowSub}>
                  {t('business.ordersCount', { count: c.orderCount })}{c.lastOrderAt ? ` · ${t('business.lastOne', { date: formatRelativeDate(c.lastOrderAt) })}` : ''}
                  {c.nextFollowUpAt && (
                    <> · <span className={`${styles.followTag} ${due ? styles.followTagDue : ''}`}>
                      {t('business.followUpTag', { date: formatDate(c.nextFollowUpAt) })}
                    </span></>
                  )}
                </div>
              </div>
              <div className={styles.rowRight}>{formatCurrency(c.totalSpent)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomerDetailPanel({ businessId, customerId, onChanged, onClose }: {
  businessId: string; customerId: string; onChanged: () => void; onClose: () => void;
}) {
  const t = useT();
  const { customer: c, isLoading, update, remove } = useCustomerDetail(businessId, customerId);
  const addToast = useUiStore((s) => s.addToast);
  const [notes, setNotes] = useState<string | null>(null);
  const [followDate, setFollowDate] = useState<string | null>(null);
  const [followNote, setFollowNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading || !c) return <p className={styles.emptyRow}>{t('business.loading')}</p>;

  const notesValue = notes ?? c.notes ?? '';
  const followValue = followDate ?? (c.nextFollowUpAt ? c.nextFollowUpAt.slice(0, 10) : '');
  const followNoteValue = followNote ?? c.followUpNote ?? '';

  async function save() {
    setBusy(true);
    const r = await update({
      notes: notesValue,
      nextFollowUpAt: followValue ? new Date(followValue).toISOString() : null,
      followUpNote: followNoteValue,
    });
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) onChanged();
  }
  async function toggleType() {
    const r = await update({ type: c!.type === 'CLIENT' ? 'PROSPECT' : 'CLIENT' });
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) onChanged();
  }
  async function del() {
    const r = await remove();
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) { onChanged(); onClose(); }
  }

  return (
    <div className={styles.modalForm}>
      <div>
        <div className={styles.rowMain}>
          {c.name} <span className={`${styles.seg} ${styles[`seg${c.segment}`]}`}>{segmentLabel(t, c.segment)}</span>
        </div>
        <div className={styles.rowSub}>
          {c.phone ?? t('business.noPhone')}{c.email ? ` · ${c.email}` : ''}{c.address ? ` · ${c.address}` : ''}
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <Kpi label={t('business.orders')} value={String(c.stats.orderCount)} />
        <Kpi label={t('business.totalSpent')} value={formatCurrency(c.stats.totalSpent)} tone="pos" />
        <Kpi label={t('business.avgBasket')} value={formatCurrency(c.stats.avgOrder)} />
        <Kpi label={t('business.lastOrder')} value={c.stats.lastOrderAt ? formatDate(c.stats.lastOrderAt) : '—'} />
      </div>

      <button type="button" className="btn btn-ghost btn-sm" onClick={toggleType}>
        {c.type === 'CLIENT' ? t('business.switchToProspect') : t('business.switchToClient')}
      </button>

      <div className="form-group">
        <label className="label">{t('business.notes')}</label>
        <textarea className="input" rows={3} value={notesValue} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className={styles.modalRow}>
        <div className="form-group">
          <label className="label">{t('business.followUpDate')}</label>
          <input className="input" type="date" value={followValue} onChange={(e) => setFollowDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="label">{t('business.followUpReason')}</label>
          <input className="input" value={followNoteValue} maxLength={300} onChange={(e) => setFollowNote(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={save}>
        {busy ? t('business.savingShort') : t('business.save')}
      </button>

      {c.sales.length > 0 && (
        <>
          <div className={styles.blockTitle}>{t('business.purchaseHistory')}</div>
          <div className={styles.list}>
            {c.sales.map((s) => (
              <div key={s.id} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{s.items.join(', ') || t('business.saleWord')}</div>
                  <div className={styles.rowSub}>{formatDate(s.createdAt)}{s.method ? ` · ${s.method}` : ''}</div>
                </div>
                <div className={`${styles.rowRight} ${styles.pos}`}>+{formatCurrency(s.total)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {c.invoices.length > 0 && (
        <>
          <div className={styles.blockTitle}>{t('business.quotesInvoices')}</div>
          <div className={styles.list}>
            {c.invoices.map((i) => (
              <div key={i.id} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{i.number}</div>
                  <div className={styles.rowSub}>{i.kind === 'QUOTE' ? t('business.quote') : t('business.invoice')} · {invoiceStatusLabel(t, i.status)}</div>
                </div>
                <div className={styles.rowRight}>{formatCurrency(i.total)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {c.stats.orderCount === 0 && c.invoices.length === 0 && (
        <button type="button" className={styles.linkBtn} style={{ color: 'var(--color-danger)' }} onClick={del}>
          {t('business.deleteContact')}
        </button>
      )}
    </div>
  );
}

// ── FOURNISSEURS ────────────────────────────────────────────
function SuppliersTab({ rows, summary, onAdd }: {
  rows: SupplierRow[]; summary: { total: number; spent: number } | null; onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className={styles.section}>
      {summary && (
        <div className={styles.kpiGrid}>
          <Kpi label={t('business.suppliersValue')} value={String(summary.total)} />
          <Kpi label={t('business.cumulativePurchases')} value={formatCurrency(summary.spent)} tone="neg" />
        </div>
      )}
      <div className={styles.addBar}>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>{t('business.addSupplier')}</button>
      </div>
      <div className={styles.list}>
        {rows.length === 0 && <div className={styles.emptyRow}>{t('business.noSuppliers')}</div>}
        {rows.map((s) => (
          <div key={s.id} className={styles.row}>
            <div>
              <div className={styles.rowMain}>{s.name}{s.category ? ` · ${s.category}` : ''}</div>
              <div className={styles.rowSub}>
                {t('business.purchasesCount', { count: s.expenseCount })}{s.lastPurchaseAt ? ` · ${t('business.lastOne', { date: formatRelativeDate(s.lastPurchaseAt) })}` : ''}
                {s.phone ? ` · ${s.phone}` : ''}
              </div>
            </div>
            <div className={`${styles.rowRight} ${styles.neg}`}>{formatCurrency(s.totalSpent)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DEVIS & FACTURES ────────────────────────────────────────
function InvoicesTab({ businessId, invoices, onAdd, onConvert, onStatus, onEmail }: {
  businessId: string;
  invoices: ReturnType<typeof useBusinessDetail>['invoices'];
  onAdd: () => void;
  onConvert: (id: string) => void;
  onStatus: (id: string, status: InvoiceStatus) => void;
  onEmail: (id: string, to?: string) => void;
}) {
  const t = useT();
  const [view, setView] = useState<'ALL' | 'QUOTE' | 'INVOICE'>('ALL');
  const [emailing, setEmailing] = useState<string | null>(null);
  const list = view === 'ALL' ? invoices : invoices.filter((i) => i.kind === view);

  async function handleEmail(invId: string) {
    setEmailing(invId);
    await onEmail(invId);
    setEmailing(null);
  }

  return (
    <div className={styles.section}>
      <div className={styles.addBar}>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>{t('business.addInvoice')}</button>
      </div>
      <div className={styles.filterBar}>
        {(['ALL', 'QUOTE', 'INVOICE'] as const).map((v) => (
          <button key={v} className={`${styles.chip} ${view === v ? styles.chipOn : ''}`} onClick={() => setView(v)}>
            {v === 'ALL' ? t('business.filterAllDocs') : v === 'QUOTE' ? t('business.quotes') : t('business.invoices')}
          </button>
        ))}
      </div>
      <div className={styles.list}>
        {list.length === 0 && <div className={styles.emptyRow}>{t('business.noDocuments')}</div>}
        {list.map((inv) => (
          <div key={inv.id} className={styles.row}>
            <div style={{ minWidth: 0 }}>
              <div className={styles.rowMain}>
                {inv.invoiceNumber} — {inv.customerName ?? t('business.clientFallback')}
              </div>
              <div className={styles.rowSub}>
                {inv.kind === 'QUOTE' ? t('business.quote') : t('business.invoice')} · {formatRelativeDate(inv.issuedAt)} ·{' '}
                <span className={styles.badge}>{invoiceStatusLabel(t, inv.status)}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                <Link
                  className={styles.linkBtn}
                  href={`/documents/invoice/${businessId}/${inv.id}`}
                  target="_blank"
                >
                  {t('business.print')}
                </Link>
                <a
                  className={styles.linkBtn}
                  href={`/api/v1/business/${businessId}/invoices/${inv.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('business.downloadPdf')}
                </a>
                <button
                  className={styles.linkBtn}
                  disabled={emailing === inv.id}
                  onClick={() => handleEmail(inv.id)}
                >
                  {emailing === inv.id ? '…' : t('business.emailDoc')}
                </button>
                {inv.kind === 'QUOTE' && !inv.convertedInvoiceId && inv.status !== 'CANCELLED' && (
                  <button className={styles.linkBtn} onClick={() => onConvert(inv.id)}>{t('business.convertToInvoice')}</button>
                )}
                {inv.kind === 'INVOICE' && inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                  <button className={styles.linkBtn} onClick={() => onStatus(inv.id, 'PAID')}>{t('business.markPaid')}</button>
                )}
                {inv.kind === 'INVOICE' && inv.status === 'DRAFT' && (
                  <button className={styles.linkBtn} onClick={() => onStatus(inv.id, 'SENT')}>{t('business.markSent')}</button>
                )}
              </div>
            </div>
            <div className={styles.rowRight}>{formatCurrency(inv.total)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── OBJECTIFS ───────────────────────────────────────────────
function GoalsTab({ goals, onAdd, onDelete }: {
  goals: GoalProgress[]; onAdd: () => void; onDelete: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className={styles.section}>
      <div className={styles.addBar}>
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={goals.length >= 6}>{t('business.addGoal')}</button>
      </div>
      <div className={styles.list}>
        {goals.length === 0 && <div className={styles.emptyRow}>{t('business.noGoals')}</div>}
        {goals.map((g) => (
          <div key={g.id} className={styles.goalCard}>
            <div className={styles.goalHead}>
              <span className={styles.goalName}>{g.label || t(`business.goalMetric.${g.metric}`)} · {t(`business.goalPeriod.${g.period}`)}</span>
              <span className={styles.goalPct}>{g.pct}%</span>
            </div>
            <div className={styles.bar}><div className={styles.barFill} style={{ width: `${g.pct}%` }} /></div>
            <div className={styles.goalMeta}>
              {g.unit === 'FCFA' ? `${formatNumber(g.current)} / ${formatNumber(g.target)} FCFA`
                : `${g.current}${g.unit} / ${g.target}${g.unit}`}
              {' · '}
              <button className={styles.linkBtn} onClick={() => onDelete(g.id)}>{t('business.deleteLc')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TRÉSORERIE ──────────────────────────────────────────────
function TreasuryTab({ data }: { data: ReturnType<typeof useBusinessDetail>['treasury'] }) {
  const t = useT();
  if (!data) return <div className={styles.section}><p className={styles.emptyRow}>{t('business.loading')}</p></div>;
  const max = Math.max(1, ...data.months.flatMap((m) => [m.inflow, m.outflow]));

  return (
    <div className={styles.section}>
      <div className={styles.kpiGrid}>
        <Kpi label={t('business.inflow6m')} value={formatCurrency(data.totals.inflow)} tone="pos" />
        <Kpi label={t('business.outflow6m')} value={formatCurrency(data.totals.outflow)} tone="neg" />
        <Kpi label={t('business.netBalance')} value={formatCurrency(data.totals.net)} tone={data.totals.net >= 0 ? 'pos' : 'neg'} />
        <Kpi label={t('business.toCollect')} value={formatCurrency(data.receivables.total)} sub={t('business.invoicesCount', { count: data.receivables.count })} />
      </div>

      <div className={styles.blockTitle}>{t('business.monthlyFlows')}</div>
      <div className={styles.trChart}>
        {data.months.map((m) => (
          <div key={m.key} className={styles.trCol}>
            <div className={styles.trBars}>
              <div className={styles.trIn} style={{ height: `${(m.inflow / max) * 100}%` }} title={`${t('business.inflowsLegend')} ${formatCurrency(m.inflow)}`} />
              <div className={styles.trOut} style={{ height: `${(m.outflow / max) * 100}%` }} title={`${t('business.outflowsLegend')} ${formatCurrency(m.outflow)}`} />
            </div>
            <span className={styles.trLabel}>{m.label}</span>
          </div>
        ))}
      </div>
      <div className={styles.goalMeta} style={{ marginTop: 8 }}>
        <span style={{ color: 'var(--color-green)' }}>■</span> {t('business.inflowsLegend')} &nbsp;
        <span style={{ color: 'var(--color-danger)' }}>■</span> {t('business.outflowsLegend')}
      </div>

      {data.receivables.overdue > 0 && (
        <div className={styles.note}>
          {t('business.overdueNote', { amount: formatCurrency(data.receivables.overdue) })}
        </div>
      )}
      {data.runwayNote && <div className={styles.note}>{data.runwayNote}</div>}
    </div>
  );
}

// ── ADN (§8) ────────────────────────────────────────────────
function DnaTab({ data }: { data: ReturnType<typeof useBusinessDetail>['dna'] }) {
  const t = useT();
  if (!data) return <div className={styles.section}><p className={styles.emptyRow}>{t('business.loading')}</p></div>;
  const scoreColor = data.health.score >= 80 ? 'var(--color-green)'
    : data.health.score >= 60 ? '#1F5D4A'
    : data.health.score >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <div className={styles.section}>
      <div className={styles.dnaHead}>
        <div className={styles.dnaScore} style={{ background: scoreColor }}>{data.health.score}</div>
        <div style={{ minWidth: 0 }}>
          <div className={styles.dnaBand}>{t('business.healthLabel', { band: data.health.band })}</div>
          <div className={styles.dnaSignals}>{data.health.signals.slice(0, 3).join(' · ')}</div>
          <div className={styles.dnaSignals}>
            {data.identity.sector}{data.identity.city ? ` · ${data.identity.city}` : ''} · {t('business.dnaAge', { count: data.identity.ageMonths })}
          </div>
        </div>
      </div>

      <div className={styles.kpiGrid} style={{ marginTop: 12 }}>
        <Kpi label={t('business.revenue30')} value={formatCurrency(data.activity.revenue30)} sub={t('business.salesCount', { count: data.activity.salesCount30 })} />
        <Kpi label={t('business.revenue90')} value={formatCurrency(data.activity.revenue90)} sub={t('business.salesCount', { count: data.activity.salesCount90 })} />
        <Kpi label={t('business.avgBasket')} value={formatCurrency(data.activity.avgBasket)} />
        <Kpi label={t('business.grossMargin')} value={data.activity.grossMarginRate != null ? `${data.activity.grossMarginRate}%` : '—'} />
        <Kpi label={t('business.recurringCustomers')} value={`${data.customers.recurring}/${data.customers.total}`} />
        <Kpi label={t('business.suppliersValue')} value={String(data.suppliers.count)} sub={t('business.per90d', { amount: formatCurrency(data.suppliers.spend90) })} />
      </div>

      {data.activity.categoryMix.length > 0 && (
        <>
          <div className={styles.blockTitle}>{t('business.revenueBreakdown')}</div>
          <RevenueDonut segments={data.activity.categoryMix} />
        </>
      )}

      {data.activity.topProducts.length > 0 && (
        <>
          <div className={styles.blockTitle}>{t('business.topProducts90')}</div>
          <div className={styles.list}>
            {data.activity.topProducts.map((p) => (
              <div key={p.name} className={styles.row}>
                <div>
                  <div className={styles.rowMain}>{p.name}</div>
                  <div className={styles.rowSub}>{t('business.unitsCount', { count: p.units })}</div>
                </div>
                <div className={`${styles.rowRight} ${styles.pos}`}>{formatCurrency(p.revenue)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.needs.length > 0 && (
        <>
          <div className={styles.blockTitle}>{t('business.recommendations')}</div>
          <div className={styles.list} style={{ gap: 0 }}>
            {data.needs.map((n, i) => (
              <div key={i} className={styles.needItem}><span>💡</span><span>{n}</span></div>
            ))}
          </div>
          <div className={styles.note}>{t('business.dnaNote')}</div>
        </>
      )}
    </div>
  );
}

// ── Donut de répartition du CA (refonte visuelle, remplace les
// barres horizontales — mêmes données `categoryMix`, rien de nouveau
// côté calcul, seule la représentation change) ────────────────
const DONUT_COLORS = ['#B65A3A', '#1F5D4A', '#D6A84F', '#7A5CC0', '#5B34D6', '#C2884A'];

function RevenueDonut({ segments }: { segments: { category: string; share: number }[] }) {
  const r = 15.9; // rayon choisi pour un périmètre ≈ 100 (2πr), pratique en %
  let cumulative = 0;

  return (
    <div className={styles.donutRow}>
      <svg viewBox="0 0 36 36" width="128" height="128" className={styles.donutSvg} role="img" aria-label="Répartition du chiffre d'affaires par catégorie">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-border-medium)" strokeWidth="4" />
        {segments.map((s, i) => {
          const dash = `${s.share} ${100 - s.share}`;
          const offset = 25 - cumulative; // démarre à midi (25 = un quart du périmètre normalisé à 100)
          cumulative += s.share;
          return (
            <circle
              key={s.category}
              cx="18" cy="18" r={r} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="4"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              pathLength={100}
            />
          );
        })}
      </svg>
      <div className={styles.donutLegend}>
        {segments.map((s, i) => (
          <div key={s.category} className={styles.donutLegendRow}>
            <span className={styles.donutDot} style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className={styles.donutLegendLabel}>{s.category}</span>
            <span className={styles.donutLegendPct}>{s.share}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLAN D'AFFAIRES (§17 — Business Plan AI) ────────────────
function PlanTab({ businessId }: { businessId: string }) {
  const t = useT();
  const { plan, generatedAt, updatedAt, isLoading, error, save, regenerate } = useBusinessPlan(businessId, true);
  const addToast = useUiStore((s) => s.addToast);
  const [draft, setDraft] = useState<BusinessPlanContent | null>(null);
  const [busy, setBusy] = useState(false);

  const current = draft ?? plan;
  const dirty = draft !== null && plan !== null && JSON.stringify(draft) !== JSON.stringify(plan);

  function edit<K extends keyof BusinessPlanContent>(key: K, value: BusinessPlanContent[K]) {
    if (!current) return;
    setDraft({ ...current, [key]: value });
  }

  async function onSave() {
    if (!draft) return;
    setBusy(true);
    const r = await save(draft);
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) setDraft(null);
  }
  async function onRegenerate() {
    setBusy(true);
    const r = await regenerate();
    setBusy(false);
    addToast({ type: r.success ? 'success' : 'error', message: r.message });
    if (r.success) setDraft(null);
  }
  function onExport() {
    if (!current) return;
    const lines = [
      ...PLAN_SECTIONS.map((s) => `## ${s.label}\n${current[s.key]}`),
      `## ${t('business.nextActions')}\n${current.prochainesActions.map((a) => `- ${a}`).join('\n')}`,
    ];
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'plan-affaires-kessia.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (error && !isLoading) return <div className={styles.section}><ErrorNote message={t('business.planLoadError')} /></div>;
  if (!current) return <div className={styles.section}><p className={styles.emptyRow}>{t('business.generatingDraft')}</p></div>;

  return (
    <div className={styles.section}>
      <div className={styles.note}>{t('business.planNote')}</div>
      <div className={styles.addBar} style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onExport}>{t('business.planExport')}</button>
        <button className="btn btn-ghost btn-sm" onClick={onRegenerate} disabled={busy}>{t('business.planRegenerate')}</button>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={busy || !dirty}>{busy ? t('business.savingShort') : t('business.save')}</button>
      </div>
      <div className={styles.goalMeta} style={{ marginBottom: 12 }}>
        {generatedAt && t('business.generatedOn', { date: formatDate(generatedAt) })}
        {updatedAt && updatedAt !== generatedAt ? ` · ${t('business.modifiedOn', { date: formatDate(updatedAt) })}` : ''}
      </div>

      {PLAN_SECTIONS.map((s) => (
        <div className="form-group" key={s.key}>
          <label className="label">{s.label}</label>
          <textarea
            className="input"
            rows={4}
            value={current[s.key]}
            onChange={(e) => edit(s.key, e.target.value)}
          />
        </div>
      ))}

      <label className="label">{t('business.nextActions')}</label>
      <div className={styles.list} style={{ gap: 6, marginBottom: 12 }}>
        {current.prochainesActions.map((a, i) => (
          <div key={i} className={styles.lineRow} style={{ gridTemplateColumns: '1fr auto' }}>
            <input
              className="input"
              value={a}
              onChange={(e) => edit('prochainesActions', current.prochainesActions.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => edit('prochainesActions', current.prochainesActions.filter((_, j) => j !== i))}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => edit('prochainesActions', [...current.prochainesActions, ''])}
        >{t('business.addAction')}</button>
      </div>
    </div>
  );
}

// ── Formulaires ─────────────────────────────────────────────

function ProductForm({ onSubmit, onDone }: {
  onSubmit: (p: { name: string; price: number; cost?: number; stock: number; category?: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('0');
  const [category, setCategory] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const p = Number(price);
    if (!name.trim() || !p || p <= 0) return setErr(t('business.errNamePrice'));
    setLoading(true);
    const r = await onSubmit({
      name: name.trim(), price: p,
      cost: cost ? Number(cost) : undefined,
      stock: Number(stock) || 0,
      category: category.trim() || undefined,
    });
    setLoading(false);
    r.success ? onDone(r.message) : setErr(r.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      <div className="form-group"><label className="label">{t('business.fName')}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoFocus /></div>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fPrice')}</label>
          <input className="input" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="form-group"><label className="label">{t('business.fCostOptional')}</label>
          <input className="input" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} /></div>
      </div>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fInitialStock')}</label>
          <input className="input" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} /></div>
        <div className="form-group"><label className="label">{t('business.fCategory')}</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} /></div>
      </div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>{loading ? t('business.savingShort') : t('business.fAdd')}</button>
    </form>
  );
}

function SaleForm({ products, customers, onSubmit, onDone }: {
  products: Product[];
  customers: CustomerRow[];
  onSubmit: (items: { productId: string; quantity: number; unitPrice: number }[], paymentMethod?: string, customerId?: string) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const d = useFormDraft<{ rows: { productId: string; quantity: number }[]; payment: string; customerId: string }>('business-sale');
  const { save: saveDraft } = d;
  const [rows, setRows] = useState<{ productId: string; quantity: number }[]>(d.draft?.rows ?? [{ productId: products[0]?.id ?? '', quantity: 1 }]);
  const [payment, setPayment] = useState(d.draft?.payment ?? 'CASH');
  const [customerId, setCustomerId] = useState(d.draft?.customerId ?? '');
  const [showDraft, setShowDraft] = useState(d.hasDraft);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { saveDraft({ rows, payment, customerId }); }, [rows, payment, customerId, saveDraft]);

  const total = useMemo(() => rows.reduce((s, r) => {
    const p = products.find((x) => x.id === r.productId);
    return s + (p ? p.price * r.quantity : 0);
  }, 0), [rows, products]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const items = rows
      .filter((r) => r.productId && r.quantity > 0)
      .map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: products.find((p) => p.id === r.productId)!.price }));
    if (items.length === 0) return setErr(t('business.errAddArticle'));
    setLoading(true);
    const res = await onSubmit(items, payment, customerId || undefined);
    setLoading(false);
    if (res.success) { d.clear(); onDone(res.message); } else setErr(res.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      {showDraft && (
        <DraftNotice
          at={d.draftAt ?? Date.now()}
          onDismiss={() => {
            setRows([{ productId: products[0]?.id ?? '', quantity: 1 }]); setPayment('CASH'); setCustomerId('');
            d.dismiss(); setShowDraft(false);
          }}
        />
      )}
      {rows.map((r, i) => (
        <div key={i} className={styles.saleItemPick}>
          <select className="input" value={r.productId} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))}>
            {products.map((p) => <option key={p.id} value={p.id}>{t('business.fProductStock', { name: p.name, price: formatNumber(p.price), stock: p.stock })}</option>)}
          </select>
          <input className="input" type="number" min={1} value={r.quantity}
            onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))} />
          <button type="button" className={styles.linkBtn} onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>✕</button>
        </div>
      ))}
      <button type="button" className={styles.linkBtn} onClick={() => setRows([...rows, { productId: products[0]?.id ?? '', quantity: 1 }])}>{t('business.fAddArticle')}</button>

      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fClientOptional')}</label>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{t('business.walkInClient')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="label">{t('business.fPayment')}</label>
          <select className="input" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="CASH">{t('business.paymentMethod.CASH')}</option>
            <option value="MOBILE_MONEY">{t('business.paymentMethod.MOBILE_MONEY')}</option>
            <option value="BANK">{t('business.paymentMethod.BANK')}</option>
            <option value="CREDIT">{t('business.paymentMethod.CREDIT')}</option>
          </select>
        </div>
      </div>

      <div className={styles.row}><span className={styles.rowMain}>{t('business.fTotal')}</span><span className={`${styles.rowRight} ${styles.pos}`}>{formatCurrency(total)}</span></div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>{loading ? t('business.savingShort') : t('business.fSaveSale')}</button>
    </form>
  );
}

function ExpenseForm({ suppliers, onSubmit, onDone }: {
  suppliers: SupplierRow[];
  onSubmit: (e: { category: string; amount: number; description?: string; supplierId?: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const d = useFormDraft<{ category: string; amount: string; description: string; supplierId: string }>('business-expense');
  const { save: saveDraft } = d;
  const [category, setCategory] = useState(d.draft?.category ?? 'Achats');
  const [amount, setAmount] = useState(d.draft?.amount ?? '');
  const [description, setDescription] = useState(d.draft?.description ?? '');
  const [supplierId, setSupplierId] = useState(d.draft?.supplierId ?? '');
  const [showDraft, setShowDraft] = useState(d.hasDraft);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cats = ['Achats', 'Loyer', 'Salaires', 'Transport', 'Électricité', 'Marketing', 'Fournitures', 'Autre'];

  useEffect(() => { saveDraft({ category, amount, description, supplierId }); }, [category, amount, description, supplierId, saveDraft]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const a = Number(amount);
    if (!a || a <= 0) return setErr(t('business.errAmount'));
    setLoading(true);
    const r = await onSubmit({ category, amount: a, description: description.trim() || undefined, supplierId: supplierId || undefined });
    setLoading(false);
    if (r.success) { d.clear(); onDone(r.message); } else setErr(r.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      {showDraft && (
        <DraftNotice at={d.draftAt ?? Date.now()} onDismiss={() => { setCategory('Achats'); setAmount(''); setDescription(''); setSupplierId(''); d.dismiss(); setShowDraft(false); }} />
      )}
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fCategory')}</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => <option key={c} value={c}>{t(`business.expenseCat.${c}`, c)}</option>)}
          </select></div>
        <div className="form-group"><label className="label">{t('business.fSupplierOptional')}</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
      </div>
      <div className="form-group"><label className="label">{t('business.fAmountFcfa')}</label>
        <input className="input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
      <div className="form-group"><label className="label">{t('business.fNoteOptional')}</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>{loading ? t('business.savingShort') : t('business.save')}</button>
    </form>
  );
}

function InvoiceForm({ customers, onSubmit, onDone }: {
  customers: CustomerRow[];
  onSubmit: (i: { kind: 'QUOTE' | 'INVOICE'; customerName: string; customerEmail?: string; customerId?: string; lines: { label: string; quantity: number; unitPrice: number }[]; taxRate: number; status: 'DRAFT' | 'SENT' }) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  type InvoiceDraft = { kind: 'QUOTE' | 'INVOICE'; customer: string; email: string; taxRate: string; lines: { label: string; quantity: number; unitPrice: number }[] };
  const d = useFormDraft<InvoiceDraft>('business-invoice');
  const { save: saveDraft } = d;
  const [kind, setKind] = useState<'QUOTE' | 'INVOICE'>(d.draft?.kind ?? 'INVOICE');
  const [customerId, setCustomerId] = useState('');
  const [customer, setCustomer] = useState(d.draft?.customer ?? '');
  const [email, setEmail] = useState(d.draft?.email ?? '');
  const [taxRate, setTaxRate] = useState(d.draft?.taxRate ?? '0');
  const [lines, setLines] = useState(d.draft?.lines ?? [{ label: '', quantity: 1, unitPrice: 0 }]);
  const [showDraft, setShowDraft] = useState(d.hasDraft);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { saveDraft({ kind, customer, email, taxRate, lines }); }, [kind, customer, email, taxRate, lines, saveDraft]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const total = subtotal + Math.round((subtotal * (Number(taxRate) || 0)) / 100);

  function set(i: number, patch: Partial<{ label: string; quantity: number; unitPrice: number }>) {
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function pickCustomer(cid: string) {
    setCustomerId(cid);
    const c = customers.find((x) => x.id === cid);
    if (c) { setCustomer(c.name); setEmail(c.email ?? ''); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const valid = lines.filter((l) => l.label.trim() && l.quantity > 0);
    if (!customer.trim()) return setErr(t('business.errClientName'));
    if (valid.length === 0) return setErr(t('business.errAddLine'));
    setLoading(true);
    const r = await onSubmit({
      kind,
      customerId: customerId || undefined,
      customerName: customer.trim(),
      customerEmail: email.trim() || undefined,
      lines: valid,
      taxRate: Number(taxRate) || 0,
      status: 'DRAFT',
    });
    setLoading(false);
    if (r.success) { d.clear(); onDone(r.message); } else setErr(r.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      {showDraft && (
        <DraftNotice
          at={d.draftAt ?? Date.now()}
          onDismiss={() => {
            setKind('INVOICE'); setCustomer(''); setCustomerId(''); setEmail(''); setTaxRate('0');
            setLines([{ label: '', quantity: 1, unitPrice: 0 }]); d.dismiss(); setShowDraft(false);
          }}
        />
      )}
      <div className={styles.filterBar}>
        {(['INVOICE', 'QUOTE'] as const).map((k) => (
          <button type="button" key={k} className={`${styles.chip} ${kind === k ? styles.chipOn : ''}`} onClick={() => setKind(k)}>
            {k === 'INVOICE' ? t('business.invoice') : t('business.quote')}
          </button>
        ))}
      </div>

      {customers.length > 0 && (
        <div className="form-group"><label className="label">{t('business.fExistingClientOptional')}</label>
          <select className="input" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">{t('business.fEnterManually')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fClient')}</label>
          <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} autoFocus /></div>
        <div className="form-group"><label className="label">{t('business.fEmailOptional')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>

      <label className="label">{t('business.fLines')}</label>
      {lines.map((l, i) => (
        <div key={i} className={styles.lineRow}>
          <input className="input" placeholder={t('business.fDesignation')} value={l.label} onChange={(e) => set(i, { label: e.target.value })} />
          <input className="input" type="number" min={1} value={l.quantity} onChange={(e) => set(i, { quantity: Number(e.target.value) || 1 })} />
          <input className="input" type="number" min={0} placeholder={t('business.fUnitPrice')} value={l.unitPrice || ''} onChange={(e) => set(i, { unitPrice: Number(e.target.value) || 0 })} />
          <button type="button" className={styles.linkBtn} onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>✕</button>
        </div>
      ))}
      <button type="button" className={styles.linkBtn} onClick={() => setLines([...lines, { label: '', quantity: 1, unitPrice: 0 }])}>{t('business.fAddLine')}</button>

      <div className="form-group"><label className="label">{t('business.fVat')}</label>
        <input className="input" type="number" min={0} max={100} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></div>

      <div className={styles.row}><span className={styles.rowMain}>{t('business.fTotalTtc')}</span><span className={styles.rowRight}>{formatCurrency(total)}</span></div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>
        {loading ? t('business.savingShort') : kind === 'QUOTE' ? t('business.createQuoteBtn') : t('business.createInvoiceBtn')}
      </button>
    </form>
  );
}

function CustomerForm({ onSubmit, onDone }: {
  onSubmit: (c: { name: string; type: CustomerType; phone?: string; email?: string; address?: string; notes?: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomerType>('CLIENT');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (name.trim().length < 2) return setErr(t('business.errNameRequired'));
    setLoading(true);
    const r = await onSubmit({
      name: name.trim(), type,
      phone: phone.trim() || undefined, email: email.trim() || undefined,
      address: address.trim() || undefined, notes: notes.trim() || undefined,
    });
    setLoading(false);
    r.success ? onDone(r.message) : setErr(r.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fName')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus /></div>
        <div className="form-group"><label className="label">{t('business.fType')}</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
            <option value="CLIENT">{t('business.fClientOpt')}</option><option value="PROSPECT">{t('business.fProspectOpt')}</option>
          </select></div>
      </div>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fPhone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} /></div>
        <div className="form-group"><label className="label">{t('business.fEmail')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="label">{t('business.fAddress')}</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></div>
      <div className="form-group"><label className="label">{t('business.notes')}</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>{loading ? t('business.savingShort') : t('business.fAdd')}</button>
    </form>
  );
}

function SupplierForm({ onSubmit, onDone }: {
  onSubmit: (s: { name: string; category?: string; phone?: string; email?: string; address?: string; notes?: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    if (name.trim().length < 2) return setErr(t('business.errNameRequired'));
    setLoading(true);
    const r = await onSubmit({
      name: name.trim(), category: category.trim() || undefined,
      phone: phone.trim() || undefined, email: email.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setLoading(false);
    r.success ? onDone(r.message) : setErr(r.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fName')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus /></div>
        <div className="form-group"><label className="label">{t('business.fCategory')}</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={80} /></div>
      </div>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fPhone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} /></div>
        <div className="form-group"><label className="label">{t('business.fEmail')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="label">{t('business.notes')}</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>{loading ? t('business.savingShort') : t('business.fAdd')}</button>
    </form>
  );
}

function GoalForm({ onSubmit, onDone }: {
  onSubmit: (g: { metric: GoalMetric; period: GoalPeriod; targetValue: number; label?: string }) => Promise<{ success: boolean; message: string }>;
  onDone: (m: string) => void;
}) {
  const t = useT();
  const [metric, setMetric] = useState<GoalMetric>('REVENUE');
  const [period, setPeriod] = useState<GoalPeriod>('MONTH');
  const [target, setTarget] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const METRIC_KEYS: GoalMetric[] = ['REVENUE', 'MARGIN_RATE', 'SALES_COUNT', 'NEW_CUSTOMERS'];
  const PERIOD_KEYS: GoalPeriod[] = ['MONTH', 'QUARTER', 'YEAR'];

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    const val = Number(target);
    if (!val || val <= 0) return setErr(t('business.errInvalidTarget'));
    if (metric === 'MARGIN_RATE' && val > 100) return setErr(t('business.errMarginMax'));
    setLoading(true);
    const r = await onSubmit({ metric, period, targetValue: val, label: label.trim() || undefined });
    setLoading(false);
    r.success ? onDone(r.message) : setErr(r.message);
  }

  return (
    <form className={styles.modalForm} onSubmit={submit}>
      <div className="form-group"><label className="label">{t('business.fIndicator')}</label>
        <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
          {METRIC_KEYS.map((m) => <option key={m} value={m}>{t(`business.goalMetric.${m}`)}</option>)}
        </select></div>
      <div className={styles.modalRow}>
        <div className="form-group"><label className="label">{t('business.fPeriod')}</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
            {PERIOD_KEYS.map((p) => <option key={p} value={p}>{t(`business.goalPeriod.${p}`)}</option>)}
          </select></div>
        <div className="form-group"><label className="label">{t('business.fTarget')}</label>
          <input className="input" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} autoFocus /></div>
      </div>
      <div className="form-group"><label className="label">{t('business.fLabelOptional')}</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} /></div>
      {err && <div className={styles.modalError}>⚠️ {err}</div>}
      <button className="btn btn-primary btn-lg btn-full" disabled={loading}>{loading ? t('business.savingShort') : t('business.fAdd')}</button>
    </form>
  );
}
