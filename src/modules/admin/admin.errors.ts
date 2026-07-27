import { DomainException } from '../../common/errors/domain-exception';

export class AdminListingNotFoundException extends DomainException {
  constructor() {
    super('ADMIN_LISTING_NOT_FOUND', 'Listing not found', 404);
  }
}

export class AdminCategoryNotFoundException extends DomainException {
  constructor() {
    super('ADMIN_CATEGORY_NOT_FOUND', 'Category not found', 404);
  }
}

export class AdminUserNotFoundException extends DomainException {
  constructor() {
    super('ADMIN_USER_NOT_FOUND', 'User not found', 404);
  }
}
