# Feature 001 — Resend setup (auth email)

**Status:** Selected provider for auth transactional email (signup verification, password reset, staff invitations).  
**Delivery path:** Supabase Auth → Send Email Hook → `auth-send-email` Edge Function → Resend API.

The Node backend on Render does **not** send auth email. Do not set `BREVO_API_KEY` on Render — secrets belong in **Supabase Edge Functions** only.

---

## 1. Resend account and domain

1. Create an account at [resend.com](https://resend.com).
2. **Domains** → Add `tditsolutionsinsurance.co.za` (or your verified sending domain).
3. Add the DNS records Resend provides (SPF, DKIM; DMARC recommended).
4. Wait until the domain shows **Verified**.
5. **API Keys** → Create a key with **Sending access** (store once — Resend shows it only at creation).

Recommended sender (after domain verification):

```text
EMAIL_FROM=notifications@tditsolutionsinsurance.co.za
EMAIL_FROM_NAME=TD IT Solution Insurance
```

Use an address on the verified domain (`notifications@`, `noreply@`, etc.).

---

## 2. Supabase Edge Function secrets

Copy the example file and fill in real values (never commit `supabase/.env`):

```bash
cp supabase/.env.example supabase/.env
```

| Secret | Where to get it |
|---|---|
| `RESEND_API_KEY` | Resend dashboard → API Keys |
| `EMAIL_FROM` | Verified sender on your Resend domain |
| `EMAIL_FROM_NAME` | Display name (optional) |
| `SEND_EMAIL_HOOK_SECRET` | Supabase Dashboard → Authentication → Hooks → Send Email |
| `SUPABASE_URL` | Project settings (already in `.env.example`) |

Push secrets to hosted functions:

```bash
supabase link --project-ref mowaqxfbwqdmjssghpvt
supabase secrets set --env-file supabase/.env
```

---

## 3. Deploy the Edge Function

From repo root:

```bash
supabase functions deploy auth-send-email --no-verify-jwt
```

`--no-verify-jwt` is required: GoTrue verifies the hook via `SEND_EMAIL_HOOK_SECRET`, not a Supabase JWT.

---

## 4. Enable the Send Email Hook

1. Supabase Dashboard → **Authentication** → **Hooks** → **Send Email**
2. Type: **HTTP** (Edge Function)
3. Function: `auth-send-email`
4. Copy the **Hook secret** → set as `SEND_EMAIL_HOOK_SECRET` (includes `v1,whsec_` prefix)
5. Re-run `supabase secrets set` if you updated the hook secret
6. **Enable** the hook

When enabled, Supabase built-in SMTP is **not** used for auth mail.

---

## 5. Auth redirect URLs (already required)

Supabase Dashboard → Authentication → URL configuration — allowlist:

- `http://localhost:5173/auth/callback` (local Vite dev)
- `https://www.tditsolutionsinsurance.co.za/**` (production web customer auth)
- `https://td-it-insurance-web.onrender.com/**` (Render static site, if used)
- `tditinsurance://verify-email`
- `tditinsurance://reset-password`
- `tditinsurance://invitations/accept`

---

## 6. Smoke test

1. Sign up a new customer on web (`/signup`) or mobile.
2. Check Resend dashboard → **Emails** for delivery status.
3. Open the verification link; confirm redirect to app or web.
4. After verify, log in once so the backend syncs `app.accounts` to `active`.

If the hook returns 401/500, check Supabase → Edge Functions → `auth-send-email` logs and Resend API errors (unverified domain is the most common cause).

---

## 7. Compliance (owner — before public launch)

Resend replaces the earlier Brevo recommendation for this flow. Before processing real customer PII at scale:

| Item | Action |
|---|---|
| **DPA** | Execute Resend's DPA; record POPIA s72 basis in RoPA |
| **Retention** | Confirm Resend log retention meets C-5.3-style minimization for token-bearing messages |
| **Privacy notice** | Disclose Resend as email processor (region + purpose) |
| **Supabase DPA** | Still required separately (`compliance-review-supabase.md` C-2) |

See `smtp-vendor-selection.md` §7 for the full C-5 checklist — vendor name changes; obligations do not.

---

## Architecture

```
Web / Mobile / Backend API
        │
        ▼
   Supabase GoTrue  (/signup, /resend, /recover, inviteUserByEmail)
        │
        ▼
   Send Email Hook  ──►  auth-send-email (Edge Function)
        │                      │
        │                      ├── branded HTML templates
        │                      └── POST https://api.resend.com/emails
        ▼
   User inbox  →  deep link / web redirect
```
