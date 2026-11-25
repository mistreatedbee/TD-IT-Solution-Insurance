# Owner exception — test-only build with all gated features on (2026-11-17)

**Recorded by:** `cto` (acting for the owner's instruction). **Status:** in force until the owner says otherwise. This is a new file; it changes no other incident, ADR or review.

## The decision
The product owner stated, in the working session on 2026-11-17: "everything we are doing here is for testing, there is no real user included. I will tell you once we launch it to the public. For now unblock everything that is related to the risk of real users or data, like location and reporting, everything should work, for the whole system, the app and the website, and give me the build."

## What this authorises (and only this)
- A new EAS build profile `owner-test` in `mobile/eas.json` (Android APK, internal distribution, channel `owner-test`) with **every** `EXPO_PUBLIC_FEATURE_*` flag set to `"true"`. It is exempted **by name** in `mobile/scripts/verify-eas-feature-flags.mjs`; every other profile (`preview`, `playInternal`, `preview-simulator`, `production`) stays locked off and fully checked.
- Switching on the matching server and website switches (Render: location, claims, dispatch, partner location sharing; Vercel: the security-dashboard flag) for **this test system**, by the owner or at the owner's instruction.

## Limits (binding)
1. **No real users and no real customer data.** The build and the switched-on server features are for the owner's own testing. The system has no non-production database, so test data is created in the live Supabase and Atlas projects; do not onboard real customers while this exception is in force.
2. **Install and share:** the APK is for the owner's own phone and named test devices only. Do not forward the install link. Never `eas submit`; no upload to any Google Play or TestFlight track (INC-002-X-1 is untouched).
3. **Not a release.** It is not a release candidate and does not satisfy Release Gate A, any Stage 8 or Stage 10 gate, or any compliance ruling. INC-001, INC-002 and INC-004 stay open; their findings are unchanged.
4. **Known gaps while it is on:** the server does not yet check consent before accepting a location report (INC-001 A-7); the claim decision notice needs real insurer details before any real claim (placeholders block start-up in production; test values must be replaced); partner location sharing is for testing only.
5. **Reversal before public launch (the owner will say when):** delete the `owner-test` profile and its exemption line in `verify-eas-feature-flags.mjs`; set the Render and Vercel switches back; replace any test notice values with the real ones; run the normal Stage 8 and Stage 10 gates; rotate any test credentials.

## Why recorded
The existing controls were written to stop a real-user incident (INC-002). The owner has accepted that risk for a no-real-users test system. This record makes the exception visible, bounded and reversible.

## Addendum 2026-11-19: admin Locations list (cto go-with-conditions)
The Admin Dashboard Locations page and `GET /v1/admin/locations` (read-only, admin-only, audited as a bulk disclosure) are added under this exception. It is mounted only when the Render variable `ADMIN_LOCATIONS_ENABLED=true`; unset means off and the route returns 404. It deviates from ADR-0009 SDL-5 (staff location reads should cite a recovery case) because it lists all located phones and trackers. Stage 8: recorded waiver `web-admin-locations`, no review performed. Reversal, added to the list above: set `ADMIN_LOCATIONS_ENABLED` off, and before public launch either put the route through a full Stage 8 review with a case-reference purpose, or remove it. cybersecurity-architect to queue the review.

## Addendum 2026-11-19: key-free maps on Android (PR #24, cto MERGE NOW)
The owner's Google Cloud free trial has ended, so Google Maps requests are refused, and the Android build has no Maps key. Android maps now use an in-app WebView with Leaflet and the public OpenStreetMap tile server (Stage 8 waiver `mobile-leaflet-webview-map`, no review performed).
- The public OSM tile server is for low-volume testing only.
- Tile requests reveal the approximate area of a shown asset to a third party (OpenStreetMap).
- Before public launch: (a) tile provider decision by integration-architect (commercial OSM-based tiles, or a restored Google billing account), recorded as an ADR; (b) POPIA note from compliance-specialist on location reaching a third party through tile requests; (c) Stage 8 review of the WebView; and bundle Leaflet locally instead of loading it from unpkg.
- Owner action: Google Cloud billing must be upgraded by 2026-12-19, or the native (keyed) Google map path stays unavailable. The Maps key was removed from the EAS build environment on 2026-11-19 so Android uses the OpenStreetMap path.

## Addendum 2026-11-19: opening permissions prompt and 2-minute foreground location reporting (cto go-with-conditions)
Recorded by `mobile-engineer` at `cto`'s direction. Added under this exception, owner-test build only, behind the new flag `EXPO_PUBLIC_FEATURE_LAUNCH_LOCATION_PROMPT` ("true" in `owner-test` only, "false" in `preview`, `playInternal`, `preview-simulator` and `production`; the owner-test allow-list in `verify-eas-feature-flags.mjs` is not widened). Stage 8 waiver `mobile-launch-permissions-and-periodic-location`, no review performed.

What was added:
- **Opening permissions explainer** (`mobile/src/permissions/`), shown on first open before or after sign-in, built only from `mobile/src/design` components and day/night tokens. Two steps:
  - **Location step first.** Wording: location is used only while the app is open; your location is not shared until you turn on protection for an asset; you can change this in Settings. "Allow" asks for foreground ("when in use") permission only.
  - **Camera step second** (owner scope addition, same day). Wording: the camera is used to take photos in the app, today your profile picture; nothing is taken or uploaded unless you choose to; you can change this in Settings. "Allow" calls `expo-image-picker` `requestCameraPermissionsAsync` only. No new native permission was added (the existing `cameraPermission` string in `app.json` is used).
- **One-tap "Turn on protection for this phone"** on the home screen, shown after sign-in only when the customer has exactly one active smartphone asset and no consent decision is stored. It opens the same `LocationConsentModal` and runs the same consent code as the asset screen (`enableLocationTrackingForAsset`, now shared by both).
- **2-minute periodic foreground reporting** in the existing reporter (`mobile/src/location/useLocationReporter.ts`, mounted in the signed-in shell), sent as `triggeredBy: 'periodic_foreground'`. The backend accepts that value only when its own switch `LOCATION_EXTENDED_TRIGGERS_ENABLED=true` is on (separate PR); until then those reports are rejected and the app treats that as a quiet failure.

Conditions (all binding, all implemented and covered by tests):
1. "Allow" on the location step never calls `POST /assets/:id/location-consent`, never links an asset, never starts the reporter and never reads or sends a position. Turning on protection stays a separate, explicit step through the consent modal.
2. "Allow" on the camera step only asks for camera permission. It never opens the camera, never picks a photo and never uploads anything.
3. "Not now" on either step is re-offered at most once every 7 days (stored on the device).
4. Permanently denied (`canAskAgain` false): the OS prompt is never shown again; the step offers "Open Settings" (`Linking.openSettings`) instead.
5. Before sign-in nothing location-related runs apart from the explainer and the OS permission prompt.
6. The one-tap path shows the consent text before anything is recorded. If OS permission is already granted, only the OS prompt is skipped; the consent modal, the local consent record and the server consent POST still happen first.
7. Periodic reports run only while the app is in the foreground. Each tick re-checks the same gate (location-tracking flag, consent, linked smartphone asset, granted permission). The timer stops when the app goes to the background, on sign-out, and as soon as consent is withdrawn. A resume report and a timer tick never both fire together. No background location, no `ACCESS_BACKGROUND_LOCATION`, no "Always" permission.
8. A seam is left for a later background sender (shared `canReportLocation()` gate and a shared last-sent timestamp so a background send within 2 minutes of a foreground send is skipped). No background sender has been built.

**Higher exposure while INC-001 A-7 is open.** These changes mean more location reports, and more often: an OS grant at first open plus a report every 2 minutes while the app is open. The server still does not check for a consent record before accepting a location report (INC-001 A-7). Consent is enforced on the device only. So the exposure from A-7 is larger than before this addendum. **A-7 must be fixed before public launch.** That sits alongside, not in place of, the reversal list above.

Reversal, added to the list above: set `EXPO_PUBLIC_FEATURE_LAUNCH_LOCATION_PROMPT` to "false" (or delete it with the `owner-test` profile). Before any public use, `cybersecurity-architect` and `compliance-specialist` must do a real Stage 8 review of the explainer wording (location and camera), the one-tap path and the periodic reporting interval, and A-7 must be closed.

## Addendum 2026-11-19: Android background location tracking (cto go-with-conditions)
Recorded by `mobile-engineer` at `cto`'s direction. Added under this exception, **owner-test build only, Android only**, behind the new flag `EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION` ("true" in `owner-test` only; "false" in `development`, `preview`, `playInternal`, `preview-simulator` and `production`). The owner-test allow-list in `verify-eas-feature-flags.mjs` is not widened. Stage 8 waiver `mobile-android-background-location`, no review performed. The design this builds on, ADR-0009 §19, is **Proposed, not ratified**.

What was added:
- **Background task** (`mobile/src/location/backgroundLocation.ts`): an `expo-task-manager` task defined at module scope, imported from the new app entry `mobile/entry.ts` before `expo-router/entry`. It receives `expo-location` updates (Balanced accuracy, 100 m / 5 minutes, deferred 5 minutes, pauses automatically where the OS supports it) and sends at most one report per delivery with `triggeredBy: 'background'`.
- **Native permissions, owner-test only.** `mobile/app.config.ts` adds `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` and the `expo-location` options `isAndroidBackgroundLocationEnabled` / `isAndroidForegroundServiceEnabled` only when `EAS_BUILD_PROFILE` is `owner-test` and both the location-tracking and background-location flags are "true". iOS is not changed: no `UIBackgroundModes` "location", and the "fetch" mode that `expo-task-manager` adds automatically is removed again for every profile.
- **"Allow all the time" explainer** (`mobile/src/location/BackgroundLocationOffer.tsx`, `mobile/src/design` components only), shown on the home one-tap card and the phone's asset screen **only after protection is on for this phone**. It explains the 5-minute / 100 m reporting, the persistent notification, and that Android 11+ opens settings. "Allow all the time" calls `requestBackgroundPermissionsAsync`; "Not now" or a refusal leaves foreground reporting as it was.
- **Persistent notification** "TD Insurance is protecting this phone" whenever background updates run (Android foreground service).
- **CI check** `mobile/scripts/verify-background-location-config.mjs` (mobile job in `.github/workflows/ci.yml`): resolves the full Expo config, including plugin output and the generated AndroidManifest permissions, for every eas.json profile. It fails if any profile other than `owner-test` declares a background permission or option, also with the location flags forced "true", and fails if `owner-test` does not declare them (so the check cannot pass by seeing nothing).

Conditions (all binding, all implemented and covered by tests):
1. Background permissions and options appear in the `owner-test` build only, enforced in CI as above. The new flag is "true" only in `owner-test`. The three flag scripts now expect 10 flags.
2. Background reports always send `triggeredBy: 'background'`. A server `VALIDATION_ERROR` (for example `LOCATION_EXTENDED_TRIGGERS_ENABLED` off) stops updates quietly.
3. Every task run re-checks the flags, the local consent, the linked smartphone asset, the OS permission and a valid session. The session uses the in-memory access token, or the refresh token read from SecureStore through the existing single-flight refresh. If the refresh fails, updates stop; nothing retries in a loop. Any failing check makes the task call `Location.stopLocationUpdatesAsync` itself. Updates also stop on sign-out (`setSignedOut`), on consent withdrawal and when the asset is unlinked. A send is skipped within 2 minutes of any earlier send (`wasLocationSentRecently()`), and `markLocationSent()` is called after a successful send, so foreground and background never double up. No coordinates, tokens or asset ids are written to logs.
4. Foreground permission comes first (unchanged). The background offer appears only after protection is on. Declining keeps foreground reporting working. Android only.
5. Battery budget: Balanced accuracy, `distanceInterval` 100, `timeInterval` 300000, `deferredUpdatesInterval` 300000. The server rate limit (20 per 15 minutes per account) is not changed. Background sends are skipped while the app is in the foreground; the 2-minute foreground timer covers that time.

**Higher exposure while INC-001 A-7 is open.** Background reporting builds a dense movement history of the person carrying the phone, including while the app is closed. The server still does not check for a consent record before accepting a location report (INC-001 A-7), so consent is enforced on the device only. **A-7 must be fixed before public launch.**

**Before any public build (none of this is done):** the Google Play background-location permission declaration (and its video) must be filed; `cybersecurity-architect` and `compliance-specialist` must do a real Stage 8 review, including a POPIA assessment of background collection, the explainer wording and how long background points are kept; INC-001 A-7 must be closed; ADR-0009 §19 must be decided by `cto`.

Reversal, added to the list above: set `EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION` to "false" (or delete it with the `owner-test` profile), and remove the owner-test branch in `mobile/app.config.ts` (`applyAndroidBackgroundLocation`). Background updates already running on the owner's phone stop on the next task run once the flag is off, on sign-out, or when protection is turned off.

## Addendum 2026-11-20: Feature 024 Phase 1a, assistant entry and Talk to support (cto ruling)
Recorded by `mobile-engineer` under `cto`'s ruling in `docs/features/024-in-app-assistant-and-support/README.md` §11 (rulings 1 and 3). Added under this exception, **owner-test build only**, behind the new 11th flag `EXPO_PUBLIC_FEATURE_ASSISTANT_ENTRY` ("true" in `owner-test` only; "false" in `development`, `preview`, `playInternal`, `preview-simulator` and `production`). The owner-test allow-list in `verify-eas-feature-flags.mjs` is not widened; the three flag scripts now expect 11 flags. Stage 8 waiver `mobile-assistant-entry-and-support-sheet`, no review performed.

What was added: the Home header assistant button in place of the Alerts bell (the unread count stays on the Alerts tab; Alerts remain reachable from the tab and the Needs attention card); the `(app)/assistant` screen with an honest "The assistant is coming soon" state and **no AI or network calls**; the emergency banner (Report theft when theft reporting is on, and Call 10111); and the Talk to support sheet (call / email / WhatsApp links only, from `EXPO_PUBLIC_SUPPORT_PHONE` / `_EMAIL` / `_WHATSAPP`, unset by default; unconfigured options are hidden and the sheet says "Support contact details are being set up" when none are set). No contact details were invented.

Not covered by this addendum: Phase 1b (the AI assistant itself, the Render `ASSISTANT_ENABLED` switch) still needs the AI-vendor ADR ratified by `cto`, the key in Render and the spend cap first (§11 ruling 2 and 4).

Before any other profile gets this: a real Stage 8 review by `cybersecurity-architect`, Stage 10 QA, `design-system-manager` sign-off on the header change and the new screen, and the owner's real support channels.

Reversal, added to the list above: set `EXPO_PUBLIC_FEATURE_ASSISTANT_ENTRY` to "false" (or delete it with the `owner-test` profile). The Home header then shows the Alerts bell again.

## Addendum 2026-11-20: admin asset detail location (cybersecurity-architect PASS for owner-test only)
Recorded by `backend-engineer`. `GET /v1/admin/assets/{assetId}/location` and the Location section of the admin asset detail page are added under this exception. Like `/admin/locations`, the route is mounted only when `ADMIN_LOCATIONS_ENABLED=true`. Review: "Stage 8 review — feat/admin-asset-detail-full (owner-test phase)" in `docs/features/004-policy-asset-management/security-review-admin-surface.md`. Its three cheap fixes are already in: fail closed with no consent record, no location for archived assets, and the `asset_location` audit type.

**Must change before real users (none of this is done):**
- R1: serve exact location only with an open recovery case. Otherwise require a reason code, free-text justification and step-up MFA (no more than 5 minutes old), with the reason stored in the audit row.
- R2: with no open case, show coarse location only (rounded coordinates, no history).
- R3: a per-admin daily cap on distinct owners viewed, with an alert when it is crossed.
- R4: an ADR-0009 amendment, a compliance-specialist POPIA sign-off and a privacy-notice disclosure.
- R5: reverse this owner exception and remove the `ADMIN_LOCATIONS_ENABLED` dependency, so the gating is structural.
- R6: a real (non-waiver) Stage 8 manifest entry covering this endpoint and `/admin/locations`.

Reversal, added to the list above: set `ADMIN_LOCATIONS_ENABLED` off. This route then returns 404, and the page says the location view is not switched on.

## Addendum 2026-11-25: widening for the admin asset location view (cto MERGE once CI green, with conditions)
Recorded by `backend-engineer` under `cto`'s MERGE-with-conditions ruling on PR #49. This exception is widened to cover the backend flag `ADMIN_LOCATIONS_ENABLED` and the new route `GET /v1/admin/assets/:assetId/location`, which sits behind that flag alongside `GET /v1/admin/locations`.
- **Default is off.** The flag is unset by default, is not in `render.yaml`, and the route returns 404 when it is unset.
- **Why it is on now.** It is set to `true` on the single Render environment only, because all data there is the owner's own test data and there are no real users.
- **When it must go off.** Switch it off before any real customer data exists on that environment, and keep it off until R1–R6 close (listed in the 2026-11-20 addendum above and in `docs/features/004-policy-asset-management/security-review-admin-surface.md`). Nothing in this addendum clears it for public launch.
- **Stage 8.** cybersecurity-architect PASS for owner-test only (2026-11-20). Manifest entry `backend-admin-asset-location`: verdict `pass-owner-test-only-concurrence-pending`.

Reversal, added to the list above: unset `ADMIN_LOCATIONS_ENABLED` on Render.

## Addendum 2026-11-25: "Locate now" from another signed-in device (cto go/no-go pending)
Recorded by `gps-integration-engineer`. Built on branch `feat/remote-locate-request` for the **owner-test build only**, behind the new 12th flag `EXPO_PUBLIC_FEATURE_REMOTE_LOCATE` ("true" in `owner-test`, "false" in every other profile), the web flag `VITE_FEATURE_REMOTE_LOCATE` (off unless "true") and the backend switch `REMOTE_LOCATE_ENABLED` (render.yaml `sync: false`, unset = off, router not mounted). `cto` has not yet given a go/no-go on merging it.

What was added: signed in on any device, the owner can press Locate now on a smartphone asset whose location comes from another phone (mobile asset detail, web protection map). The bound phone sends one fresh location through the existing report path (`triggeredBy: 'remote_request'`), only with its consent; otherwise the request is answered "consent required" and no location is sent. The phone shows "Your location was requested from another device signed in to your account", and the account gets the security email for the first request each day. ADR-0009 §20 (Proposed). Stage 8 waivers: `backend-remote-locate-requests`, `backend-remote-locate-pending-checkin`, `mobile-remote-locate`, `web-remote-locate`.

Reversal, added to the list above: unset `REMOTE_LOCATE_ENABLED` in Render, set `EXPO_PUBLIC_FEATURE_REMOTE_LOCATE` and `VITE_FEATURE_REMOTE_LOCATE` to "false" (or delete with the `owner-test` profile).

### 2026-11-25 follow-up: Stage 8 review filed for "Locate now"
`cybersecurity-architect` gave a PASS for owner-test only, with conditions C-1 to C-3. The review is filed in `docs/features/008-self-device-gps-tracking/security-review.md` (sections dated 2026-11-25). C-1 is now enforced in code: Locate now does not work unless `REMOTE_LOCATE_ENABLED`, `LOCATION_INGESTION_ENABLED` and `LOCATION_CONSENT_ENFORCED` are all "true". Stale fixes (F-7) are also refused. **Must-haves before any real user:** step-up on `POST locate-request`; ignore the client `remoteContext` claim; fail-closed audit with a dedicated event type plus outcome audit; security email for each new requesting device; ADR-0009 §20 ratification; joint gate sign-off; and an account-takeover abuse test.
