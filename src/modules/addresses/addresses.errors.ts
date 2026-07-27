import { DomainException } from '../../common/errors/domain-exception';

export class AddressNotFoundException extends DomainException {
  constructor() {
    super('ADDRESS_NOT_FOUND', 'Address not found', 404);
  }
}

export class AddressForbiddenException extends DomainException {
  constructor() {
    super('ADDRESS_FORBIDDEN', 'You do not own this address', 403);
  }
}
