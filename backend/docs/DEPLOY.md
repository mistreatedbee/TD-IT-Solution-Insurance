# Backend deployment (Render)

See the full-stack guide: [`docs/DEPLOY.md`](../../docs/DEPLOY.md).

Per [ADR-0003](../../docs/organization/adr/0003-backend-hosting-platform.md), the backend runs as **`td-it-solution-insurance`** on Render (`https://td-it-solution-insurance.onrender.com`).

## Quick reference

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build | `npm ci && npm run build` |
| Start | `npm start` |
| Health check | `/api/health/ready` |
| Node | 24 (`.node-version`) |

## Mongo bootstrap

```bash
npx tsx backend/scripts/bootstrap-mongo-collections.ts
```

Bootstraps Feature 004 collections **and** `recovery_cases`. Idempotent — safe to re-run. Server startup runs the same logic via `mongo-bootstrap.ts`.

## Mobile EAS

After the API URL is known:

```bash
eas env:create --name EXPO_PUBLIC_API_BASE_URL \
  --value "https://YOUR-API.onrender.com" \
  --environment production --visibility plaintext
```

**Signed:** `devops-engineer`, 2026-08-12.
