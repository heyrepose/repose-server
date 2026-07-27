import { DomainException } from '../../common/errors/domain-exception';

export class ReviewAlreadySubmittedException extends DomainException {
  constructor() {
    super(
      'REVIEW_ALREADY_SUBMITTED',
      'You have already submitted a review for this order',
      409,
    );
  }
}

export class ReviewOrderNotEligibleException extends DomainException {
  constructor() {
    super(
      'REVIEW_ORDER_NOT_ELIGIBLE',
      'Order must be DELIVERED or RELEASED before reviewing',
      422,
    );
  }
}

export class ReviewForbiddenException extends DomainException {
  constructor() {
    super(
      'REVIEW_FORBIDDEN',
      'Only the buyer may review the seller for this order',
      403,
    );
  }
}

export class ReviewOrderNotFoundException extends DomainException {
  constructor() {
    super('ORDER_NOT_FOUND', 'Order not found', 404);
  }
}
