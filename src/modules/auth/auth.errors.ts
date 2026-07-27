import { DomainException } from '../../common/errors/domain-exception';

export class PhoneTakenException extends DomainException {
  constructor() {
    super('AUTH_PHONE_TAKEN', 'Phone number already registered', 409);
  }
}

export class EmailTakenException extends DomainException {
  constructor() {
    super('AUTH_EMAIL_TAKEN', 'Email already registered', 409);
  }
}

export class OtpRateLimitedException extends DomainException {
  constructor() {
    super('AUTH_OTP_RATE_LIMITED', 'Please wait before requesting another code', 429);
  }
}

export class OtpInvalidException extends DomainException {
  constructor() {
    super('AUTH_OTP_INVALID', "OTP code doesn't match", 400);
  }
}

export class OtpExpiredException extends DomainException {
  constructor() {
    super('AUTH_OTP_EXPIRED', 'OTP has expired', 400);
  }
}

export class OtpTooManyAttemptsException extends DomainException {
  constructor() {
    super('AUTH_OTP_TOO_MANY_ATTEMPTS', 'Too many attempts, request a new code', 429);
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);
  }
}

export class AccountSuspendedException extends DomainException {
  constructor() {
    super('AUTH_ACCOUNT_SUSPENDED', 'Account is suspended', 403);
  }
}

export class RefreshInvalidException extends DomainException {
  constructor() {
    super('AUTH_REFRESH_INVALID', 'Refresh token invalid, expired, or reused', 401);
  }
}
