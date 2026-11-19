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
