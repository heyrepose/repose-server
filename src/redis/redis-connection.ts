/**
 * Build Redis connection fields from REDIS_URL for ioredis / BullMQ.
 * Railway Redis often uses `rediss://` (TLS).
 */
export function redisConnectionFromUrl(url: string): {
  url: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  tls?: { rejectUnauthorized: boolean };
} {
  const trimmed = url.trim();
  const useTls = trimmed.startsWith('rediss://');

  return {
    url: trimmed,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...(useTls
      ? {
          tls: {
            rejectUnauthorized: true,
          },
        }
      : {}),
  };
}
