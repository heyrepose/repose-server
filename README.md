# repose-server

NestJS API for Repose — a pre-loved fashion marketplace (UAE).

> Specs live in the workspace-root `documentation/` folder (sibling of this repo). Treat them as ground truth.

## Stack

NestJS · Prisma · PostgreSQL · Redis · Meilisearch · Stripe · Cloudinary · Socket.IO

## Setup

```bash
# Create/edit a single env file at the repo root: `.env`
# Ensure Postgres, Redis, and Meilisearch are running locally
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/api/v1/docs

## Related repos

- `repose-web` — Next.js marketplace (separate repo; different developer)
- `repose-mobile` — Flutter app (later)
- Contract: `documentation/03-API-REFERENCE.md` + OpenAPI (`pnpm openapi:export`)

## Railway

See **`documentation/RAILWAY-DEPLOYMENT.md`** for the full step-by-step guide (Postgres, Redis, Meilisearch, env vars, Vercel wiring).

Short version:

1. New Railway project → deploy this repo from GitHub.
2. Add **Postgres** + **Redis** plugins; reference `DATABASE_URL` and `REDIS_URL` on the API service.
3. Add **Meilisearch** (Docker `getmeili/meilisearch:v1.9`) + public domain.
4. Paste variables from `env.production.txt` (gitignored).
5. Start command: `pnpm start:migrate` (from `railway.toml`).
6. Health: `GET /api/v1/health`.
