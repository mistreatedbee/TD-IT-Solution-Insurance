# Backend deployment (Render)

Per [ADR-0003](../../docs/organization/adr/0003-backend-hosting-platform.md), the backend runs as a **persistent web service** on Render — not Vercel serverless.

## Render Blueprint

Repo root [`render.yaml`](../../render.yaml) defines:

- **Web service** — `backend/`, Node 24, health check `/api/health/ready`
- **Environment variables** — set in Render dashboard (never commit secrets)

## First-time setup

1. Connect GitHub repo in [Render Dashboard](https://dashboard.render.com)
2. Apply Blueprint from `render.yaml` or create Web Service manually:
   - **Root directory:** `backend`
   - **Build:** `npm ci && npm run build`
   - **Start:** `npm start`
   - **Health check path:** `/api/health/ready`
3. Set environment variables (see `backend/.env.example`):
   - `MONGODB_URI`, Supabase trio, `SESSION_JWT_*`, `REDIS_URL` (production)
   - `CORS_ALLOWED_ORIGINS` — Vercel frontend URL(s)
   - `BREVO_API_KEY` + `EMAIL_FROM` when Brevo account exists (C-5)
4. Run Mongo bootstrap once if startup logs show issues:
   ```bash
   npx tsx backend/scripts/bootstrap-mongo-collections.ts
   ```
   (from local machine with production `MONGODB_URI` — use with care)

## Staging vs production (MP-8)

| Concern | Recommendation |
|---|---|
| MongoDB | Separate **database name** on same Atlas cluster minimum; separate cluster preferred before go-live |
| Supabase | Branch or separate project per Supabase docs |
| Render | Two services (`api-staging`, `api-production`) with different env groups |

Document staging URLs in `mobile/docs/DEPLOY.md` → EAS `preview` / `production` env vars.

## Mobile EAS env vars

After Render URL is known:

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR-SERVICE.onrender.com --environment preview
eas env:create --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR-PROD-SERVICE.onrender.com --environment production
```

**Signed:** `devops-engineer`, 2026-08-12.
