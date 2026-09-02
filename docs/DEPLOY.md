# Deployment — Render (API + Web)

Full-stack deployment for TD IT Solution Insurance on [Render](https://render.com), per [ADR-0003](docs/organization/adr/0003-backend-hosting-platform.md).

## Services (`render.yaml`)

| Service | Name | Type | URL |
|---|---|---|---|
| **API** | `td-it-solution-insurance` | Node web service (`backend/`) | `https://td-it-solution-insurance.onrender.com` |
| **Web** | Vercel project | Static SPA (repo root Vite build) | `https://td-it-solution-insurance-alpha.vercel.app` |

The blueprint in `render.yaml` provisions **only the API**. The web app is deployed separately on Vercel per ADR-0003. `CORS_ALLOWED_ORIGINS` on the API must include the Vercel hostname.

## First-time setup

### 1. Apply the blueprint

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect `mistreatedbee/TD-IT-Solution-Insurance` and apply `render.yaml`
3. When prompted, set **secret** env vars on the API service (see below)

### 2. API secrets (Render dashboard → `td-it-solution-insurance` → Environment)

Required for production startup:

| Variable | Notes |
|---|---|
| `NODE_ENV` | Must be `production` on Render (blueprint sets this) |
| `MONGODB_URI` | Atlas connection string |
| `MONGODB_DB_NAME` | Optional. Overrides the database name in the URI — use `td_it_insurance_staging` on staging (MP-8) while sharing one cluster |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (never in client) |
| `SUPABASE_DB_URL` | Postgres `app` schema URL |
| `SUPABASE_DB_CA_CERT_PATH` | **`certs/supabase-prod-ca-2021.crt`** (bundled under `backend/`; blueprint sets this) — required when `NODE_ENV=production` |
| `REDIS_URL` | **`rediss://` required in production** — rate limits + revocation set |
| `SESSION_JWT_SIGNING_KEYS` | `kid:secret,kid2:secret2` (secrets ≥32 chars) |
| `SESSION_JWT_ACTIVE_KID` | Must match one kid above |

Optional:

| Variable | Notes |
|---|---|
| `INTERNAL_SERVICE_KEYS` | Service-to-service callers |

Auth email (verification, reset, invitations) is sent by the **Supabase `auth-send-email` Edge Function via Resend** — not the Render API. See [`docs/features/001-authentication/resend-setup.md`](features/001-authentication/resend-setup.md).

`CORS_ALLOWED_ORIGINS` is **auto-linked** from the web service hostname. Add `,http://localhost:5173` manually if you need local web → prod API during dev.

### 3. Verify deploy

```bash
# API readiness (Mongo + Postgres)
curl -sS "https://td-it-solution-insurance.onrender.com/api/health/ready"

# Web SPA (Vercel)
curl -sS -o /dev/null -w "%{http_code}" "https://td-it-solution-insurance-alpha.vercel.app/admin/login"
# expect 200
```

### 4. Mongo bootstrap (once per cluster/database)

Startup also runs bootstrap via `mongo-bootstrap.ts`, but run manually after first deploy or schema changes:

```bash
# From repo root — uses MONGODB_URI in .env.local (point at target DB)
npx tsx backend/scripts/bootstrap-mongo-collections.ts
```

Creates/updates: `policies`, `policy_status_history`, `assets`, `admin_access_log`, **`recovery_cases`**.

## Mobile after API is live

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_API_BASE_URL \
  --value "https://td-it-solution-insurance.onrender.com" \
  --environment preview --visibility plaintext
```

Host URL only — no `/api/v1` suffix. See [`mobile/docs/DEPLOY.md`](mobile/docs/DEPLOY.md).

## Production hardening checklist

- [x] API binds `0.0.0.0:$PORT` (Render requirement)
- [x] `TRUST_PROXY_HOPS=1` for correct client IP / rate limits
- [x] CORS fails closed when unset; blueprint links web origin
- [x] `REDIS_URL` required in production (no in-memory fallback)
- [x] Helmet + JSON body limit on API
- [x] SPA rewrite for `/admin/*` and `/security/*` (React Router)
- [x] Privileged dashboard 15-minute idle timeout (FR-21)
- [ ] Owner: Atlas IP allowlist includes Render egress (or `0.0.0.0/0` for dev)
- [ ] Owner: Supabase connection pooler / SSL for Render egress
- [ ] Owner: separate staging Mongo DB name (MP-8) before go-live

## Staging vs production (MP-8)

Use two Render blueprint instances or duplicate services with different env groups:

- `api-staging` / `web-staging` → `MONGODB_DB_NAME=td_it_insurance_staging` + separate Supabase project (see [`render-staging.yaml`](render-staging.yaml))
- `api-production` / `web-production` → production database (default URI path or explicit `MONGODB_DB_NAME`)

Bootstrap staging after first deploy:

```bash
MONGODB_URI='…' MONGODB_DB_NAME=td_it_insurance_staging npx tsx backend/scripts/bootstrap-mongo-collections.ts
```

**Signed:** `devops-engineer`, 2026-08-12 (updated for API + web blueprint).
