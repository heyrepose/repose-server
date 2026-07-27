# repose-server

NestJS API for Repose — a pre-loved fashion marketplace (UAE).

> Specs live in the workspace-root `documentation/` folder (sibling of this repo). Treat them as ground truth.

## Stack

NestJS · Prisma · PostgreSQL · Redis · Meilisearch · Stripe · Cloudinary · Socket.IO

## Setup

```bash
cp .env.example .env   # or keep your existing .env
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
