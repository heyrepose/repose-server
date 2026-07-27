import { generateUsername, isValidUsername } from './username.util';

describe('username.util', () => {
  it('slugifies a display name with a random suffix', () => {
    const u = generateUsername('Amara Studio');
    expect(u).toMatch(/^amara\.studio\.[0-9a-f]{4}$/);
  });

  it('falls back to "user" for empty seeds', () => {
    expect(generateUsername('!!!')).toMatch(/^user\.[0-9a-f]{4}$/);
  });

  it('accepts valid usernames', () => {
    expect(isValidUsername('amara.studio')).toBe(true);
    expect(isValidUsername('a_b.c9')).toBe(true);
  });

  it('rejects invalid usernames', () => {
    expect(isValidUsername('.leading')).toBe(false);
    expect(isValidUsername('trailing.')).toBe(false);
    expect(isValidUsername('ab')).toBe(false); // 3-char minimum
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('Has Space')).toBe(false);
    expect(isValidUsername('UPPER')).toBe(false);
  });
});
