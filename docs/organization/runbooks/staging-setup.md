# Runbook: Staging environment setup (MP-8)

Owner: `devops-engineer`. Status: repo-side prepared 2026-11-12; **no cloud resources exist yet**.
Blueprint: `render-staging.yaml`. Everything below marked OWNER requires an account/credential only the human can create. No payment gateway or GPS vendor exists; staging has none either.

## 0. Isolation risks (read first)

| # | Risk | Mitigation |
|---|---|---|
| 1 | Only one Supabase project is linked; staging would share production identity (users, MFA, audit log). | Create a separate project (section 1). Never reuse prod URL/keys. |
| 2 | `backend/scripts/seed-test-accounts.ts` loads repo-root `.env.local` with `override: true`, so exported shell vars do NOT win, and it has no production guard. Running it with prod creds creates fixed-password privileged accounts in production. | Section 5: swap `.env.local` for a staging file first and confirm the URL. |
| 3 | Same Atlas cluster: a prod DB user can read/write staging and vice versa. | Dedicated staging DB user scoped to `td_it_insurance_staging` only (section 2). |
| 4 | Sharing Redis shares session revocation and rate limits. Sharing JWT keys makes prod tokens valid on staging. | Separate Redis; freshly generated keys. |
| 5 | `env.ts` defaults web redirect URLs to the prod Vercel app if unset. | Blueprint declares all redirects explicitly; verify they are set. |
| 6 | Real email to real people. | Resend test key / sandbox domain only; `EMAIL_FROM_NAME` carries "(STAGING)". |

## 1. Supabase staging project (OWNER)
1. Supabase dashboard -> New project, name `td-it-insurance-staging`, same region as prod. Record the DB password in your password manager.
2. Apply the repo migrations to the NEW project only: `supabase link --project-ref <STAGING_REF>` from a scratch directory/clone (do not re-link the working repo that is linked to prod), then `supabase db push`. Confirm `supabase projects list` shows the intended ref before pushing.
3. Create the least-privilege app role per SR-3 as in the prod migration notes; build `SUPABASE_DB_URL` from that role, not the superuser.
4. Auth -> URL configuration: Site URL and allowlist `https://td-it-insurance-web-staging.onrender.com/auth/callback?type=signup`, `/reset-password`, `/invitations/accept`, plus `tditinsurance://verify-email` and `tditinsurance://reset-password`.
5. Auth -> Hooks: deploy `auth-send-email` to the staging project (`supabase functions deploy auth-send-email --project-ref <STAGING_REF>`) with its secrets set to the Resend TEST key. Leave the hook disabled until step 3 of section 3 is done.
6. Collect: `SUPABASE_URL`, service-role key, `SUPABASE_DB_URL`, anon key (web build `VITE_SUPABASE_*` only; the backend never reads it, SR-4).

## 2. MongoDB staging database (OWNER)
1. Atlas -> Database Access: new user `td-staging-app`, role `readWrite` on database `td_it_insurance_staging` ONLY. Confirm the prod user has no grant on that DB where practical.
2. Network access: allow Render egress as for prod.
3. Build `MONGODB_URI` with the staging user. `MONGODB_DB_NAME=td_it_insurance_staging` is already pinned in the blueprint.
4. After first deploy: `MONGODB_URI='<staging uri>' MONGODB_DB_NAME=td_it_insurance_staging npx tsx backend/scripts/bootstrap-mongo-collections.ts`. Check the printed DB name before it writes.

## 3. Resend test key (OWNER)
1. Resend -> API Keys: create a key named `staging`, permission "Sending access". Use a sandbox/test sender (`onboarding@resend.dev`) or a dedicated `staging.` subdomain you verify separately; do not reuse the production sending domain config.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` in Render (staging service only) and as the staging Edge Function secret.
3. Enable the Send Email Hook on the staging Supabase project.

## 4. Render services (OWNER)
1. Also provision a separate Redis (`rediss://`) for staging (Render Key Value or Upstash free tier, new instance).
2. Generate fresh secrets: `SESSION_JWT_SIGNING_KEYS` = `staging-1:<openssl rand -hex 32>`, `SESSION_JWT_ACTIVE_KID=staging-1`, `INTERNAL_SERVICE_KEYS` optional.
3. Render -> New -> Blueprint, point at this repo, **Blueprint file path `render-staging.yaml`** (extract the YAML block from the markdown into a real YAML file first, or create the two services manually from it; the file is currently a markdown doc). Name the blueprint `td-it-insurance-staging`, never attach it to the prod blueprint.
4. Fill every `sync: false` var with STAGING values only. Set `EMAIL_VERIFICATION_REDIRECT_URL_WEB` to `https://td-it-insurance-web-staging.onrender.com/auth/callback?type=signup`.
5. Verify: `curl https://td-it-insurance-api-staging.onrender.com/api/health/ready`, and confirm the service env shows a SUPABASE_URL whose ref differs from prod.
6. Free plan cold-starts; acceptable for QA, not load tests (use a paid instance for MP-8 load testing, owner cost decision).

## 5. Seeding test accounts (staging only)
Seed script is `backend/scripts/seed-test-accounts.ts` (credentials: `backend/docs/TEST-ACCOUNTS.md`; fixed passwords, never prod).
1. `mv .env.local .env.local.prod-backup`; create `.env.local` with staging values only (SUPABASE_URL, SERVICE_ROLE, SUPABASE_DB_URL, MONGODB_*).
2. Print and eyeball `SUPABASE_URL` equals the staging ref. Abort if not.
3. `TEST_WEB_BASE_URL=https://td-it-insurance-web-staging.onrender.com npx tsx backend/scripts/seed-test-accounts.ts`
4. Restore: `mv .env.local.prod-backup .env.local`. Store the printed TOTP secrets in the password manager.
Follow-up for `backend-engineer`: add a refuse-to-run guard (allowlisted staging project ref) and drop `override: true`.

## 6. Mobile EAS `staging` profile (suggestion; eas.json NOT edited)
Add under `build` (requires a staging API URL; `mobile/scripts/verify-eas-feature-flags.mjs` must still pass, so keep all `EXPO_PUBLIC_FEATURE_*` false unless its CI rules allow otherwise):
```json
"staging": {
  "extends": "preview",
  "channel": "staging",
  "environment": "preview",
  "env": { "EXPO_PUBLIC_API_BASE_URL": "https://td-it-insurance-api-staging.onrender.com" }
}
```
Use a distinct bundle id/app name suffix if installing alongside production builds. Never submit a staging profile to a store track.

## 7. Rollback / teardown
- Bad deploy: Render -> service -> Events -> roll back to previous deploy; or suspend the staging service. Prod is unaffected by design.
- Full teardown: delete the two Render services and staging Redis; drop DB `td_it_insurance_staging` and delete the `td-staging-app` user; delete the staging Supabase project; revoke the Resend `staging` key. Nothing in prod needs to change.
- Credential suspected leaked: rotate that staging credential only; if a PROD credential was ever pasted into staging, treat as a prod incident and rotate it.

## 8. Isolation guarantees required before ANY testing
No test using real-customer data is permitted, ever; staging holds synthetic data only. Before first use, all must be true and recorded (owner sign-off):
1. Staging `SUPABASE_URL` project ref differs from prod; separate service-role key and DB role.
2. Staging Mongo user cannot access any prod database.
3. Separate Redis and JWT signing keys (a prod access token is rejected by staging).
4. Resend test key only; no mail reaches real addresses.
5. No prod value appears in `render-staging.yaml` or the staging dashboard; seed script run only against staging.
6. All kill-switch flags remain "false" unless a Stage 8-cleared decision says otherwise.
7. No production data is copied to staging (no dumps/restores); POPIA applies to any copy.
