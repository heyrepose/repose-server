import { SetMetadata } from '@nestjs/common';

export const IS_SOFT_AUTH_KEY = 'isSoftAuth';

/**
 * Marks a route as soft-authenticated: it succeeds without a token, but if a
 * valid token is present the user is attached to the request (browse endpoints).
 */
export const SoftAuth = () => SetMetadata(IS_SOFT_AUTH_KEY, true);
