# Google Play "Data safety" declaration — answer key

**Owner:** compliance-specialist · **Date:** 2026-09-21 · **Status:** ~~ready to transcribe~~ **VOID —
superseded 2026-09-21 by §6. Current status: HELD — correction required before submission (INC-002).**
The struck text is retained deliberately so the change is auditable. **Read [§6](#6-correction--this-declaration-was-false-as-against-a-build-that-actually-shipped-inc-002)
before using anything below: the two location rows in §2 were false as against a build that actually
shipped on Google Play internal testing on 2026-09-21.**
**Scope:** the Android artifact built from EAS profile `playInternal` (extends `preview`) —
`mobile/eas.json` lines 22–45. This is the build going to Play internal testing.

> **Binding constraint on this declaration.** Every answer below is true *for the `preview` /
> `playInternal` / `production` feature-flag set*, where `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING`,
> `_KYC`, `_ALERTS`, `_THEFT_REPORTING`, `_HARDWARE_TRACKING`, `_SECURITY_OPERATOR` and `_CLAIMS`
> are all `"false"` (`mobile/eas.json`). **Flipping any of those flags to `"true"` in a shipped
> build invalidates rows in this table and requires a Data safety re-declaration before that
> build is uploaded.** See §4.

## 1. Evidence base

| Question | Verified in |
| --- | --- |
| Declared Android permissions | `mobile/app.json` (`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`) **but** `mobile/app.config.ts` `stripLocationFromConfig()` removes both permissions, the `expo-location` plugin, and `NSLocationWhenInUseUsageDescription` whenever `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING === 'false'` — which is the case for `preview`/`playInternal`/`production`. The shipped manifest asserts **no location permission**. |
| Camera / photos | `expo-image-picker` plugin (`app.json` lines 44–50); `mobile/src/screens/account/useProfilePictureUpload.ts` calls `requestMediaLibraryPermissionsAsync()` / `requestCameraPermissionsAsync()`. Used unconditionally in `AccountHubScreen.tsx` (L87, L202) — **not** behind the KYC flag. |
| Notifications | `expo-notifications` plugin; `POST/DELETE /devices/push-token` (`backend/src/routes/notifications.ts` L107–164) stores `deviceId`, Expo push token, platform, app version. |
| Location backend | `POST /v1/assets/:assetId/location-report` (`backend/src/routes/assets.ts` L101–183) is kill-switched fail-closed on `LOCATION_INGESTION_ENABLED` (`backend/src/config/env.ts` ~L117–130), per INC-001. Client-side `useLocationReporter.ts` returns before touching `expo-location`. **Two independent blocks; no location is collected.** |
| Account data | `POST /auth/signup` (`backend/src/routes/auth.ts` L73–87) accepts **email + password only** — no name at signup. Name / DOB / SA ID last-4 / address / emergency contact live in `backend/src/routes/customer-profile.ts`, reachable only through KYC-flagged mobile screens (`useCustomerProfile.ts` L22: `enabled: signedIn && FEATURE_KYC_ENABLED`). |
| Session/device data | `auth.ts` L327–480: `deviceId`, `deviceName`, IP address, user-agent recorded on session + audit log. |
| Analytics | `mobile/src/api/analytics.ts` → `POST /analytics/events`, first-party only (`session_start`, `signup_completed`, `policy_created`, `asset_registered`). **No third-party analytics/ads SDK** in `mobile/package.json` — no Firebase Analytics, Sentry, Amplitude, ad network. |
| Encryption in transit | All four EAS profiles set `EXPO_PUBLIC_API_BASE_URL=https://td-it-solution-insurance.onrender.com`; `mobile/src/api/config.ts` appends `/api/v1` to that host. Render terminates TLS and redirects HTTP→HTTPS. The `http://localhost:3000` fallback is dev-only and unreachable in an EAS build. **Yes.** |
| Deletion | `mobile/app/(auth)/delete-account.tsx` + `delete-account-confirm.tsx` (in-app **request**), `src/App.tsx` L70 `/delete-account` (web request page), `docs/organization/runbooks/account-deletion-request-runbook.md` (manual fulfilment). **No backend deletion route exists** — no automated deletion on account closure. |

## 2. Data-type-by-data-type answer key

"Shared" is used in Play's sense: transfer to a **third party** for that party's own use. Transfer
to a service provider processing on our behalf (Supabase, MongoDB Atlas, Render, Resend, Expo push)
is *not* "shared" under Play's definition, and none of those are user-directed transfers.

| Play data type | Collected | Shared | Optional/Required | Purposes to tick |
| --- | --- | --- | --- | --- |
| **Approximate location** | **No** | — | — | — |
| **Precise location** | **No** | — | — | — |
| **Name** | **No** (not collected at signup; profile name is KYC-flag-gated and off) | — | — | — |
| **Email address** | **Yes** | No | Required | App functionality; Account management; Fraud prevention, security & compliance |
| **User IDs** | **Yes** (account ID, session ID) | No | Required | App functionality; Account management; Fraud prevention, security & compliance |
| **Device or other IDs** | **Yes** (`deviceId`, device name, Expo push token) | No | Required | App functionality; Fraud prevention, security & compliance |
| **Photos** | **Yes** (optional profile picture, camera or library) | No | **Optional** | App functionality; Account management |
| **App interactions** (under App activity) | **Yes** (first-party events above) | No | Required | Analytics; App functionality |
| **Other personal info** (Personal info → Other) | **Yes** — registered asset records (type, make/model, serial/IMEI) and policy/plan records | No | Required | App functionality |
| Phone number | **No** (KYC-gated, off) | — | — | — |
| Address, Date of birth, Government ID (SA ID last-4) | **No** (KYC-gated, off) | — | — | — |
| Financial info / Purchase history / Payment info | **No** — no payment gateway integrated, no `payments.ts` route | — | — | — |
| Crash logs / Diagnostics / Other app performance data | **No** — no crash-reporting SDK bundled | — | — | — |
| Contacts, Calendar, SMS/Call logs, Audio, Files & docs, Music, Health & fitness, Web browsing, Installed apps, Search history, Ads/Advertising ID | **No** | — | — | — |

**Advertising and Personalization purposes: do not tick any row.** No ad SDK, no advertising ID,
no personalization logic exists in this build.

## 3. Overall / security section answers

| Play question | Answer | Basis |
| --- | --- | --- |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | HTTPS-only Render origin in every EAS profile; §1. |
| Do you provide a way for users to request that their data be deleted? | **Yes** | In-app request flow + `https://<site>/delete-account` web page. Supply that URL as the deletion request URL. |
| Is all user data deleted automatically when the user deletes their account? | **No — do not tick "account deletion" as automated.** | Deletion is a **manual, request-based** process (runbook). There is no in-app "delete my account" action that deletes data, and no backend deletion endpoint. Declaring otherwise would be a false statement to Play. |
| Data collection is optional for some types? | **Yes** — Photos only | All other collected types are required for core functionality. |
| Has your data collection & security practices been independently validated? | **No** | No third-party security assessment has been performed. |

## 4. Re-declaration triggers (compliance hold)

Re-open this document and amend the Play declaration **before** uploading a build where any of
the following is true:

1. `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING=true` → Precise location (and likely Approximate) become
   **Collected: Yes**, and INC-001's outstanding consent/retention/withdrawal conditions
   (`docs/organization/incidents/INC-001-location-ingestion-popia-assessment.md` §"conditions 1–4")
   must close first. Location is also the one data type where the **security-company sharing**
   question turns live.
2. `EXPO_PUBLIC_FEATURE_KYC=true` → Name, Phone number, Address, Date of birth, and Government ID
   become **Collected: Yes** (Government ID = SA ID last-4; Play's "Government ID" type covers
   partial identifiers).
3. `EXPO_PUBLIC_FEATURE_THEFT_REPORTING=true` **or** `_SECURITY_OPERATOR=true` → recovery cases
   become creatable and readable by security-company operators
   (`backend/src/routes/security-cases.ts`, which exposes `accountId`, case status, reference and
   `lastLocationAt` to a partner org). **Sharing determination required at that point**: if
   partner security companies act strictly on our documented instructions under a written operator
   agreement, this is a service-provider transfer and Play treats it as *not* "shared"; if they use
   the data for their own purposes, it **is** "shared" and must be declared as such per data type.
   No such partner agreement is executed today — this is an open compliance item, not a settled
   "no".
4. A payment gateway is integrated → Financial info rows change and PCI-DSS scope review applies.
5. Any crash-reporting or analytics SDK is added → Crash logs / Diagnostics rows change.

## 5. Notes not for the form, but for the record

- The `app.json` location permissions are real in source and would ship if the flag defaulted on.
  The strip is build-time. Verify the produced AAB's manifest once (`aapt2 dump permissions`) before
  the first Play upload — Play cross-checks declared permissions against the Data safety form, and a
  manifest/form mismatch on location is a common rejection cause.
- Regulatory regime for this declaration is unresolved platform-wide: POPIA is the working
  assumption (ZA bundle ID `co.za.tditsolutions.insurance`, ZA address fields defaulting to `ZA`),
  but Play distribution is global and any EU installs bring GDPR Art. 3(2) into play. The Play form
  does not ask which regime applies; the deletion and disclosure commitments made on it are
  enforceable regardless.

---

## 6. CORRECTION — this declaration was false as against a build that actually shipped (INC-002)

**Appended 2026-09-21 by `compliance-specialist`, the same day as §1–§5 and after them. Append-only:
§1–§5 are NOT rewritten and their answer key is NOT restated here as though it had always been
correct.** This section is the honest record of what happened. Read it before transcribing anything
from §2 into the Play Console.

### 6.1 Status of this document

> **NOT SAFE TO TRANSCRIBE AS-IS. This answer key is under a compliance hold.**
> §3 of the table at §2 (the two **location** rows) was **factually wrong for the artifact that was
> actually uploaded** on 2026-09-21. The rows are correct only for a build whose location flags are
> literally `"false"`. **Do not submit or re-affirm this declaration until INC-002-C-1 and
> INC-002-C-2 close.** Status changes from *"ready to transcribe"* (§ header, still shown above as
> originally written) to **"HELD — correction required before submission."**

### 6.2 What actually happened

On 2026-09-21 the `playInternal` EAS profile was set to
`EXPO_PUBLIC_FEATURE_LOCATION_TRACKING="true"` (with `_HARDWARE_TRACKING`, `_ALERTS`,
`_THEFT_REPORTING`, `_SECURITY_OPERATOR`). That AAB was built, submitted, and went **live and
installable on the Google Play internal-testing track** before the flag was reverted the same day.

Because `mobile/app.config.ts`'s `stripLocationFromConfig()` runs **only** when the flag is the
literal string `'false'` (`app.config.ts:11-13,101`), the uploaded bundle's Android manifest
**declared `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` and shipped the `expo-location`
plugin.**

**Therefore, for the period that build was active, the Data safety declaration on file — answering
Precise location: No and Approximate location: No — was false as against the uploaded artifact.**
That is the exact failure mode §5 of this document warned about in writing (*"a manifest/form
mismatch on location is a common rejection cause"*) and asked to be pre-empted with an
`aapt2 dump permissions` check before the first upload. **That check was not performed.** The
warning was correct; it was not acted on. Both halves belong on the record.

### 6.3 What was and was not collected — stated precisely, neither minimised nor inflated

| | Position |
|---|---|
| Was the **precise-location capability** live in a distributed build? | **Yes.** Manifest permission declared; `useLocationReporter.ts` guard open; the in-app opt-in primer reachable |
| Was location collected **automatically on install**? | **No.** Capture additionally required a device-local consent grant, a linked smartphone asset, and an OS permission grant (`useLocationReporter.ts:20-31`) — a tester had to opt in |
| Was any location value actually **captured or transmitted**? | **UNDETERMINED as at 2026-09-21.** INC-002 D-1/D-2/D-4 are unreturned. **This document must not assert "no data was collected" until they return.** |
| Is the declaration therefore "technically still accurate because nothing was collected"? | **No, and do not advance that argument.** Play's own guidance requires the declaration to be complete and accurate against the uploaded app, and Play cross-checks manifest permissions against declared data types. A declared precise-location permission with a live in-app opt-in path is, at minimum, a materially incomplete declaration |

### 6.4 The binding constraint at §Scope was breached, not observed

The constraint reads: *"Flipping any of those flags to `"true"` in a shipped build invalidates rows
in this table and requires a Data safety re-declaration before that build is uploaded."* Five flags
were flipped and the build was uploaded **without** re-declaration. The constraint was correctly
written and structurally unenforced — nothing mechanical connected `mobile/eas.json` to this
document. That is INC-002 §6's root cause and is being remedied by INC-002-C-3.

### 6.5 Correction to §4's re-declaration trigger list — trigger 1 was necessary but insufficient

§4(1) correctly names `LOCATION_TRACKING=true` as a re-declaration trigger. **Two defects, found the
expensive way:**

1. **The triggers are stated as `=true`. The flags are fail-OPEN.** Both
   `mobile/src/config/features.ts:16-18` and `mobile/app.config.ts:12` test
   `!== 'false'`, so an **unset, blank, misspelled or `"False"`** variable enables location and ships
   the permission. **A trigger list phrased "when the flag is true" does not catch the case where the
   flag is missing** — which is the more likely failure. Read every trigger in §4 as *"whenever the
   flag is not literally `\"false\"`."* Remedy: INC-002-C-3/C-4.
2. **§4(1) makes INC-001's conditions a precondition but nothing enforced it.** They were open on
   2026-09-21 (INC-001-C-1, C-3, C-4 — see INC-002 §3) and the build shipped anyway.

### 6.6 What must happen before this declaration is submitted or re-affirmed

1. **INC-002-C-1** — establish what was actually submitted in the Play Console versus what §2 says.
   This document is the *intended* answer key; the console holds the *binding* one, and they have not
   been reconciled.
2. **INC-002-C-2** — correct the console declaration against whatever is actually shipped. **Editing
   this repository file does not correct the Play Console.**
3. **Re-declare §2 against the real `playInternal` flag set.** As reverted (`eas.json:46-55`),
   `LOCATION_TRACKING` and `HARDWARE_TRACKING` are now `"false"` but **`_ALERTS`,
   `_THEFT_REPORTING` and `_SECURITY_OPERATOR` remain `"true"`** — so §2 is *still* not a description
   of the current profile even after the location revert. §4(3)'s **sharing determination** for
   security-company operators is live and unresolved, and the partner operator agreement it turns on
   does not exist. **`compliance-specialist` re-approval is required before the next upload**
   (INC-002 §4(4)).
4. **Verify the produced AAB**, not the config: `aapt2 dump permissions` on the actual artifact, with
   the output recorded, per §5 — now a hard gate rather than a note.

### 6.7 What this correction does not do

- Does not retrospectively make §2's location rows true for the shipped build. They were false.
- Does not assert that any location data was collected — that is INC-002 D-1/D-2/D-4 and is open.
- Does not determine the Play policy consequence of the mismatch. That is flagged to counsel at
  INC-002 §9.7(1) and is not settled by this document or by me.
- Does not release INC-001-C-1, C-3 or C-4, which remain the precondition in §4(1).

**Cross-reference:** [`incidents/INC-002-play-internal-location-reenablement.md`](incidents/INC-002-play-internal-location-reenablement.md)
§9.4 (the ruling this correction implements) and §9.6 (conditions C-1…C-9).
