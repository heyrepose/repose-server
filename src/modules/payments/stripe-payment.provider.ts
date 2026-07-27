import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import type { AppConfig } from '../../config/configuration';
import { DomainException } from '../../common/errors/domain-exception';
import { toFils } from '../orders/money.util';
import {
  ConstructedWebhookEvent,
  CreateConnectOnboardingInput,
  CreateConnectOnboardingResult,
  CreatePaymentIntentInput,
  CreatePaymentIntentResult,
  CreatePayoutInput,
  PaymentProvider,
} from './payment-provider.interface';

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly mock: boolean;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const secret = this.config.get('STRIPE_SECRET_KEY', { infer: true });
    this.webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET', {
      infer: true,
    });
    this.mock = !secret;
    this.stripe = secret
      ? new Stripe(secret, { apiVersion: '2025-02-24.acacia' })
      : null;
    if (this.mock) {
      this.logger.warn(
        'STRIPE_SECRET_KEY missing — using mock payment provider for local dev',
      );
    }
  }

  isMock(): boolean {
    return this.mock;
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResult> {
    if (this.mock || !this.stripe) {
      const id = `pi_mock_${input.orderId.replace(/-/g, '').slice(0, 16)}`;
      return {
        providerIntentId: id,
        clientSecret: `${id}_secret_mock`,
      };
    }

    const intent = await this.stripe.paymentIntents.create(
      {
        amount: toFils(input.amountAed),
        currency: 'aed',
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: input.orderId },
        transfer_group: input.orderId,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (!intent.client_secret) {
      throw new DomainException(
        'PAYMENT_INTENT_FAILED',
        'Stripe did not return a client secret',
        502,
      );
    }

    return {
      providerIntentId: intent.id,
      clientSecret: intent.client_secret,
    };
  }

  async createConnectOnboardingLink(
    input: CreateConnectOnboardingInput,
  ): Promise<CreateConnectOnboardingResult> {
    if (this.mock || !this.stripe) {
      const accountId =
        input.existingAccountId ?? `acct_mock_${input.userId.slice(0, 8)}`;
      return {
        stripeAccountId: accountId,
        onboardingUrl: `https://connect.stripe.com/setup/mock/${accountId}`,
      };
    }

    let accountId = input.existingAccountId;
    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'AE',
        capabilities: {
          transfers: { requested: true },
        },
        metadata: { userId: input.userId },
      });
      accountId = account.id;
    }

    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      type: 'account_onboarding',
    });

    return { stripeAccountId: accountId, onboardingUrl: link.url };
  }

  async createPayout(input: CreatePayoutInput): Promise<{ id: string }> {
    if (this.mock || !this.stripe) {
      return { id: `po_mock_${randomUUID().slice(0, 8)}` };
    }

    // Transfer platform → connected account; seller withdraws via Stripe Express.
    const transfer = await this.stripe.transfers.create({
      amount: toFils(input.amountAed),
      currency: 'aed',
      destination: input.stripeAccountId,
    });
    return { id: transfer.id };
  }

  constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): ConstructedWebhookEvent {
    if (this.mock || !this.stripe || !this.webhookSecret) {
      const parsed = JSON.parse(
        typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
      ) as {
        id?: string;
        type?: string;
        data?: { object?: Record<string, unknown> };
      };
      return {
        id: parsed.id ?? `evt_mock_${randomUUID()}`,
        type: parsed.type ?? 'unknown',
        data: { object: parsed.data?.object ?? {} },
      };
    }

    if (!signature) {
      throw new DomainException(
        'PAYMENT_WEBHOOK_INVALID',
        'Missing Stripe-Signature header',
        400,
      );
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
      return {
        id: event.id,
        type: event.type,
        data: {
          object: event.data.object as unknown as Record<string, unknown>,
        },
      };
    } catch {
      throw new DomainException(
        'PAYMENT_WEBHOOK_INVALID',
        'Invalid Stripe webhook signature',
        400,
      );
    }
  }
}
