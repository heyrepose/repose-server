import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../redis/redis.service';
import type { AppConfig } from '../../config/configuration';
import { RefreshInvalidException } from './auth.errors';
import type { JwtPayload } from './strategies/jwt.strategy';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Access tokens: short-lived JWT (RS256 if keys configured, else HS256 dev secret).
 * Refresh tokens: opaque `${userId}.${tokenId}.${secret}`, only the SHA-256 hash is
 * stored in Redis. Rotation is one-time-use; presenting an unknown token for a user
 * who has (or had) sessions is treated as reuse and revokes the whole chain.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private accessSignOptions() {
    const priv = this.config.get('JWT_ACCESS_PRIVATE_KEY', { infer: true });
    const ttl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    if (priv) {
      return {
        algorithm: 'RS256' as const,
        privateKey: priv.replace(/\\n/g, '\n'),
        expiresIn: ttl,
      };
    }
    return {
      algorithm: 'HS256' as const,
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: ttl,
    };
  }

  async issueAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, this.accessSignOptions());
  }

  private refreshKey(userId: string, tokenId: string): string {
    return `refresh:${userId}:${tokenId}`;
  }

  private userSessionsKey(userId: string): string {
    return `refresh:sessions:${userId}`;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async issueTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const accessToken = await this.issueAccessToken(payload);
    const refreshToken = await this.createRefreshToken(payload.sub);
    return { accessToken, refreshToken };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const tokenId = uuidv4();
    const secret = randomBytes(32).toString('hex');
    const token = `${userId}.${tokenId}.${secret}`;
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    await this.redis.set(this.refreshKey(userId, tokenId), this.hash(token), ttl);
    await this.redis.sadd(this.userSessionsKey(userId), tokenId);
    return token;
  }

  /** Rotates a refresh token, returning a fresh pair. Detects reuse. */
  async rotate(
    presented: string,
    buildPayload: (userId: string) => Promise<JwtPayload>,
  ): Promise<TokenPair> {
    const parts = presented.split('.');
    if (parts.length !== 3) throw new RefreshInvalidException();
    const [userId, tokenId] = parts;

    const stored = await this.redis.get(this.refreshKey(userId, tokenId));
    if (!stored) {
      // Unknown token for a user with existing sessions => reuse => revoke all.
      const sessions = await this.redis.smembers(this.userSessionsKey(userId));
      if (sessions.length > 0) await this.revokeAll(userId);
      throw new RefreshInvalidException();
    }
    if (stored !== this.hash(presented)) {
      await this.revokeAll(userId);
      throw new RefreshInvalidException();
    }

    // One-time use: delete the presented token before issuing a new one.
    await this.redis.del(this.refreshKey(userId, tokenId));
    await this.redis.srem(this.userSessionsKey(userId), tokenId);

    const payload = await buildPayload(userId);
    const accessToken = await this.issueAccessToken(payload);
    const refreshToken = await this.createRefreshToken(userId);
    return { accessToken, refreshToken };
  }

  async revoke(presented: string): Promise<void> {
    const parts = presented.split('.');
    if (parts.length !== 3) return;
    const [userId, tokenId] = parts;
    await this.redis.del(this.refreshKey(userId, tokenId));
    await this.redis.srem(this.userSessionsKey(userId), tokenId);
  }

  async revokeAll(userId: string): Promise<void> {
    const sessions = await this.redis.smembers(this.userSessionsKey(userId));
    const keys = sessions.map((tid) => this.refreshKey(userId, tid));
    if (keys.length) await this.redis.del(...keys);
    await this.redis.del(this.userSessionsKey(userId));
  }
}
