import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingStatus, OrderStatus, WalletTxType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { computeSellerNet } from '../orders/money.util';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class SellerDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async getDashboard(sellerId: string) {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    const [
      activeCount,
      draftCount,
      soldCount,
      viewsAgg,
      wallet,
      monthCredits,
      topListings,
      recentItems,
      dailyCredits,
    ] = await Promise.all([
      this.prisma.listing.count({
        where: { sellerId, status: ListingStatus.ACTIVE },
      }),
      this.prisma.listing.count({
        where: { sellerId, status: ListingStatus.DRAFT },
      }),
      this.prisma.listing.count({
        where: { sellerId, status: ListingStatus.SOLD },
      }),
      this.prisma.listing.aggregate({
        where: { sellerId },
        _sum: { viewCount: true },
      }),
      this.wallet.getWallet(sellerId),
      this.prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: sellerId },
          type: WalletTxType.SALE_CREDIT,
          createdAt: { gte: startOfMonth },
        },
        select: { amountAed: true },
      }),
      this.prisma.listing.findMany({
        where: {
          sellerId,
          status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
        },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        orderBy: [{ viewCount: 'desc' }, { soldAt: 'desc' }],
        take: 5,
      }),
      this.prisma.orderItem.findMany({
        where: {
          sellerId,
          order: {
            status: {
              in: [
                OrderStatus.PAID_HELD,
                OrderStatus.SHIPPED,
                OrderStatus.DELIVERED,
                OrderStatus.RELEASED,
              ],
            },
          },
        },
        include: {
          listing: { select: { title: true } },
          order: { select: { id: true, status: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.walletTransaction.findMany({
        where: {
          wallet: { userId: sellerId },
          type: WalletTxType.SALE_CREDIT,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { amountAed: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const salesAedThisMonth = monthCredits
      .reduce((sum, tx) => sum.plus(tx.amountAed), new Decimal(0))
      .toFixed(2);

    const byDay = new Map<string, { amount: Decimal; orderCount: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setUTCDate(thirtyDaysAgo.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { amount: new Decimal(0), orderCount: 0 });
    }
    for (const tx of dailyCredits) {
      const key = tx.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(key) ?? {
        amount: new Decimal(0),
        orderCount: 0,
      };
      row.amount = row.amount.plus(tx.amountAed);
      row.orderCount += 1;
      byDay.set(key, row);
    }

    const salesOverTime = [...byDay.entries()].map(([date, v]) => ({
      date,
      amountAed: v.amount.toFixed(2),
      orderCount: v.orderCount,
    }));

    return {
      overview: {
        activeCount,
        draftCount,
        soldCount,
        totalViews: viewsAgg._sum.viewCount ?? 0,
        balanceAed: wallet.balanceAed,
        pendingAed: wallet.pendingAed,
        salesAedThisMonth,
        onboardingComplete: wallet.onboardingComplete,
      },
      salesOverTime,
      topListings: topListings.map((l) => ({
        id: l.id,
        title: l.title,
        mainImageUrl: l.images[0]?.url ?? null,
        viewCount: l.viewCount,
        status: l.status,
        priceAed: l.priceAed?.toFixed(2) ?? null,
      })),
      recentSales: recentItems.map((item) => {
        const rate = this.config.get('COMMISSION_RATE', { infer: true });
        const net = computeSellerNet(item.priceAed, rate);
        return {
          orderId: item.order.id,
          listingTitle: item.listing.title,
          amountAed: net.toFixed(2),
          grossAed: item.priceAed.toFixed(2),
          status: item.order.status,
          createdAt: item.order.createdAt.toISOString(),
        };
      }),
    };
  }
}
