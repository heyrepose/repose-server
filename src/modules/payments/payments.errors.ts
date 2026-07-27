import { DomainException } from '../../common/errors/domain-exception';

export class PaymentDevConfirmUnavailableException extends DomainException {
  constructor() {
    super(
      'PAYMENT_DEV_CONFIRM_UNAVAILABLE',
      'Dev payment confirm is only available in mock mode',
      404,
    );
  }
}

export class PaymentNotFoundException extends DomainException {
  constructor() {
    super('PAYMENT_NOT_FOUND', 'Payment not found for this order', 404);
  }
}

export class PaymentForbiddenException extends DomainException {
  constructor() {
    super('PAYMENT_FORBIDDEN', 'You are not the buyer of this order', 403);
  }
}

export class PaymentOrderNotPendingException extends DomainException {
  constructor() {
    super(
      'PAYMENT_ORDER_NOT_PENDING',
      'Order is not awaiting payment',
      409,
    );
  }
}
