import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring a valid JWT (JwtAuthGuard skips it). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
