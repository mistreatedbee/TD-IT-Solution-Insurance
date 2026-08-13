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
