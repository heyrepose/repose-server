import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

/** Injects the authenticated user (or undefined on soft-auth routes without a token). */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
