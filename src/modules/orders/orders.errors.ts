import { DomainException } from '../../common/errors/domain-exception';

export class OrderNotFoundException extends DomainException {
  constructor() {
    super('ORDER_NOT_FOUND', 'Order not found', 404);
  }
}

export class OrderForbiddenException extends DomainException {
  constructor() {
    super('ORDER_FORBIDDEN', 'You are not a party to this order', 403);
  }
}

export class OrderInvalidTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super(
      'ORDER_INVALID_TRANSITION',
      `Cannot transition order from ${from} to ${to}`,
      422,
      { from, to },
    );
  }
}

export class OrderNotCancellableException extends DomainException {
  constructor() {
    super(
      'ORDER_NOT_CANCELLABLE',
      'Order can only be cancelled while PENDING_PAYMENT',
      409,
    );
  }
}

export class OrderNotShippableException extends DomainException {
  constructor() {
    super('ORDER_NOT_SHIPPABLE', 'Order cannot be marked as shipped', 422);
  }
}
