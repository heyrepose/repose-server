import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';

/**
 * Resolve JWT verify options to match TokensService / JwtStrategy
 * (RS256 when a public key is set, otherwise HS256 with the shared secret).
 */
export function resolveJwtVerifyOptions(config: ConfigService<AppConfig, true>): {
  secret: string;
  algorithms: ('RS256' | 'HS256')[];
} {
  const pub = config.get('JWT_ACCESS_PUBLIC_KEY', { infer: true });
  if (pub) {
    return {
      secret: pub.replace(/\\n/g, '\n'),
      algorithms: ['RS256'],
    };
  }
  return {
    secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
    algorithms: ['HS256'],
  };
}

/** Extract bearer / handshake token from a Socket.IO client handshake. */
export function extractSocketToken(handshake: {
  auth?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): string | null {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = handshake.headers?.authorization ?? handshake.headers?.Authorization;
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}
