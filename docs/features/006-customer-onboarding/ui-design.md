# Feature 006 — Customer Onboarding UI Design (Web)

**Lifecycle stage:** 4 — UI Design  
**Stage owner (A):** `ui-designer`  
**Surface:** Marketing site `/get-started` — reuses `LandingHeader`, `Section`, `Card`, `Button`, `Input`, `AssetBadge`, `Badge`

---

## Layout

- **Shell:** `LandingHeader` + centered `max-w-3xl` content on white/warm background (not narrow auth card).
- **Progress:** Horizontal stepper — Account · Plan · Assets · Review · Activate (current step highlighted navy, completed gold check).

---

## Screens

### S1 Welcome
- Headline: "Welcome to TD IT Solution Insurance"
- Sub: "Protect your valuable assets with flexible insurance and intelligent asset protection."
- CTAs: **Get Started** (primary), **Log in** (tertiary)

### S2 Account type
- Two equal cards: Individual / Business
- Helper text under Business: "More than 10 devices? Enterprise plans available later in the flow."

### S3 Sign up
- Email, password, confirm, consent checkbox (links to /terms, /privacy)
- Footer: Already have an account → Log in

### S4 Verify email
- Badge + inbox instructions + resend

### S5 Plan selection
- Three `Card` plan panels (navy header when selected)
- Starter R200/mo · 5 devices | Standard R400/mo · 10 devices | Enterprise · Custom pricing
- Enterprise card: **Request a quote** → mailto / contact section

### S6 Asset category
- 2×4 grid of `AssetBadge` (interactive, selected ring)

### S7 Asset form
- Dynamic fields per type (mirrors mobile `RegisterAssetScreen` required fields)
- Optional estimated value (ZAR)
- **Add another asset** + **Continue to review**

### S8 Review
- Customer email, plan name, monthly display amount (informational), asset list
- Alert: "Payment and full activation will be completed in a future step."

### S9 Complete
- Success state + links: Home, Add more assets (future), Download app (`#mobile-app`)

---

## States

| State | Treatment |
|-------|-----------|
| Loading plans | Skeleton cards |
| API error | `InlineAlert` danger + retry |
| ACCOUNT_NOT_ACTIVE | Redirect to verify step |
| ASSET_LIMIT_REACHED | Inline alert + upgrade/contact copy |
| Offline | Banner from future network layer — Phase 2 web |

---

## Mobile app parity

Same step order in Expo onboarding stack (follow-up `mobile-engineer`); web is canonical for Phase 1 client request.
