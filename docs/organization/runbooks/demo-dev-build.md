# Runbook: internal demo build (EAS `development` profile)

Owner: mobile-engineer. Created 2026-11-12 (CTO-approved). Audience: the TD team running a live client demo of locations, claims and alerts.

## Purpose

The production, preview and playInternal profiles in `mobile/eas.json` ship with every `EXPO_PUBLIC_FEATURE_*` flag `"false"` (INC-001 / INC-002 / INC-005). The existing `development` profile (internal dev client, all flags `"true"`) lets the team show the gated surfaces on a team-held Android device without changing any distributable build.

## Hard rules

1. Test accounts and test assets only. No real customer location data, ever.
2. The build is NEVER given, sent or installed on a client device. The client watches the team-held device.
3. Do NOT edit `mobile/eas.json`, and do NOT change the `preview` or `production` profiles (or any non-development profile). `mobile/scripts/verify-eas-feature-flags.mjs` (INC-002 CI guard) must keep passing.
4. The `development` profile points at `https://td-it-solution-insurance.onrender.com`, which is the production API. Using a dev build against it needs prior written sign-off from `cybersecurity-architect` (see `docs/organization/incidents/INC-001-location-ingestion.md`, `INC-002-play-internal-location-reenablement.md`, `INC-005-claims-killswitch-route-shadowing.md`). Without that sign-off, point the build at a non-production API instead (override `EXPO_PUBLIC_API_BASE_URL`, e.g. a local backend; no staging environment exists yet). Note: claims have no backend route, so the claims screens will 404 against any real API; demo them as UI only and say so.
5. Do not paste tokens, passwords or EAS secrets into chat, tickets or this repo.

## Build and install (Android)

Run by a team member with EAS access, on the team machine:

```
cd mobile
eas build --profile development --platform android
```

(This runbook's author did not run a build.) When it finishes, open the build page URL on the team-held device, download and install the internal APK (allow "install unknown apps" for the browser, once). Start the dev client; it needs a Metro dev server (`cd mobile && npx expo start --dev-client`) on the same network, or a reachable tunnel.

Confirm the flags before the demo: the Account tab should show Alerts, Report theft and Map & locations rows, and Claims.

## Pre-demo checklist

- cybersecurity-architect sign-off recorded if the API is production.
- Test customer account and 2-3 test assets created beforehand; no real names, addresses or ID numbers.
- Device charged, location permission granted for the demo app, notifications enabled.
- Backend awake (Render cold start can take ~30 s; open the app once ahead of time).
- Screen mirroring or camera setup tested.

## Demo script (about 10 minutes)

1. Sign in with the test account. Show Home (protection centre).
2. Assets: open a test asset, show registered details and plan usage.
3. Locations: open Map & locations, show the test asset's last known location (device self-reporting only; third-party hardware is "pending", say so plainly).
4. Alerts: open Alerts, show an alert and how it is acknowledged.
5. Report theft: walk the flow with the test asset up to submission; show the recovery case status.
6. Claims: open Claims and explain it is a UI preview; the claims backend is not built.
7. Close: summarise what is live versus planned (payments, claims backend, GPS hardware vendor).

## After the demo

Sign out, clear the app data or uninstall the dev client, and delete the test data if it was created on a shared API.
