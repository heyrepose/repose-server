import { validateEnv } from './configuration';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  };

  it('applies defaults for optional vars', () => {
    const cfg = validateEnv({ ...base });
    expect(cfg.PORT).toBe(4000);
    expect(cfg.OTP_DELIVERY_PROVIDER).toBe('console');
    expect(cfg.COMMISSION_RATE).toBe(0.1);
    expect(cfg.NODE_ENV).toBe('development');
  });

  it('coerces numeric strings', () => {
    const cfg = validateEnv({ ...base, PORT: '4000', COMMISSION_RATE: '0.15' });
    expect(cfg.PORT).toBe(4000);
    expect(cfg.COMMISSION_RATE).toBe(0.15);
  });

  it('throws on a missing required var (DATABASE_URL)', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid OTP provider', () => {
    expect(() => validateEnv({ ...base, OTP_DELIVERY_PROVIDER: 'carrier' })).toThrow();
  });
});
