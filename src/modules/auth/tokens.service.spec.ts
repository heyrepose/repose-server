import { JwtService } from '@nestjs/jwt';
import { TokensService } from './tokens.service';
import { RefreshInvalidException } from './auth.errors';
import type { RedisService } from '../../redis/redis.service';
import type { JwtPayload } from './strategies/jwt.strategy';

/** Minimal in-memory Redis fake covering the surface TokensService uses. */
class FakeRedis {
  private kv = new Map<string, string>();
  private sets = new Map<string, Set<string>>();

  async get(k: string) {
    return this.kv.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.kv.set(k, v);
  }
  async del(...keys: string[]) {
    for (const k of keys) {
      this.kv.delete(k);
      this.sets.delete(k);
    }
  }
  async sadd(k: string, m: string) {
    if (!this.sets.has(k)) this.sets.set(k, new Set());
    this.sets.get(k)!.add(m);
  }
  async srem(k: string, m: string) {
    this.sets.get(k)?.delete(m);
  }
  async smembers(k: string) {
    return Array.from(this.sets.get(k) ?? []);
  }
}

describe('TokensService', () => {
  const config = {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        JWT_ACCESS_SECRET: 'test-secret',
        JWT_ACCESS_TTL: 900,
        JWT_REFRESH_TTL: 2592000,
        JWT_ACCESS_PRIVATE_KEY: undefined,
      };
      return map[key];
    },
  };

  const payload: JwtPayload = { sub: 'user-1', role: 'USER' };
  let service: TokensService;
  let redis: FakeRedis;

  const buildPayload = async (): Promise<JwtPayload> => payload;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new TokensService(
      new JwtService({}),
      redis as unknown as RedisService,
      config as never,
    );
  });

  it('issues a valid access + refresh pair', async () => {
    const pair = await service.issueTokenPair(payload);
    expect(pair.accessToken.split('.')).toHaveLength(3);
    expect(pair.refreshToken.startsWith('user-1.')).toBe(true);
  });

  it('rotates a refresh token and invalidates the old one', async () => {
    const { refreshToken } = await service.issueTokenPair(payload);
    const rotated = await service.rotate(refreshToken, buildPayload);
    expect(rotated.refreshToken).not.toEqual(refreshToken);

    // Old token is now unknown -> reuse -> revoke all -> throws.
    await expect(service.rotate(refreshToken, buildPayload)).rejects.toBeInstanceOf(
      RefreshInvalidException,
    );
  });

  it('detects reuse and revokes the whole chain', async () => {
    const { refreshToken } = await service.issueTokenPair(payload);
    const rotated = await service.rotate(refreshToken, buildPayload);

    // Replaying the original (already-rotated) token triggers reuse detection...
    await expect(service.rotate(refreshToken, buildPayload)).rejects.toBeInstanceOf(
      RefreshInvalidException,
    );
    // ...which also invalidates the freshly rotated token.
    await expect(service.rotate(rotated.refreshToken, buildPayload)).rejects.toBeInstanceOf(
      RefreshInvalidException,
    );
  });

  it('rejects malformed refresh tokens', async () => {
    await expect(service.rotate('garbage', buildPayload)).rejects.toBeInstanceOf(
      RefreshInvalidException,
    );
  });

  it('revoke removes only the presented session', async () => {
    const a = await service.issueTokenPair(payload);
    const b = await service.issueTokenPair(payload);
    await service.revoke(a.refreshToken);
    // b still rotates fine
    const rotated = await service.rotate(b.refreshToken, buildPayload);
    expect(rotated.accessToken).toBeDefined();
    // a is gone
    await expect(service.rotate(a.refreshToken, buildPayload)).rejects.toBeInstanceOf(
      RefreshInvalidException,
    );
  });
});
