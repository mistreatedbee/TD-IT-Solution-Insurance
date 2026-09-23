# Supabase — Auth email (Edge Functions)

Custom branded templates for Feature 001 auth email, delivered via the **Send Email Hook** and **[Resend](https://resend.com)**.

The Node backend still triggers GoTrue (`/resend`, `/recover`, `inviteUserByEmail`); Supabase Auth calls this Edge Function instead of built-in SMTP mail.

**Full setup:** [`docs/features/001-authentication/resend-setup.md`](../docs/features/001-authentication/resend-setup.md)

## Templates

| Auth event | Template | Trigger |
|---|---|---|
| Signup verification | `templates/signup.ts` | `POST /auth/signup`, resend |
| Password reset | `templates/recovery.ts` | `POST /auth/reset-password/request` |
| Staff invitation | `templates/invite.ts` | `POST /v1/invitations` |

Shared layout: `templates/layout.ts` (TD IT Solution Insurance brand colors).

## Prerequisites

1. **Resend account** with verified sending domain (see setup doc).
2. **Redirect URLs allowlisted** in Supabase Dashboard → Auth → URL configuration:
   - `tditinsurance://verify-email`
   - `tditinsurance://reset-password`
   - `tditinsurance://invitations/accept`

## Secrets (Edge Function)

Set in Supabase Dashboard → Project Settings → Edge Functions, or via CLI:

```bash
supabase link --project-ref mowaqxfbwqdmjssghpvt
supabase secrets set --env-file supabase/.env
```

| Secret | Required | Purpose |
|---|---|---|
| `SEND_EMAIL_HOOK_SECRET` | Yes | From Dashboard → Auth → Hooks → Send Email (includes `v1,whsec_` prefix) |
| `SUPABASE_URL` | Yes | Auto-injected in hosted functions; set for local serve |
| `EMAIL_FROM` | Yes | Verified sender on Resend domain |
| `EMAIL_FROM_NAME` | No | Default: `TD IT Solution Insurance` |
| `RESEND_API_KEY` | Yes | Resend API key with sending access |

Copy `supabase/.env.example` → `supabase/.env` (gitignored) for local values.

## Deploy

```bash
supabase functions deploy auth-send-email --no-verify-jwt
```

## Enable the Auth Hook

1. Supabase Dashboard → **Authentication** → **Hooks** → **Send Email**
2. Hook type: **HTTP** (Edge Function)
3. Select function: `auth-send-email`
4. Copy the generated **Hook secret** → set as `SEND_EMAIL_HOOK_SECRET`

When the hook is **enabled**, Supabase SMTP is **not** used for auth email.  
Configure `RESEND_API_KEY` and verify your domain **before** enabling in production.

## Local development

```bash
supabase functions serve auth-send-email --no-verify-jwt --env-file supabase/.env
```

Test with the hook payload verifier in Supabase Dashboard, or trigger a signup/resend from the mobile app against a project with the hook enabled.

## Architecture

```
Mobile / Backend API / Web (Supabase client)
        │
        ▼
   GoTrue (/resend, /recover, inviteUserByEmail)
        │
        ▼
   Send Email Hook  ──►  auth-send-email (Edge Function)
        │                      │
        │                      ├── render template
        │                      └── Resend API
        ▼
   User inbox (deep link → tditinsurance://…)
```

Confirmation links use Supabase's standard verify URL (`/auth/v1/verify?token=…&type=…&redirect_to=…`),
which redirects to the mobile deep link after token validation.

## Password policy floor (INC-003 F-8) — manual action required

`config.toml`'s `[auth] minimum_password_length = 14` is declared in this repo but is **not**
synced to the hosted project by anything automated — there is no CI/deploy step that runs
`supabase config push`, and this file has never before tracked `[auth]`. **Do not run
`supabase config push` to apply this** until someone with dashboard/API access first pulls and
diffs the project's *full* live `[auth]` config (site URL, redirect allow-list, SMTP, MFA, OAuth
providers, etc.) — pushing this partial section as-is risks resetting any of those unmirrored
settings to CLI defaults.

**Manual steps for whoever holds Supabase project-owner access** (project ref
`mowaqxfbwqdmjssghpvt`):

1. Dashboard → **Authentication** → **Sign In / Providers** → **Email** → set **Minimum password
   length** to **14**.
2. Dashboard → **Authentication** → **Policies** (or **Auth** → **Settings** → **Password
   Security**, naming varies by dashboard version) → enable **leaked password protection**
   (HaveIBeenPwned check). This has no `config.toml` key in Supabase CLI 2.109.1 (verified against
   the CLI's own `supabase init` scaffold) — dashboard/Management API only.
3. Note: this floor applies to **all** account types (customer and staff) — Supabase Auth has no
   per-user-type policy. Raising the customer floor from GoTrue's default (6) to 14 is a strict
   improvement and does not conflict with the backend's own application-level customer minimum
   (10, `backend/src/lib/policy.ts`), which still governs the correct (backend-routed) reset path.

Tracked under `docs/organization/incidents/INC-003-web-password-reset-control-bypass.md`, action
A-3.
