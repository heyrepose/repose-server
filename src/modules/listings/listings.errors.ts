import { DomainException } from '../../common/errors/domain-exception';

export class ListingNotFoundException extends DomainException {
  constructor() {
    super('LISTING_NOT_FOUND', 'Listing not found', 404);
  }
}

export class ListingForbiddenException extends DomainException {
  constructor() {
    super('LISTING_FORBIDDEN', 'You do not own this listing', 403);
  }
}

export class ListingTooManyPhotosException extends DomainException {
  constructor() {
    super('LISTING_TOO_MANY_PHOTOS', 'Maximum of 5 photos per listing', 422);
  }
}

export class ListingInvalidImageUrlException extends DomainException {
  constructor() {
    super(
      'LISTING_INVALID_IMAGE_URL',
      'Image URL must belong to the Repose Cloudinary cloud and listing folder',
      422,
    );
  }
}

export class ListingMissingPhotosException extends DomainException {
  constructor() {
    super('LISTING_MISSING_PHOTOS', 'At least one photo is required to publish', 422);
  }
}

export class ListingInvalidPriceException extends DomainException {
  constructor() {
    super('LISTING_INVALID_PRICE', 'priceAed must be greater than 0', 422);
  }
}

export class ListingMissingCategoryException extends DomainException {
  constructor() {
    super('LISTING_MISSING_CATEGORY', 'categoryId is required to publish', 422);
  }
}

export class ListingHasOpenOrderException extends DomainException {
  constructor() {
    super('LISTING_HAS_OPEN_ORDER', 'Listing has an open order and cannot be removed', 409);
  }
}

export class ListingNotAvailableException extends DomainException {
  constructor() {
    super('LISTING_NOT_AVAILABLE', 'Listing is not available for purchase', 409);
  }
}

export class ListingCannotReportOwnException extends DomainException {
  constructor() {
    super('LISTING_CANNOT_REPORT_OWN', 'You cannot report your own listing', 422);
  }
}

export class ListingNotReportableException extends DomainException {
  constructor() {
    super(
      'LISTING_NOT_REPORTABLE',
      'Only active listings can be reported',
      422,
    );
  }
}
