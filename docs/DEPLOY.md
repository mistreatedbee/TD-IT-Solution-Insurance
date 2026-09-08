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

## Scheduled jobs

**Status: no scheduling infrastructure exists in this repo today.** `render.yaml` provisions one `web`
service only — no Render Cron Job resource has ever been provisioned here, and no other cron mechanism
(GitHub Actions `schedule:` trigger, external scheduler, etc.) exists either (`.github/workflows/` has
`ci.yml` only, push/PR-triggered).

### `backend/scripts/police-report-retention-purge.ts` (Feature 011)

Built and tested this session (dry-run capable, verified against production-shaped data) but is a
**runnable script, not a scheduled job** — see the file's own header comment. Per
[`docs/features/011-saps-case-reporting/database-design.md`](features/011-saps-case-reporting/database-design.md)
§5.3, the designed cadence is **daily**, "via Render Cron Job or equivalent — infrastructure choice not made
here," explicitly deferred to `devops-engineer`/`cto`.

**This is a real, paid infrastructure decision — not provisioned as part of this work.** Render Cron Jobs are
a distinct billable service type from the existing free-tier web service; adding one is a cost commitment
this role does not have unilateral authority to make (same caution applied to the Mongo
database-provisioning question — ADR-0008 is pending `cto` ratification for the same reason). Recorded here
as the exact configuration needed once an owner approves it, so there is nothing left to design when that
approval lands:

**Recommended Render Cron Job configuration** (to be added as a new `cronJob` service in `render.yaml`
alongside the existing `web` service — NOT currently present in the file):

```yaml
  - type: cron
    name: police-report-retention-purge
    runtime: node
    region: frankfurt
    plan: starter          # cheapest paid tier that supports Cron Jobs on Render — owner to confirm
    rootDir: backend
    schedule: "0 3 * * *"  # daily, 03:00 UTC — off customer-facing traffic hours; matches database-design.md §5.3's "daily"
    buildCommand: npm ci --include=dev && npm run build
    startCommand: npx tsx scripts/police-report-retention-purge.ts
    envVars:
      - key: MONGODB_URI
        sync: false          # same Atlas connection string as the web service — share the env group, do not duplicate the secret
```

Operational notes for whoever provisions this:

- **Dry-run first, always**, per the script's own safety framing: `npx tsx backend/scripts/police-report-retention-purge.ts --dry-run` against production data before the first real (writing) run, and after any change to the retention query.
- The script is idempotent (matches only documents that still have a police-report field set), so a missed day, a duplicate run, or an overlapping retry is safe — this relaxes the scheduling precision requirement; exact-time cron jitter is not a correctness concern.
- Output is a structured JSON summary to stdout only — this repo has **no durable, queryable run-log** for any retention/purge job today (`database-design.md` §5.3, `security-review.md` SR-011-4.4). Render Cron Job run logs are retained per Render's own log-retention window, which is the only evidencing this job gets until a durable log store is built — flag this to `site-reliability-engineer` if SR-011-4.4's "evidenced" requirement needs to be closed more durably before this handles real customer data.
- **Until this is scheduled, the retention obligation is not being met automatically** — the script must be run manually on the cadence above, or the 5-year clearance floor silently slips. This should be flagged to `technical-project-manager`/`cto` as an open operational gap, not a background task quietly covered.

**Owner action required:** provision the `cronJob` service above in the Render dashboard (or add it to
`render.yaml` and re-apply the blueprint) and confirm the `MONGODB_URI` env var is scoped correctly. Nothing
has been provisioned by this session — this section is a specification, not a deployed resource.

**Signed:** `devops-engineer`, 2026-08-12 (updated for API + web blueprint); 2026-09-08 (added Scheduled jobs — police-report retention-purge recommendation, no infra provisioned).
