import { randomBytes } from 'crypto';

/**
 * Derives a public handle from a display name plus a short random suffix, e.g.
 * "Amara Studio" -> "amara.studio.4f2a". Users can change it later via
 * PATCH /users/me (subject to a uniqueness check).
 */
export function generateUsername(seed: string, longSuffix = false): string {
  const base =
    seed
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 20) || 'user';
  const suffix = randomBytes(longSuffix ? 4 : 2).toString('hex');
  return `${base}.${suffix}`;
}

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}
