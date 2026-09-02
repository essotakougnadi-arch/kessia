// ============================================================
// KESSIA — GET /api/v1/business/[id]
// Dashboard d'un business (KPIs, ventes, dépenses, produits)
// ============================================================

import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { assertOwnership } from '@/lib/auth/middleware';
import prisma from '@/lib/db/prisma';
import { ok, notFound, forbidden, serverError } from '@/lib/utils/response';
import { logApiError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { error, context } = await withAuth(request);
    if (error || !context) return error!;

    const business = await prisma.business.findUnique({
      where: { id: params.id },
    });

    if (!business) return notFound('Business introuvable.');
    if (!assertOwnership(context, business.userId)) return forbidden();

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todaySales,
      monthSales,
      monthExpenses,
      totalTransactions,
      topProducts,
      lowStockProducts,
      recentSales,
      products,
    ] = await Promise.all([
      // Ventes du jour
      prisma.sale.aggregate({
        where: { businessId: params.id, status: 'COMPLETED', createdAt: { gte: startOfDay } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Ventes du mois
      prisma.sale.aggregate({
        where: { businessId: params.id, status: 'COMPLETED', createdAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Dépenses du mois
      prisma.expense.aggregate({
        where: { businessId: params.id, date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      // Total transactions
      prisma.sale.count({ where: { businessId: params.id, status: 'COMPLETED' } }),
      // Top produits
      prisma.saleItem.groupBy({
        by: ['productId'],
        where: { sale: { businessId: params.id, status: 'COMPLETED', createdAt: { gte: startOfMonth } } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 5,
      }),
      // Produits en rupture de stock
      prisma.product.findMany({
        where: { businessId: params.id, isActive: true, stock: { lte: 5 } },
        select: { id: true, name: true, stock: true },
        orderBy: { stock: 'asc' },
        take: 10,
      }),
      // Ventes récentes
      prisma.sale.findMany({
        where: { businessId: params.id },
        include: {
          customer: { select: { id: true, name: true } },
          items: { include: { product: { select: { name: true } } }, take: 3 },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      // Tous les produits
      prisma.product.findMany({
        where: { businessId: params.id, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Résoudre les noms des top produits
    const productIds = topProducts.map((p) => p.productId);
    const productNames = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productNameMap = Object.fromEntries(productNames.map((p) => [p.id, p.name]));

    const monthSalesAmount = Number(monthSales._sum.totalAmount ?? 0);
    const monthExpensesAmount = Number(monthExpenses._sum.amount ?? 0);

    return ok({
      business: {
        ...business,
      },
      dashboard: {
        todaySales: Number(todaySales._sum.totalAmount ?? 0),
        todaySalesCount: todaySales._count,
        monthSales: monthSalesAmount,
        monthSalesCount: monthSales._count,
        monthExpenses: monthExpensesAmount,
        estimatedMargin: monthSalesAmount - monthExpensesAmount,
        totalTransactions,
        topProducts: topProducts.map((p) => ({
          productId: p.productId,
          name: productNameMap[p.productId] ?? 'Inconnu',
          count: p._sum.quantity ?? 0,
          revenue: Number(p._sum.totalPrice ?? 0),
        })),
        lowStockProducts,
        recentSales: recentSales.map((s) => ({
          ...s,
          totalAmount: Number(s.totalAmount),
        })),
        productsCount: products.length,
      },
    });
  } catch (error) {
    logApiError('/v1/business/[id]', error);
    return serverError();
  }
}
