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

See `documentation/09-DEVOPS-DEPLOYMENT.md` §9. Short version:

1. New Railway project → deploy this repo.
2. Add **Postgres** + **Redis** plugins; reference `DATABASE_URL` and `REDIS_URL` on the API service.
3. Set secrets (`JWT_*`, `CORS_ORIGINS`, Cloudinary, Meilisearch, …).
4. Start command is `pnpm start:migrate` (applies Prisma migrations, then boots).
5. Health: `GET /api/v1/health` (checks Postgres + Redis).
