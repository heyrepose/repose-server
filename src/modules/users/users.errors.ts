import { DomainException } from '../../common/errors/domain-exception';

export class UserNotFoundException extends DomainException {
  constructor() {
    super('USER_NOT_FOUND', 'User not found', 404);
  }
}

export class UsernameTakenException extends DomainException {
  constructor() {
    super('USER_USERNAME_TAKEN', 'Username is already taken', 409);
  }
}

export class UsernameInvalidException extends DomainException {
  constructor() {
    super(
      'USER_USERNAME_INVALID',
      'Username must be 3-30 chars: lowercase letters, digits, dot or underscore, not starting/ending with a separator',
      400,
    );
  }
}
