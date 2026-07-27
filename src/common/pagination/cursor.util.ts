/**
 * Cursor helpers. Two flavours:
 * - keyset: opaque `(publishedAt,id)` cursor for stable, gap-free feed paging.
 * - offset: opaque numeric offset used where the backing store (Meilisearch)
 *   only supports offset paging.
 */

export interface KeysetCursor {
  publishedAt: string;
  id: string;
}

export function encodeKeyset(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeKeyset(raw?: string): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed?.publishedAt === 'string' && typeof parsed?.id === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeOffset(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export function decodeOffset(raw?: string): number {
  if (!raw) return 0;
  try {
    const n = parseInt(Buffer.from(raw, 'base64url').toString('utf8'), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}
