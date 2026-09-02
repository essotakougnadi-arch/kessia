// ============================================================
// KESSIA — useBusinessDetail Hook (§7, §8, §11-12)
// Dashboard + produits / ventes / dépenses / factures
// + CRM (clients, fournisseurs), objectifs, trésorerie, ADN
// ============================================================

'use client';

import useSWR from 'swr';
import { useAuthStore } from '@/store/authStore';
import { apiGet, apiSend, type ApiResult } from '@/lib/api/client';
import type {
  BusinessStatus, InvoiceStatus, SaleStatus, CustomerType,
  GoalMetric, GoalPeriod, InvoiceKind,
} from '@prisma/client';
import type { BusinessDNA } from '@/lib/business/dna';
import type { TreasuryView } from '@/lib/business/treasury';

export type BusinessDashboard = {
  business: { id: string; name: string; sector: string; city: string | null; status: BusinessStatus };
  dashboard: {
    todaySales: number; todaySalesCount: number;
    monthSales: number; monthSalesCount: number;
    monthExpenses: number; estimatedMargin: number;
    totalTransactions: number; productsCount: number;
    topProducts: { productId: string; name: string; count: number; revenue: number }[];
    lowStockProducts: { id: string; name: string; stock: number }[];
    recentSales: { id: string; totalAmount: number; createdAt: string; customer: { name: string } | null }[];
  };
};

export type Product = {
  id: string; name: string; description: string | null;
  price: number; cost: number | null; stock: number; category: string | null;
};

export type Sale = {
  id: string; totalAmount: number; paymentMethod: string | null; status: SaleStatus;
  createdAt: string; customer: { id: string; name: string } | null;
  items: { id: string; quantity: number; unitPrice: number; totalPrice: number; product: { id: string; name: string } }[];
};

export type Expense = {
  id: string; category: string; amount: number; description: string | null; date: string;
  supplier?: { id: string; name: string } | null;
};

export type Invoice = {
  id: string; invoiceNumber: string; kind: InvoiceKind; customerName: string | null;
  subtotal: number; tax: number; total: number; status: InvoiceStatus;
  dueDate: string | null; issuedAt: string; convertedInvoiceId: string | null;
};

export type CustomerRow = {
  id: string; name: string; type: CustomerType; phone: string | null; email: string | null;
  notes: string | null; nextFollowUpAt: string | null; followUpNote: string | null;
  orderCount: number; totalSpent: number; lastOrderAt: string | null;
  segment: 'PROSPECT' | 'NOUVEAU' | 'REGULIER' | 'FIDELE' | 'INACTIF';
};
export type CustomerSummary = { total: number; clients: number; prospects: number; followUpsDue: number; revenue: number };

export type CustomerDetail = {
  id: string; name: string; type: CustomerType; phone: string | null; email: string | null;
  address: string | null; notes: string | null; nextFollowUpAt: string | null; followUpNote: string | null;
  createdAt: string;
  stats: { orderCount: number; totalSpent: number; lastOrderAt: string | null; avgOrder: number };
  segment: CustomerRow['segment'];
  sales: { id: string; total: number; createdAt: string; method: string | null; items: string[] }[];
  invoices: { id: string; number: string; kind: InvoiceKind; total: number; status: InvoiceStatus; issuedAt: string }[];
};

export type SupplierRow = {
  id: string; name: string; category: string | null; phone: string | null; email: string | null;
  notes: string | null; expenseCount: number; totalSpent: number; lastPurchaseAt: string | null;
};

export type GoalProgress = {
  id: string; metric: GoalMetric; metricLabel: string; period: GoalPeriod; periodLabel: string;
  label: string | null; target: number; current: number; pct: number; unit: string;
};

export type ActionResult = { success: boolean; message: string };
function toActionResult(r: ApiResult): ActionResult {
  return { success: r.success, message: r.message ?? r.error ?? (r.success ? 'OK' : 'Erreur') };
}

export function useBusinessDetail(id: string) {
  const token = useAuthStore((s) => s.accessToken);
  const key = (path: string) => (token && id ? [`/api/v1/business/${id}${path}`, token] : null);
  const opts = { revalidateOnFocus: false } as const;

  const dash = useSWR<BusinessDashboard>(key(''), ([u]: [string, string]) => apiGet(u), opts);
  const products = useSWR<Product[]>(key('/products'), ([u]: [string, string]) => apiGet(u), opts);
  const sales = useSWR<{ sales: Sale[] }>(key('/sales'), ([u]: [string, string]) => apiGet(u), opts);
  const expenses = useSWR<{ expenses: Expense[] }>(key('/expenses'), ([u]: [string, string]) => apiGet(u), opts);
  const invoices = useSWR<Invoice[]>(key('/invoices'), ([u]: [string, string]) => apiGet(u), opts);
  const customers = useSWR<{ customers: CustomerRow[]; summary: CustomerSummary }>(key('/customers'), ([u]: [string, string]) => apiGet(u), opts);
  const suppliers = useSWR<{ suppliers: SupplierRow[]; summary: { total: number; spent: number } }>(key('/suppliers'), ([u]: [string, string]) => apiGet(u), opts);
  const goals = useSWR<{ goals: GoalProgress[] }>(key('/goals'), ([u]: [string, string]) => apiGet(u), opts);
  const treasury = useSWR<TreasuryView>(key('/treasury'), ([u]: [string, string]) => apiGet(u), opts);
  const dna = useSWR<BusinessDNA>(key('/dna'), ([u]: [string, string]) => apiGet(u), opts);

  const base = `/api/v1/business/${id}`;

  async function addProduct(p: { name: string; price: number; cost?: number; stock: number; category?: string }): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/products`, 'POST', p));
    if (r.success) { products.mutate(); dash.mutate(); }
    return r;
  }
  async function addSale(items: { productId: string; quantity: number; unitPrice: number }[], paymentMethod?: string, customerId?: string): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/sales`, 'POST', { items, paymentMethod, customerId }));
    if (r.success) { sales.mutate(); products.mutate(); dash.mutate(); customers.mutate(); treasury.mutate(); }
    return r;
  }
  async function addExpense(e: { category: string; amount: number; description?: string; supplierId?: string }): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/expenses`, 'POST', e));
    if (r.success) { expenses.mutate(); dash.mutate(); suppliers.mutate(); treasury.mutate(); }
    return r;
  }
  async function addInvoice(inv: {
    kind: InvoiceKind; customerName: string; customerEmail?: string; customerId?: string;
    lines: { label: string; quantity: number; unitPrice: number }[];
    taxRate: number; status: 'DRAFT' | 'SENT';
  }): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/invoices`, 'POST', inv));
    if (r.success) { invoices.mutate(); customers.mutate(); treasury.mutate(); }
    return r;
  }
  async function convertQuote(invoiceId: string): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/invoices/${invoiceId}`, 'PATCH', { action: 'convert' }));
    if (r.success) { invoices.mutate(); treasury.mutate(); }
    return r;
  }
  async function setInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/invoices/${invoiceId}`, 'PATCH', { action: 'status', status }));
    if (r.success) { invoices.mutate(); treasury.mutate(); customers.mutate(); }
    return r;
  }
  async function emailInvoice(invoiceId: string, to?: string): Promise<ActionResult> {
    return toActionResult(await apiSend(`${base}/invoices/${invoiceId}/email`, 'POST', to ? { to } : {}));
  }
  async function addCustomer(c: { name: string; type: CustomerType; phone?: string; email?: string; address?: string; notes?: string }): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/customers`, 'POST', c));
    if (r.success) customers.mutate();
    return r;
  }
  async function addSupplier(s: { name: string; category?: string; phone?: string; email?: string; address?: string; notes?: string }): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/suppliers`, 'POST', s));
    if (r.success) suppliers.mutate();
    return r;
  }
  async function addGoal(g: { metric: GoalMetric; period: GoalPeriod; targetValue: number; label?: string }): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/goals`, 'POST', g));
    if (r.success) goals.mutate();
    return r;
  }
  async function deleteGoal(goalId: string): Promise<ActionResult> {
    const r = toActionResult(await apiSend(`${base}/goals?goalId=${goalId}`, 'DELETE'));
    if (r.success) goals.mutate();
    return r;
  }

  return {
    dashboard: dash.data ?? null,
    products: products.data ?? [],
    sales: sales.data?.sales ?? [],
    expenses: expenses.data?.expenses ?? [],
    invoices: invoices.data ?? [],
    customers: customers.data?.customers ?? [],
    customersSummary: customers.data?.summary ?? null,
    suppliers: suppliers.data?.suppliers ?? [],
    suppliersSummary: suppliers.data?.summary ?? null,
    goals: goals.data?.goals ?? [],
    treasury: treasury.data ?? null,
    dna: dna.data ?? null,
    isLoading: dash.isLoading,
    error: (dash.error) as Error | undefined,
    refresh: () => {
      dash.mutate(); products.mutate(); sales.mutate(); expenses.mutate(); invoices.mutate();
      customers.mutate(); suppliers.mutate(); goals.mutate(); treasury.mutate(); dna.mutate();
    },
    addProduct, addSale, addExpense, addInvoice, convertQuote, setInvoiceStatus, emailInvoice,
    addCustomer, addSupplier, addGoal, deleteGoal,
  };
}

// ── Fiche client (§7) ─────────────────────────────────────────
export function useCustomerDetail(businessId: string, customerId: string | null) {
  const token = useAuthStore((s) => s.accessToken);
  const path = `/api/v1/business/${businessId}/customers/${customerId}`;
  const { data, error, isLoading, mutate } = useSWR<CustomerDetail>(
    token && customerId ? [path, token] : null,
    ([u]: [string, string]) => apiGet<CustomerDetail>(u),
    { revalidateOnFocus: false }
  );

  async function update(patch: Partial<{
    name: string; type: CustomerType; phone: string; email: string; address: string;
    notes: string; nextFollowUpAt: string | null; followUpNote: string;
  }>): Promise<ActionResult> {
    const r = toActionResult(await apiSend(path, 'PATCH', patch));
    if (r.success) mutate();
    return r;
  }
  async function remove(): Promise<ActionResult> {
    return toActionResult(await apiSend(path, 'DELETE'));
  }

  return { customer: data ?? null, isLoading, error: error as Error | undefined, refresh: () => mutate(), update, remove };
}
