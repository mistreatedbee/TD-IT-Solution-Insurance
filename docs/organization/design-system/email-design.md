# Email design (updated to the current design system)

Date: 2026-11-16. Scope: **all** emails the platform sends. Visuals only: no wording, subjects, recipients,
links or sending logic changed.

## Where the emails come from

| System | Emails | Code |
|---|---|---|
| Supabase auth emails (Edge Function `auth-send-email`) | Sign-up confirmation, password reset, staff invitation, sign-in link, email change, re-authentication code, fallback | `supabase/functions/auth-send-email/templates/` |
| Backend notification emails | 23 templates: policy, asset, security, welcome, recovery case, claim decision | `backend/src/lib/domain-email-templates.ts`, `email-footer.ts`, `email-style.ts` |

Both systems go through one wrapper each, so every template inherits the design. The two sets of values are
kept in step by hand (the Supabase side is Deno code and cannot import the backend file):
`templates/brand.ts` and `backend/src/lib/email-style.ts`.

## What changed

- Palette from the design system's Day theme: cool blue page, brand navy header, brand blue, orange action.
- Rounded corners (24 px card, 16 px button and panels), soft shadow, thin orange-to-blue top stripe.
- Slab-serif headings and a modern sans body. Web fonts do not load in most mail clients, so each stack falls
  back to Rockwell or Georgia, and the system sans. Expect the fallback fonts in most inboxes.
- Dark mode for clients that support it (Apple Mail, iOS Mail, Outlook apps), using the Night theme. Clients
  that do not support it show the light design.
- Contrast: every text and background pair is at least 4.5:1, light and dark. A test enforces this
  (`backend/src/lib/email-style.test.ts`). The sign-off for new tokens remains with `design-system-manager`.

## Known limits

- **Logo.** The hosted logo is an opaque white-background image, so it shows as a white rounded badge on the
  navy header. A transparent PNG of the new logo mark would look cleaner but must be hosted first, because
  the emails load it from the public website. Until then the old file is kept so images never break.
- **Real glass is not possible in email.** Blur and translucency are not supported by mail clients. The
  design uses solid colours and gradients that approximate it.
- Looked at in Chrome (light and dark) only. Not yet checked in Gmail, Outlook desktop or a phone mail app.

## Previewing

```
cd backend && npx tsx scripts/render-email-previews.ts
open email-previews/index.html
```

Renders all 30 emails to static files. Nothing is sent. For dark mode, switch the computer to dark appearance.

## Going live

- Backend emails: ship with the next backend deploy.
- Sign-up, password reset, invitation and re-authentication emails: the Edge Function must be redeployed
  (`supabase functions deploy auth-send-email --project-ref <project>`) or they keep the old look. The
  Supabase side was exercised through Node, not under Deno itself.
- Send one real test of each type to an inbox before announcing.
