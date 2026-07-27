import { DomainException } from '../../common/errors/domain-exception';

export class WalletInsufficientBalanceException extends DomainException {
  constructor() {
    super(
      'WALLET_INSUFFICIENT_BALANCE',
      'Insufficient available wallet balance',
      422,
    );
  }
}

export class WalletOnboardingIncompleteException extends DomainException {
  constructor() {
    super(
      'WALLET_ONBOARDING_INCOMPLETE',
      'Complete Stripe Connect onboarding before this action',
      422,
    );
  }
}

export class WalletNotFoundException extends DomainException {
  constructor() {
    super('WALLET_NOT_FOUND', 'Seller wallet not found', 404);
  }
}
