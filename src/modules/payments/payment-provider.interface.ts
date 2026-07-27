import { Decimal } from '@prisma/client/runtime/library';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentIntentInput {
  orderId: string;
  amountAed: Decimal;
  idempotencyKey: string;
}

export interface CreatePaymentIntentResult {
  providerIntentId: string;
  clientSecret: string;
}

export interface CreateConnectOnboardingInput {
  userId: string;
  existingAccountId: string | null;
  returnUrl: string;
  refreshUrl: string;
}

export interface CreateConnectOnboardingResult {
  stripeAccountId: string;
  onboardingUrl: string;
}

export interface CreatePayoutInput {
  stripeAccountId: string;
  amountAed: Decimal;
}

export interface ConstructedWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface PaymentProvider {
  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<CreatePaymentIntentResult>;
  createConnectOnboardingLink(
    input: CreateConnectOnboardingInput,
  ): Promise<CreateConnectOnboardingResult>;
  createPayout(input: CreatePayoutInput): Promise<{ id: string }>;
  constructWebhookEvent(
    rawBody: Buffer | string,
    signature: string | undefined,
  ): ConstructedWebhookEvent;
}
