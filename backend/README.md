# TD IT Solutions — Backend API

Node.js + TypeScript backend, per [ADR-0001](../docs/organization/adr/0001-baseline-architecture.md).
This is currently an **infrastructure scaffold**: a runnable Express app with
health checks and MongoDB connectivity wiring — not a feature implementation.

## Why this is a separate app from the frontend

The frontend (`/` at repo root — React 18 + Vite) and this backend are
genuinely separate deployables per ADR-0001's service decomposition (web,
mobile, backend are three different runtime targets with different deploy
lifecycles). Rather than bolting Express into the root `package.json`
alongside Vite/React dependencies, `backend/` has its own `package.json`
and its own `node_modules`, installed and run independently. The root
`package.json`'s existing scripts/dependencies are untouched by this task.

## Install

```bash
cd backend
npm install
```

## Configure environment variables

This app loads environment variables from the **repo-root** `.env.local`
(`../.env.local` relative to `backend/`), not from a `backend/.env` file —
the MongoDB/Supabase credentials already live there. See
[`.env.example`](./.env.example) for the variables it reads
(`MONGODB_URI`, `SUPABASE_DB_URL`, `PORT`, `CORS_ALLOWED_ORIGINS`).

`MONGODB_URI` is required — the server fails fast at startup if it's
missing. `SUPABASE_DB_URL` is optional right now (warn-only); no live
Supabase credential is configured yet (see the comment in the repo-root
`.env.local`). `CORS_ALLOWED_ORIGINS` fails **closed** (no cross-origin
requests permitted) if unset — see [ADR-0003](../docs/organization/adr/0003-backend-hosting-platform.md).

## Run

```bash
# Development (watch mode)
npm run dev

# Type-check only
npm run typecheck

# Production build, then run
npm run build
npm start

# Lint
npm run lint
```

Once running, verify (routes are mounted under `/api`, per the deployment-time
prefix resolution in
[`api-design.md`](../docs/features/001-authentication/api-design.md) §6):

```bash
curl http://localhost:3000/api/health         # liveness — no DB check
curl http://localhost:3000/api/health/ready   # readiness — pings MongoDB, reports Supabase config status
```

## Deployment

Per [ADR-0003](../docs/organization/adr/0003-backend-hosting-platform.md),
this backend deploys to **Render** as a persistent-process Web Service —
not Vercel, and not as a serverless Function. Render root directory:
`backend/`. Start command: `npm start`. Environment variables to set in
Render's dashboard: `MONGODB_URI`, `SUPABASE_DB_URL` (once available),
`CORS_ALLOWED_ORIGINS` (the frontend's real origin, e.g. its Vercel URL),
`NODE_ENV=production`. Do **not** set `PORT` manually — Render provides it.

**Build command — must explicitly include dev dependencies:**

```
npm install --include=dev && npm run build
```

Not plain `npm install && npm run build`. With `NODE_ENV=production` set
(above), a bare `npm install` skips `devDependencies` — which is exactly
where `typescript`, `@types/node`, `@types/express`, and `@types/cors`
live, so the build fails with "Cannot find name 'process'" /
"Cannot find name 'console'" / missing module declarations even though
the code is correct. `--include=dev` forces them in regardless of
`NODE_ENV`.

The frontend (deployed separately on Vercel) reaches this backend via an
explicit `VITE_API_BASE_URL` build-time env var pointing at the Render
service's public URL — the two are genuinely cross-origin deployables, not
same-origin, so no frontend code should assume a relative `/api/*` path
resolves to this backend.

## Running frontend + backend together

These are independent apps with independent lifecycles:

```bash
# Terminal 1 — frontend (repo root)
npm run dev

# Terminal 2 — backend
cd backend && npm run dev
```

There is no combined root script (deliberately — see "Why this is a
separate app" above); if a combined dev-orchestration script becomes
desirable later, that's a `backend-architect`/`devops-engineer` call, not
something this scaffold assumes.

## What's here

- `src/index.ts` — Express entrypoint: env loading, `helmet()`, `cors()`,
  JSON body parsing, health routes, graceful shutdown (SIGTERM/SIGINT)
  that closes the MongoDB connection cleanly.
- `src/config/env.ts` — typed env loader; fails fast if `MONGODB_URI` is
  missing.
- `src/db/mongodb.ts` — `MongoClient` singleton (`connectMongo()` /
  `getDb()` / `pingMongo()` / `closeMongo()`), following the driver's
  recommended one-client-reused-for-process-lifetime pattern.
- `src/db/supabase.ts` — a **stub**. `getSupabaseClient()` throws a clear
  "not configured yet" error. See
  [ADR-0002](../docs/organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md)
  for why Supabase exists in this architecture at all, and why this module
  is deliberately not implemented yet.
- `src/routes/health.ts` — `GET /health` (liveness) and `GET /health/ready`
  (readiness — pings MongoDB, reports Supabase-configured status without
  pinging it).
- `src/middleware/error-handler.ts` — centralized error handling using the
  platform's error-envelope convention (`{ error: { code, message,
  requestId } }`), per
  [`docs/organization/05-development-standards.md`](../docs/organization/05-development-standards.md)
  and Feature 001's
  [`backend-approach.md`](../docs/features/001-authentication/architecture/backend-approach.md)
  §2.3.

## What's NOT here yet

This scaffold intentionally does **not** implement Feature 001 (Customer
Account Creation & Authentication)'s business logic:

- No `POST /v1/auth/signup`, `/v1/auth/login`, `/v1/auth/verify-email`, or
  any other `/v1/auth/*` / `/v1/session/*` / `/v1/mfa/*` / `/v1/invitations`
  endpoints.
- No Supabase Auth integration — `src/db/supabase.ts` is a stub that throws
  if used.
- No rate-limiting/lockout layer, no audit-log write path, no
  authorization/RBAC middleware.

These are gated behind Feature 001's own lifecycle:

- **Stage 6 (Database Design)** and **Stage 7 (API Design)** — not yet
  complete. `backend-approach.md` (Stage 5) sets the endpoint groupings and
  service boundaries these stages will formalize into a schema and an
  OpenAPI spec.
- **Stage 8 (Security Review)** — required sign-off (rate-limiting
  thresholds, Supabase outage/degradation fallback, secrets-management
  plan per ADR-0002's "Required Follow-ups") before any real auth
  implementation ships.

Building this skeleton now (health checks, DB connectivity, error/handler
conventions) is infrastructure substrate that Stage 6/7/8's eventual
implementation will sit on top of — it is not itself a preview of Feature
001's business logic, and no route in this scaffold should be mistaken for
one.
