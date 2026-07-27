import { DomainException } from '../../common/errors/domain-exception';

export class CartListingNotFoundException extends DomainException {
  constructor() {
    super('CART_LISTING_NOT_FOUND', 'Listing not found', 404);
  }
}

export class CartListingNotAvailableException extends DomainException {
  constructor() {
    super(
      'CART_LISTING_NOT_AVAILABLE',
      'Listing is not available to add to cart',
      409,
    );
  }
}

export class CartCannotAddOwnListingException extends DomainException {
  constructor() {
    super(
      'CART_CANNOT_ADD_OWN',
      'You cannot add your own listing to the cart',
      422,
    );
  }
}

export class CartItemNotFoundException extends DomainException {
  constructor() {
    super('CART_ITEM_NOT_FOUND', 'Cart item not found', 404);
  }
}
