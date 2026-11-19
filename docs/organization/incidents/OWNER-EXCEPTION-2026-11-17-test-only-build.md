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
