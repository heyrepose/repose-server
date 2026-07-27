import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_SOFT_AUTH_KEY } from '../decorators/soft-auth.decorator';

/**
 * Global auth guard.
 * - `@Public()` routes are always allowed.
 * - `@SoftAuth()` routes are allowed with or without a token; the user is
 *   attached if a valid token is present, but a missing/invalid token never
 *   rejects the request (browse-without-account).
 * - Everything else requires a valid access token.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isSoft = this.reflector.getAllAndOverride<boolean>(IS_SOFT_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const result = super.canActivate(context);
    if (!isSoft) return result;

    // Soft auth: never reject the request — missing/invalid token simply means guest.
    return Promise.resolve(result as Promise<boolean> | boolean).catch(() => true);
  }

  handleRequest<TUser>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const isSoft = this.reflector.getAllAndOverride<boolean>(IS_SOFT_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSoft) {
      // Attach the user if present, but never reject when absent/invalid.
      return (user ?? undefined) as TUser;
    }
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user;
  }
}
