# Mobile deployment — EAS Build, env vars, store submission

This document covers **real** deployment (EAS Build / EAS Submit / EAS Update),
not Expo Go or tunnel-based demo runs. It assumes the backend will live on
**Render** per [ADR-0003](../../docs/organization/adr/0003-backend-hosting-platform.md)
— but **no Render service URL is assumed to exist yet**. Set URLs only after
your backend is deployed and health-checked.

For local development, see [`../README.md`](../README.md).

---

## What gets configured where

| Variable | Local dev | EAS preview | EAS production |
|----------|-----------|-------------|----------------|
| `EXPO_PUBLIC_API_BASE_URL` | `mobile/.env` | EAS env (`preview`) | EAS env (`production`) |
| Backend secrets (`MONGODB_URI`, JWT keys, etc.) | repo-root `.env.local` | Render dashboard | Render dashboard |
| Apple / Google signing | n/a | EAS credentials | EAS credentials |

`EXPO_PUBLIC_API_BASE_URL` is a **host URL only** (no `/api/v1` suffix). It is
not a secret — it is inlined into the app bundle at build time, same as
`VITE_API_BASE_URL` on the web frontend. Never put Supabase keys, SMTP
credentials, or session signing keys in the mobile app or EAS `EXPO_PUBLIC_*`
vars.

The app reads this variable in `src/api/config.ts` and calls
`${EXPO_PUBLIC_API_BASE_URL}/api/v1/...`.

---

## Prerequisites (owner actions)

Complete these **before** the first store-bound build. Items marked **owner**
require a human with account access — they cannot be done from this repo alone.

### Expo / EAS

- [ ] **Expo account** — sign up at [expo.dev](https://expo.dev).
- [ ] **EAS CLI** — `npm install -g eas-cli`, then `eas login`.
- [ ] **Link EAS project** (**owner**) — from `mobile/`:
  ```bash
  eas init
  ```
  This creates/links the project on expo.dev and writes `extra.eas.projectId`
  into `app.json`. Commit `app.json` after linking (the project ID is not secret).
- [ ] **Set API base URLs in EAS** (**owner**, after Render backend exists):
  ```bash
  # Staging / internal testing (preview profile)
  eas env:create \
    --name EXPO_PUBLIC_API_BASE_URL \
    --value "https://<YOUR-RENDER-STAGING-HOST>.onrender.com" \
    --environment preview \
    --visibility plaintext

  # Production store builds
  eas env:create \
    --name EXPO_PUBLIC_API_BASE_URL \
    --value "https://<YOUR-RENDER-PRODUCTION-HOST>.onrender.com" \
    --environment production \
    --visibility plaintext
  ```
  Verify: `eas env:list --environment preview` and `eas env:list --environment production`.

### Backend (Render)

Per [`backend/README.md`](../../backend/README.md) and ADR-0003:

- [ ] **Render Web Service** created, root directory `backend/`, build command
  `npm install --include=dev && npm run build`, start command `npm start`.
- [ ] **Health checks green** — `GET /api/health` and `/api/health/ready` return 200.
- [ ] **`CORS_ALLOWED_ORIGINS`** set on Render if the backend enforces CORS for
  any web clients; native mobile fetch generally does not send `Origin`, but
  verify auth flows against the deployed API before wide distribution.

No backend deploy is automated from this mobile directory.

### Apple (iOS)

- [ ] **Apple Developer Program** enrollment (**owner**, paid account).
- [ ] **Bundle ID confirmed** — currently `co.za.tditsolutions.insurance` in
  `app.json` → `expo.ios.bundleIdentifier`. This is a **placeholder**, not
  ratified. Register the final ID in Apple Developer → Identifiers **before**
  the first production build; update `app.json` to match.
- [ ] **App Store Connect app** created (**owner**) — note the numeric App ID
  (`ascAppId`) for `eas submit`.
- [ ] **Signing** — EAS can manage certificates/profiles (`eas credentials`) or
  use your own; first iOS build will prompt if not configured.

### Google (Android)

- [ ] **Google Play Console** developer account (**owner**, one-time fee).
- [ ] **Application ID confirmed** — currently `co.za.tditsolutions.insurance`
  in `app.json` → `expo.android.package`. Same placeholder caveat as iOS; create
  the app in Play Console with the **same** ID or change `app.json` first.
- [ ] **Play App Signing** enabled (default for new apps).
- [ ] **Service account JSON** for automated submit (**owner**) — create in
  Google Cloud Console, grant Play Console API access, save as
  `mobile/credentials/google-play-service-account.json` (gitignored — see
  `.gitignore`). Path referenced in `eas.json` → `submit.production.android`.

### Branding (before public store review)

- [x] Replace default Expo template icons/splash in `assets/` — sourced from `public/logo.png` via `npm run generate-icons` (2026-08-12).
- [ ] Architecture.md §6: **public store submission** should wait until Phase 1
  scope is feature-complete; use **internal distribution** (`preview` profile)
  for stakeholder review of the auth shell.

---

## Build profiles (`eas.json`)

| Profile | Use | API URL source |
|---------|-----|----------------|
| `development` | Dev client, local iteration | Hardcoded `http://localhost:3000` in `eas.json` |
| `preview` | TestFlight internal / Play internal testing | EAS env `preview` → `EXPO_PUBLIC_API_BASE_URL` |
| `production` | App Store / Play Store binaries | EAS env `production` → `EXPO_PUBLIC_API_BASE_URL` |

`preview` and `production` **do not** embed API URLs in `eas.json` — values
must exist in EAS or the build will fall back to `http://localhost:3000` with
a console warning (`src/api/config.ts`), which is wrong for real devices.

---

## Build commands

From `mobile/`:

```bash
# Internal testing (after preview env var is set)
eas build --profile preview --platform all

# Store-bound binaries (after production env var is set)
eas build --profile production --platform all

# Platform-specific
eas build --profile production --platform ios
eas build --profile production --platform android
```

First build will configure credentials interactively unless pre-provisioned.

---

## Submit to stores

After a successful `production` build:

```bash
# Submit latest production build
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Update `eas.json` → `submit.production` with real `appleId`, `ascAppId`, and
`appleTeamId` once App Store Connect is set up — or pass flags interactively.

Android submit requires the service account key at the path in `eas.json`
(default: `./credentials/google-play-service-account.json`).

---

## OTA updates (JS-only changes)

Per architecture.md §6: JS/copy fixes that do not change native config can ship
via EAS Update without a new store binary:

```bash
eas update --channel preview --message "Describe change"
eas update --channel production --message "Describe change"
```

Anything touching `app.json` plugins, permissions, icons, or native modules
requires a new `eas build`.

---

## CI/CD (not wired yet)

GitHub Actions integration for `eas build` on merge/tag is tracked as **M-08**
(architecture.md). This doc covers manual/EAS-dashboard flows until that
pipeline lands.

---

## Checklist before first real device test against staging

1. Render backend deployed; `/api/health/ready` = 200.
2. `eas env:create` for `EXPO_PUBLIC_API_BASE_URL` on `preview` environment.
3. `eas build --profile preview --platform <ios|android>`.
4. Install via TestFlight (iOS) or Play internal track (Android).
5. Exercise signup → verify → login → MFA → logout against the staging API.

---

## Owner actions summary

| Action | Owner |
|--------|-------|
| Create/link EAS project (`eas init`) | Platform owner / mobile lead |
| Deploy Render staging + production backends | `devops-engineer` + backend owner |
| Set `EXPO_PUBLIC_API_BASE_URL` in EAS (preview + production) | Platform owner |
| Confirm/register final bundle ID + package name | Product / legal owner |
| Apple Developer + App Store Connect app | Platform owner |
| Google Play Console + service account | Platform owner |
| Replace placeholder app icons | `design-system-manager` / `ui-designer` |
| Wire GitHub Actions EAS pipeline (M-08) | `devops-engineer` (follow-up) |
