import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../../config/configuration';

export interface JwtPayload {
  sub: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

function resolveVerifyKey(config: ConfigService<AppConfig, true>): string {
  const pub = config.get('JWT_ACCESS_PUBLIC_KEY', { infer: true });
  if (pub) return pub.replace(/\\n/g, '\n');
  return config.get('JWT_ACCESS_SECRET', { infer: true });
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<AppConfig, true>) {
    const pub = config.get('JWT_ACCESS_PUBLIC_KEY', { infer: true });
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveVerifyKey(config),
      algorithms: pub ? ['RS256'] : ['HS256'],
    });
  }

  validate(payload: JwtPayload) {
    if (!payload?.sub) throw new UnauthorizedException();
    return {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      phone: payload.phone,
    };
  }
}
