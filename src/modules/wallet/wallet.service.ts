import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WalletTxType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import {
  WalletDevCompleteUnavailableException,
  WalletInsufficientBalanceException,
  WalletOnboardingIncompleteException,
} from './wallet.errors';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
  ) {}

  async getWallet(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const ledger = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      balanceAed: wallet.balanceAed.toFixed(2),
      pendingAed: wallet.pendingAed.toFixed(2),
      onboardingComplete: wallet.onboardingComplete,
      ledger: ledger.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amountAed: tx.amountAed.toFixed(2),
        referenceOrderId: tx.referenceOrderId,
        note: tx.note,
        availableAt: tx.availableAt?.toISOString() ?? null,
        createdAt: tx.createdAt.toISOString(),
      })),
    };
  }

  async startOnboarding(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const origins = this.config.get('CORS_ORIGINS', { infer: true }).split(',');
    const base = (origins[0] ?? 'http://localhost:4001').replace(/\/$/, '');
    const returnUrl = `${base}/profile/wallet?onboarded=1`;
    const refreshUrl = `${base}/profile/wallet?refresh=1`;

    const { onboardingUrl, stripeAccountId } =
      await this.payments.createConnectOnboardingLink({
        userId,
        existingAccountId: wallet.stripeAccountId,
        returnUrl,
        refreshUrl,
      });

    if (!wallet.stripeAccountId && stripeAccountId) {
      await this.prisma.sellerWallet.update({
        where: { id: wallet.id },
        data: { stripeAccountId },
      });
    }

    return { onboardingUrl };
  }

  async withdraw(userId: string, amountAedRaw: string) {
    const amount = new Decimal(amountAedRaw);
    if (amount.lte(0)) throw new WalletInsufficientBalanceException();

    const wallet = await this.ensureWallet(userId);
    if (!wallet.onboardingComplete || !wallet.stripeAccountId) {
      throw new WalletOnboardingIncompleteException();
    }
    if (wallet.balanceAed.lt(amount)) {
      throw new WalletInsufficientBalanceException();
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sellerWallet.updateMany({
        where: {
          id: wallet.id,
          balanceAed: { gte: amount },
        },
        data: {
          balanceAed: { decrement: amount },
        },
      });
      if (updated.count === 0) throw new WalletInsufficientBalanceException();

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTxType.WITHDRAWAL,
          amountAed: amount,
          note: 'Withdrawal to bank via Stripe Connect',
        },
      });
    });

    await this.payments.createPayout({
      stripeAccountId: wallet.stripeAccountId,
      amountAed: amount,
    });

    return { status: 'PROCESSING' as const };
  }

  /**
   * Credit seller proceeds as pending (clears to available after WALLET_CLEARANCE_DAYS).
   */
  async creditPending(
    sellerId: string,
    amountAed: Decimal,
    orderId: string,
  ): Promise<void> {
    if (amountAed.lte(0)) return;

    const clearanceDays = this.config.get('WALLET_CLEARANCE_DAYS', {
      infer: true,
    });
    const availableAt = new Date();
    availableAt.setUTCDate(availableAt.getUTCDate() + clearanceDays);

    const wallet = await this.ensureWallet(sellerId);

    await this.prisma.$transaction(async (tx) => {
      await tx.sellerWallet.update({
        where: { id: wallet.id },
        data: { pendingAed: { increment: amountAed } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTxType.SALE_CREDIT,
          amountAed,
          referenceOrderId: orderId,
          note: 'Sale credit (pending clearance)',
          availableAt,
        },
      });
    });
  }

  /** Move cleared SALE_CREDIT rows from pendingAed → balanceAed. */
  async releasePendingToAvailable(): Promise<number> {
    const due = await this.prisma.walletTransaction.findMany({
      where: {
        type: WalletTxType.SALE_CREDIT,
        availableAt: { lte: new Date() },
      },
      take: 200,
    });

    let released = 0;
    for (const tx of due) {
      await this.prisma.$transaction(async (db) => {
        const current = await db.walletTransaction.findUnique({
          where: { id: tx.id },
        });
        // availableAt null ⇒ already cleared (idempotent)
        if (!current?.availableAt || current.availableAt > new Date()) return;

        await db.sellerWallet.update({
          where: { id: current.walletId },
          data: {
            pendingAed: { decrement: current.amountAed },
            balanceAed: { increment: current.amountAed },
          },
        });
        await db.walletTransaction.update({
          where: { id: current.id },
          data: {
            availableAt: null,
            note: 'Sale credit (available)',
          },
        });
        released += 1;
      });
    }
    return released;
  }

  async markOnboardingComplete(stripeAccountId: string): Promise<void> {
    await this.prisma.sellerWallet.updateMany({
      where: { stripeAccountId },
      data: { onboardingComplete: true },
    });
  }

  /**
   * Dev-only: mark Connect onboarding complete without a real Stripe Account Link.
   * Mirrors POST /payments/dev/confirm for the mock payment path.
   */
  async completeOnboardingDev(userId: string) {
    if (!this.payments.isMockMode()) {
      throw new WalletDevCompleteUnavailableException();
    }

    const wallet = await this.ensureWallet(userId);
    const stripeAccountId =
      wallet.stripeAccountId ?? `acct_mock_${userId.replace(/-/g, '').slice(0, 16)}`;

    const updated = await this.prisma.sellerWallet.update({
      where: { id: wallet.id },
      data: {
        stripeAccountId,
        onboardingComplete: true,
      },
    });

    return {
      onboardingComplete: updated.onboardingComplete,
      stripeAccountId: updated.stripeAccountId,
    };
  }

  async requireOnboardingComplete(userId: string): Promise<void> {
    const wallet = await this.ensureWallet(userId);
    if (!wallet.onboardingComplete) {
      throw new WalletOnboardingIncompleteException();
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cronReleasePending(): Promise<void> {
    try {
      const n = await this.releasePendingToAvailable();
      if (n > 0) this.logger.log(`Released ${n} pending wallet credits`);
    } catch (err) {
      this.logger.warn(
        `Wallet clearance cron failed: ${(err as Error).message}`,
      );
    }
  }

  async ensureWallet(userId: string) {
    const existing = await this.prisma.sellerWallet.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    return this.prisma.sellerWallet.create({
      data: { userId },
    });
  }
}
