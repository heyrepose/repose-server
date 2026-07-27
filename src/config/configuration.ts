import { z } from 'zod';

/**
 * Env schema — validated on boot so a missing/invalid var fails fast at startup
 * rather than surfacing as a runtime 500 in production.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:4001'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT — access is RS256 when keys provided, otherwise falls back to HS256 dev secret.
  JWT_ACCESS_PRIVATE_KEY: z.string().optional(),
  JWT_ACCESS_PUBLIC_KEY: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret-change-me'),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(60 * 60 * 24 * 30),

  // OTP
  OTP_DELIVERY_PROVIDER: z.enum(['console', 'unifonic', 'twilio']).default('console'),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),

  // Search
  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_API_KEY: z.string().default('dev-master-key'),

  // Cloudinary — prefer CLOUDINARY_URL (API environment variable from console).
  // Format: cloudinary://<api_key>:<api_secret>@<cloud_name>
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default('repose'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Push
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // Commission & order timings
  COMMISSION_RATE: z.coerce.number().default(0.1),
  ORDER_AUTO_CONFIRM_DAYS: z.coerce.number().default(7),
  ORDER_SHIP_TIMEOUT_DAYS: z.coerce.number().default(5),
  ORDER_DISPUTE_WINDOW_DAYS: z.coerce.number().default(3),
  WALLET_CLEARANCE_DAYS: z.coerce.number().default(7),

  // Seed
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppConfig {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export default (): AppConfig => validateEnv(process.env);
