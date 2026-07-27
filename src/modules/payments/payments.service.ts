import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ListingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomUUID } from 'crypto';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { ListingEvents } from '../search/search.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStateMachine } from '../orders/order-state-machine.service';
import { WalletService } from '../wallet/wallet.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './payment-provider.interface';
import {
  PaymentDevConfirmUnavailableException,
  PaymentForbiddenException,
  PaymentNotFoundException,
  PaymentOrderNotPendingException,
} from './payments.errors';
import { StripePaymentProvider } from './stripe-payment.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly stripeProvider: StripePaymentProvider,
    @Inject(forwardRef(() => OrderStateMachine))
    private readonly stateMachine: OrderStateMachine,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => WalletService))
    private readonly wallet: WalletService,
    private readonly events: EventEmitter2,
    private readonly cart: CartService,
  ) {}

  getConfig() {
    const mock = this.stripeProvider.isMock();
    return {
      mode: mock ? ('mock' as const) : ('stripe' as const),
      publishableKey: mock
        ? undefined
        : this.config.get('STRIPE_PUBLISHABLE_KEY', { infer: true }),
    };
  }

  async createIntentForOrder(orderId: string, amountAed: Decimal) {
    const intent = await this.provider.createPaymentIntent({
      orderId,
      amountAed,
      idempotencyKey: `order_${orderId}`,
    });

    await this.prisma.payment.create({
      data: {
        orderId,
        provider: 'stripe',
        providerIntentId: intent.providerIntentId,
        amountAed,
        status: PaymentStatus.REQUIRES_ACTION,
      },
    });

    return intent;
  }

  createConnectOnboardingLink(
    input: Parameters<PaymentProvider['createConnectOnboardingLink']>[0],
  ) {
    return this.provider.createConnectOnboardingLink(input);
  }

  createPayout(input: Parameters<PaymentProvider['createPayout']>[0]) {
    return this.provider.createPayout(input);
  }

  /**
   * Dev-only: synthesize a Stripe webhook so the mock payment path can
   * exercise SUCCESS / DECLINED without a real Stripe client.
   */
  async confirmDev(
    userId: string,
    orderId: string,
    outcome: 'SUCCESS' | 'DECLINED',
  ) {
    if (!this.stripeProvider.isMock()) {
      throw new PaymentDevConfirmUnavailableException();
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw new PaymentNotFoundException();
    if (order.buyerId !== userId) throw new PaymentForbiddenException();
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new PaymentOrderNotPendingException();
    }
    if (!order.payment) throw new PaymentNotFoundException();

    const type =
      outcome === 'SUCCESS'
        ? 'payment_intent.succeeded'
        : 'payment_intent.payment_failed';

    const payload = {
      id: `evt_mock_${randomUUID()}`,
      type,
      data: {
        object: {
          id: order.payment.providerIntentId,
          last_payment_error:
            outcome === 'DECLINED'
              ? { message: 'Your card was declined (mock).' }
              : undefined,
        },
      },
    };

    await this.handleWebhook(JSON.stringify(payload), undefined);
    const refreshed = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payment: true },
    });

    return {
      orderId: refreshed.id,
      status: refreshed.status,
      paymentStatus: refreshed.payment?.status ?? null,
    };
  }

  async handleWebhook(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): Promise<{ received: true }> {
    const event = this.provider.constructWebhookEvent(rawBody, signature);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider: 'stripe',
          eventId: event.id,
          type: event.type,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.debug(`Duplicate webhook ${event.id} ignored`);
        return { received: true };
      }
      throw err;
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.onPaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await this.onChargeRefunded(event.data.object);
        break;
      case 'account.updated':
        await this.onAccountUpdated(event.data.object);
        break;
      case 'transfer.created':
        this.logger.debug(`transfer.created ${event.id}`);
        break;
      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
    }

    return { received: true };
  }

  private async onPaymentSucceeded(obj: Record<string, unknown>): Promise<void> {
    const intentId = String(obj.id ?? '');
    const payment = await this.prisma.payment.findFirst({
      where: { providerIntentId: intentId },
      include: {
        order: {
          include: {
            items: { include: { listing: true } },
          },
        },
      },
    });
    if (!payment) {
      this.logger.warn(`PaymentIntent ${intentId} has no matching Payment row`);
      return;
    }
    if (payment.status === PaymentStatus.CAPTURED) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CAPTURED,
        capturedAt: new Date(),
      },
    });

    if (payment.order.status === OrderStatus.PENDING_PAYMENT) {
      await this.stateMachine.transition(
        payment.orderId,
        OrderStatus.PAID_HELD,
        null,
        'Payment captured',
      );
    }

    const now = new Date();
    const listingIds: string[] = [];
    for (const item of payment.order.items) {
      listingIds.push(item.listingId);
      const result = await this.prisma.listing.updateMany({
        where: { id: item.listingId, status: ListingStatus.ACTIVE },
        data: { status: ListingStatus.SOLD, soldAt: now },
      });
      if (result.count > 0) {
        this.events.emit(ListingEvents.Removed, { listingId: item.listingId });
      }

      await this.notifications.dispatch({
        userId: item.sellerId,
        type: 'ITEM_SOLD',
        title: 'Item sold',
        body: 'Your listing has been sold and payment is held until delivery.',
        data: { route: 'order', orderId: payment.orderId },
      });
    }

    await this.cart.clearListingsForUser(payment.order.buyerId, listingIds);

    await this.notifications.dispatch({
      userId: payment.order.buyerId,
      type: 'ORDER_UPDATE',
      title: 'Order confirmed',
      body: 'Payment received. The seller will ship your item soon.',
      data: { route: 'order', orderId: payment.orderId },
    });
  }

  private async onPaymentFailed(obj: Record<string, unknown>): Promise<void> {
    const intentId = String(obj.id ?? '');
    const lastError = obj.last_payment_error as
      | { message?: string }
      | undefined;
    await this.prisma.payment.updateMany({
      where: { providerIntentId: intentId },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: lastError?.message ?? 'Payment failed',
      },
    });
  }

  private async onChargeRefunded(obj: Record<string, unknown>): Promise<void> {
    const paymentIntentId =
      typeof obj.payment_intent === 'string'
        ? obj.payment_intent
        : (obj.payment_intent as { id?: string } | undefined)?.id;
    if (!paymentIntentId) return;

    const payment = await this.prisma.payment.findFirst({
      where: { providerIntentId: paymentIntentId },
      include: { order: true },
    });
    if (!payment) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
      },
    });

    if (
      payment.order.status !== OrderStatus.REFUNDED &&
      payment.order.status !== OrderStatus.CANCELLED
    ) {
      try {
        await this.stateMachine.transition(
          payment.orderId,
          OrderStatus.REFUNDED,
          null,
          'Charge refunded via Stripe',
        );
      } catch (err) {
        this.logger.warn(
          `Could not transition order ${payment.orderId} to REFUNDED: ${(err as Error).message}`,
        );
      }
    }
  }

  private async onAccountUpdated(obj: Record<string, unknown>): Promise<void> {
    const accountId = String(obj.id ?? '');
    const chargesEnabled = Boolean(obj.charges_enabled);
    const payoutsEnabled = Boolean(obj.payouts_enabled);
    if (chargesEnabled && payoutsEnabled && accountId) {
      await this.wallet.markOnboardingComplete(accountId);
    }
  }
}
