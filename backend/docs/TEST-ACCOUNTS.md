# Dev / staging test accounts

Created by:

```bash
npx tsx backend/scripts/seed-test-accounts.ts
```

Requires repo-root `.env.local` with live Supabase + Postgres credentials. Safe to re-run — skips existing accounts unless you pass `--force` (deletes and recreates).

## Credentials

| Role | Login URL | Email | Password |
|---|---|---|---|
| Customer | `/login` | `test.customer@tditsolutions.dev` | `CustomerTest1234!` |
| Admin | `/admin/login` | `test.admin@tditsolutions.dev` | `AdminTest1234567!` |
| Security partner | `/security/login` | `test.security@tditsolutions.dev` | `SecurityTest1234567!` |

Admin and security accounts require **MFA at login**. The seed script enrolls TOTP and prints the **authenticator secret** and a current **6-digit code**.

Add the printed secret to Google Authenticator (or similar) as a manual entry for ongoing logins.

## Local URLs

With the web app on port 5173 and API on 3000:

- Customer: http://localhost:5173/login
- Admin: http://localhost:5173/admin/login
- Security: http://localhost:5173/security/login

Set `TEST_WEB_BASE_URL` when seeding if your web host differs (e.g. Render preview URL).

## Notes

- These accounts are for **non-production** testing only. Do not use on production without explicit approval.
- The security operator is linked to partner org `TD IT Solution Test Security Partner` (stable UUID in the seed script).
- Customer password meets the 10-character minimum; privileged passwords meet the 14-character minimum.

## Production guard (added 2026-11-12)

`seed-test-accounts.ts` now refuses to run (exit 1) when `NODE_ENV=production`, when the Supabase host / Mongo host / Mongo DB name looks like production, or when a host is in the `PRODUCTION_TARGET_HOSTS` denylist. Local targets (localhost/127.0.0.1) run freely; any non-local target (e.g. staging) additionally needs `--i-understand-this-is-not-production` and its Supabase host listed in `ALLOW_SEED_TARGET`. The resolved target (hosts and DB name only, never credentials) is logged first. `.env`/`.env.local` no longer override variables already exported in the shell (a warning names the key). Logic: `backend/src/lib/seed-target-guard.ts`.
