# Feature 008 / ADR-0009: security review record

Append-only shared lifecycle document (CLAUDE.md house rules). Each review or remediation is a
dated section; earlier sections are never rewritten.

---

## 2026-11-20: Stage 8 review of PR #44 (`fix/location-report-server-consent`), owner-test phase

Filed by `backend-engineer` with the chair's text verbatim below; remediation status follows in the
next section.

### Stage 8 security review: PR #44 `fix/location-report-server-consent` (owner-test phase)

Reviewer: cybersecurity-architect (chair). Date: 2026-11-20.
Scope: worktree `wt-a7`. I read the files directly; there was no shell, so I did not run `git diff` or the test suites.
Basis: ADR-0009 SDL-4, SDL-9 and SDL-10; INC-001 §8 A-7 (`docs/organization/incidents/INC-001-location-ingestion.md:148`).

#### Verdict: FIX FIRST (one item, F-1). After F-1 is fixed, PASS for owner-test.

#### Files read
- `backend/src/routes/assets.ts`, lines 130-403 (report, consent grant, DELETE location)
- `backend/src/lib/location-consent.ts`
- `backend/src/repositories/location-consent-log.ts`
- `backend/src/repositories/assets.ts`, lines 292-366
- `backend/src/db/location-consent-collections.ts`
- `backend/src/config/env.ts`, lines 186-203 and 557-570
- `backend/src/lib/policy.ts`, lines 141-162
- `render.yaml`, lines 47-59
- `backend/src/routes/asset-location.test.ts`, lines 1069-1160
- `mobile/src/screens/location/enableTrackingForAsset.ts`
- `mobile/src/location/{consent.ts, backgroundLocation.ts, useLocationReporter.ts}`
- `mobile/src/screens/assets/AssetDetailScreen.tsx`, lines 213-261

#### Blocking finding

### F-1 (High for A-7). Withdrawal is written last, so for a moment the old grant still lets reports through, and a report can land after the purge. If the withdrawal write fails, consent is never withdrawn at all.
`backend/src/routes/assets.ts:366-383`. The DELETE handler runs in this order:
1. `clearLocationForAccount` (sets `reportingDeviceId: null`)
2. `locationEvents.deleteByAsset`
3. `recordWithdrawal`

What goes wrong:
- **Race.** Any report checked between steps 1 and 3 still sees the old grant as the newest consent event, so `isReportConsented` passes. Its write then matches `reportingDeviceId: null` (`repositories/assets.ts:317`). That write sets `lastLocation` again, binds the device again, and appends a new `location_events` row, all after the purge. The customer is told "N records deleted, tracking off", but a fresh location is stored. This is not a theoretical window: `AssetDetailScreen.tsx:228-230` clears local consent only after the DELETE returns. That means the 2-minute foreground timer or the background task can fire while the DELETE is still running.
- **Fails open.** If `recordWithdrawal` throws (a Mongo error), the data has already been purged but the grant is still the newest event. Reports keep being accepted, which breaks SDL-9 "opting out takes effect server-side immediately". The client shows an error, but the server is still accepting reports.

**Required fix:**
- Call `recordWithdrawal` first, before the clear and the purge. If it fails, return 5xx and leave stored data untouched; the user retries.
- Add a test: a report sent while a withdrawal is in progress must leave nothing stored. A deterministic stub ordering is enough.

Even after the reorder, a small window remains: a report whose consent check passed just before the withdrawal was written, but whose write lands after the purge. That residual is accepted for owner-test only (see R-3).

#### Checks requested

| Check | Result |
|---|---|
| Report from another device | Refused. The grant's `deviceId` is compared to the server-side `session.deviceId`, not a client claim (`location-consent.ts:33`, `assets.ts:178-190`). The asset's `reportingDeviceId` CAS (`repositories/assets.ts:317`) is a second, independent check. Tested at test.ts:1122. |
| Stale grant after withdraw | Refused, because the newest event wins (`findLatestByAsset`, sorted by `createdAt` then `_id`). Tested at test.ts:1112. A newer grant from a different device also supersedes the older one. |
| Race between withdraw and report | **Fails. See F-1.** |
| Background trigger without background scope | Refused. `scopeForTrigger('background')` returns `background`, and the grant must list it explicitly. The schema forbids a grant without `foreground`. The extended-triggers switch is checked before anything else. Tested at test.ts:1102. On mobile, `startBackgroundLocationUpdates` and the task body both require the local server-grant marker, and a `CONSENT_REQUIRED` response clears that marker and stops updates. |
| Fail-closed with the switch on and Mongo erroring | Fails closed. A throw from `findLatestByAsset` goes to `next(err)` and returns 500 before any write (`assets.ts:188`). The flag uses an exact `"true"` match, otherwise off (`env.ts:558`). No test covers this; adding one is non-blocking (NB-1). The withdrawal side fails open; that is covered by F-1. |
| Consent spoofing (scopes from the client) | Scopes are taken from the client. That is inherent: consent is the user's own statement, and the server cannot see OS permissions. The bindings that matter are all server-derived: account, `deviceId`, session, IP and user agent. The real spoofing risk is a stolen session granting consent. With step-up off this is mitigated only by the SDL-9 out-of-band email and push. See the A-7 status below. |
| Emails or push leaking data | Clean. Notices carry only the asset name, device name and asset ID, never coordinates (asserted at test.ts:1139-1147). The email HTML-escapes the asset name. Both notices are fire-and-forget and never fail the request. |
| Rate limits on the consent endpoints | Present, keyed per account: grant 30 per 15 minutes, withdraw 30 per 15 minutes (`policy.ts:150,159`). Each grant sends one email and one push, so the worst-case mail volume to the owner's own address is 30 per 15 minutes. Acceptable. NB-2: add a per-account notice cooldown before public launch. |
| Append-only integrity | Holds at application level: the repository only has `insertOne`, with no update or delete path. It is **not** append-only by privilege. The Mongo app user has readWrite, and there is a 10-year placeholder TTL (`location-consent-collections.ts:46`). The JSON-schema validator does not constrain `deviceId`, `scopes` or `consentTextVersion`. SDL-4 also asks for consent changes on Trail A (`app.account_audit_log`); that is still deferred (repo header, lines 8-17). Acceptable for owner-test (R-2). |

#### Non-blocking items
- **NB-1.** Add a test: `findLatestByAsset` throws, the response is 500, and nothing is stored.
- **NB-2.** Add a per-account cooldown on consent-change notices before public launch.
- **NB-3.** Grant POST (`assets.ts:244`) does not call `requireActiveAccount`. The report route does, so the harm is limited to a junk grant row and a notice, but it should be added for consistency.
- **NB-4.** Optional, mobile: in `performDisableTracking`, stop the foreground timer and background updates before sending the DELETE. This shrinks the R-3 window from the client side.

#### Residual risks (accepted for owner-test only)
- **R-1.** Step-up on opt-in is off (`LOCATION_CONSENT_STEP_UP_ENFORCED` unset). The owner-test profile has no real users or data, and the out-of-band notice is in place. This must be on before any non-owner user.
- **R-2.** The consent log is not append-only by privilege, and consent changes are not yet on Trail A (`app.account_audit_log`).
- **R-3.** After F-1, a narrow in-flight report race remains. The full fix is to make the consent check atomic with the write, or to re-check and sweep after the write. Required before public launch.

#### A-7 status: PARTIALLY CLOSED (after F-1 is fixed), not closed
A-7 covers SDL-4 and SDL-9: a server-side consent object, step-up, an out-of-band notice, and immediate opt-out.

| Element | Status |
|---|---|
| Server-side consent object (SDL-4) | Met, with Trail A deferred. The object records device, version and scopes. |
| Out-of-band notice | Met. |
| Immediate opt-out | Met only once F-1 is fixed. |
| Step-up (SDL-9) | **Not met** while the flag is off. The code says so itself (`env.ts:200-201`). |

A-7 cannot be marked closed while step-up is off. It is "partially closed, owner-test only; open item: step-up enforced plus Trail A". Two operating conditions apply for owner-test:
- `LOCATION_CONSENT_ENFORCED=true` must actually be set in Render once the A-7 APK is installed. Until then, this PR adds no enforcement.
- INC-001 stays open per its §8 closure rule.

---

## 2026-11-20: Remediation in PR #44 (backend-engineer)

- **F-1: FIXED in this PR.** `DELETE /v1/assets/:assetId/location` now records the withdrawal
  first (`backend/src/routes/assets.ts`, withdrawal handler). If that write fails the request
  returns 500 and nothing is cleared or purged, so the user is not told tracking is off. Only after
  the record exists are the location cleared and the history purged. `purgedEventCount` on the
  record is the count at withdrawal time (`locationEvents.countByAsset`); the response carries the
  number actually deleted.
- **R-3 narrowed in this PR (not closed).** The report handler re-checks consent after its write;
  if a withdrawal landed in between, it removes what it wrote and returns 403 `CONSENT_REQUIRED`.
  This is a re-check-and-sweep, not an atomic check-and-write.
- Tests (`backend/src/routes/asset-location.test.ts`, "Stage 8 PR #44 F-1"): (a) a report in
  flight when tracking is turned off is refused and leaves nothing stored; (b) a failed withdrawal
  write returns 500, purges nothing, and records no withdrawal; withdrawal-before-clear order.
- **NB-1 done** (lookup failure with enforcement on returns 500, stores nothing). **NB-3 done**
  (`requireActiveAccount` on the grant route). **NB-4 done**: `AssetDetailScreen` calls
  `stopLocationReportingNow()` (suspends the 2-minute timer and the report gate, stops background
  updates) before sending the turn-off request; reporting stays suspended until protection is
  turned on again. **NB-2 open** (notice cooldown, before public launch).
- **A-7 status: partially closed, owner-test only (step-up SDL-9 off; Trail A audit pending).**

## 2026-11-25: Stage 8 review of "Locate now" remote locate request (`feat/remote-locate-request`, PR #51), owner-test phase

Filed verbatim by `gps-integration-engineer` from the `cybersecurity-architect` review; heading levels shifted one down so it nests under this dated section.

#### Stage 8 Security Review: "Locate now" remote locate request (owner-test phase)

- Branch: `feat/remote-locate-request` (read-only file review; no shell, tests not run by reviewer)
- Reviewer: cybersecurity-architect, 2026-11-25
- Scope: owner-test only (OWNER-EXCEPTION-2026-11-17, `owner-test` profile). ADR-0009 §20 is **Proposed**.
- **Verdict: PASS for owner-test, with conditions C-1 to C-3. NOT approved for real users** (see §4).

### 1. Files reviewed
- `backend/src/routes/locate-requests.ts` (4 endpoints)
- `backend/src/repositories/locate-requests.ts`, `backend/src/db/locate-request-collections.ts`
- `backend/src/routes/assets.ts:130-306` (location-report `remote_request` handling)
- `backend/src/lib/location-consent.ts`, `backend/src/lib/asset-location-validation.ts`
- `backend/src/lib/push-notification-service.ts:33-107` (`sendToDevice`), `backend/src/lib/notification-brand.ts:393-404`, `backend/src/lib/domain-email-templates.ts:769-771`
- `backend/src/config/env.ts:186-204, 588-606`, `backend/src/lib/policy.ts:251-260`, `backend/src/index.ts:190`
- `mobile/src/location/remoteLocate.ts`, `remoteLocateTask.ts`, `useRemoteLocateResponder.ts`, `mobile/src/notifications/push.ts:14-19`

### 2. What holds up
| Check | Result |
|---|---|
| Owner-only authZ | Pass. `findByIdForAccount(accountId, assetId)` and a 404 for other accounts' assets (`locate-requests.ts:81-82`). Customer sessions only (`:55`). Active account checked (`:78`). |
| Fail-closed flag | Pass. Router mounted only when `REMOTE_LOCATE_ENABLED === 'true'` (`index.ts:190`), checked again in `gate()` (`:54`). `remote_request` refused when off (`assets.ts:171`). |
| Bound phone cannot answer for another asset | Pass. The server-side `session.deviceId` must equal `asset.reportingDeviceId` AND the open request's `targetDeviceId` (`assets.ts:200-215`), and `reportSelfDeviceLocation` checks the device again. Device identity comes from the server session, not the client. Decline checks the device too (`locate-requests.ts:224`). |
| Replay / expiry | Pass. Answerable only while `status: 'pending'` and `expiresAt > now` (10 min). Answering resolves all open rows, so a later replay gets CONFLICT. |
| Consent scope | Pass when `LOCATION_CONSENT_ENFORCED=true`. Background answers need `background` scope. Foreground needs `foreground`. Consent is checked again after the write (F-1 race undo, `assets.ts:278-292`). A withdrawal blocks the next answer. |
| Push payload | Pass. The data-only message carries `event`, `locateRequestId`, `assetId` (`:134`). The visible notice has fixed text and no coordinates. Expo push TTL 600 s. The API never returns coordinates, only `locationRecordedAt`. |
| Transparency on the target phone | Pass. A visible notice goes to the bound device whatever its push preference (`push-notification-service.ts:84-107`). The phone shows a local notice if no push reached it (`remoteLocate.ts:149`). |
| Security email | Pass for owner-test. The first request per account per UTC day sends the email (`:145-160`). |
| Rate limits | Pass. 6 per 15 min per account and 4 per 15 min per asset (`policy.ts:251-260`). |
| TTL purge | Pass. The TTL index on `purgeAt` (1 h) removes rows. No coordinates are stored. Validator enum is OK. |
| Data minimisation | Pass. `locate_requests` holds no coordinates. Mobile logs record outcomes only. |

### 3. Findings
| ID | Sev | Location | Finding | Required |
|---|---|---|---|---|
| F-1 | High (Medium in owner-test) | `locate-requests.ts:53-56`, `:95`; `assets.ts:220` | When `LOCATION_CONSENT_ENFORCED` is off, the server makes no consent check for request creation or `remote_request` answers. Only the phone's own local check protects the location. "Does not bypass" in `env.ts:191` is true, but remote locate should not run at all without server consent. | **C-1 (owner-test):** set `LOCATION_CONSENT_ENFORCED=true` on Render whenever `REMOTE_LOCATE_ENABLED=true`. **Before real users:** in code, `gate()` must throw NOT_FOUND unless `locationConsentEnforced === true && locationIngestionEnabled === true`. That check is fail-closed and also stops a pointless wake-up and notice when ingestion is off. |
| F-2 | Medium | `location-consent.ts:23`; `remoteLocate.ts:173` | `remoteContext: 'foreground'` comes from the client and lowers the required scope to `foreground`. An honest app is fine. A modified client or a stolen access token on the bound phone could claim foreground to answer with only foreground consent. The impact is limited because device binding still applies. | Before real users: have the server require `background` scope for every `remote_request`, or base the foreground case on evidence the server can check. Document the residual in ADR-0009 §20. |
| F-3 | Medium | `locate-requests.ts:64-107` | No step-up. Any stolen or compromised customer session anywhere can get a fresh location of the owner's phone on demand, which for a phone means where the person is. Mitigations today: rate limits, a visible notice on the phone, and the daily email. Acceptable for owner-test because the owner is the only data subject. | **Before real users:** require `assertProtectionStepUp` (MFA or password re-auth, about 10 min freshness) for `POST locate-request`. Reuse the existing protection step-up. |
| F-4 | Medium | `locate-requests.ts:110-124` | The audit write fails open: if the write fails, the locate still goes ahead. | C-2 (owner-test): accepted, because there is an error log. **Before real users:** fail closed (no audit row means no request). |
| F-5 | Low-Med | `locate-requests.ts:118-119` | The audit reuses `protection_change` with a string in `protectionDetail`. That records who, from which session and IP, and which asset, so it is enough for owner-test. The answer (answered / declined / expired) is not durably audited. The `location_events` row is deleted on withdrawal, and `locate_requests` is purged after 1 h, so there is no lasting record that the phone actually disclosed its location. | Before real users: add a dedicated audit event type (e.g. `location_locate_requested` / `location_locate_answered`) to the Postgres enum, and audit the outcome with no coordinates. |
| F-6 | Low | `locate-requests.ts:145-155` | Only the first request each day sends an email. The dedupe key is set before the fire-and-forget dispatch, so a failed send means no email for that day. An attacker's request after the owner's own one that day sends no email. | Before real users: also email when the request comes from a device or session that has not made a locate request before. Set the dedupe key only after the send succeeds. |
| F-7 | Low | `asset-location-validation.ts:22-30`; `assets.ts:237` | `capturedAt` has no lower bound, so a `remote_request` answer can carry an old fix and still mark the request "answered". | Before real users: for `remote_request`, reject `capturedAt` older than `request.createdAt` minus about 2 min. |
| F-8 | Info | `notification-brand.ts:399`; `remoteLocate.ts:46` | The visible notice also tells whoever is holding the phone, including a thief. POPIA transparency comes first here. The product and compliance-specialist should record this trade-off. The notice should name the requesting device (session `deviceName`) so the owner can spot a request that was not theirs. | compliance-specialist note in ADR-0009 §20. |
| F-9 | Info | `locate-requests.ts:67-72` | The rate limiters run before `gate()` and before the asset id is validated, so the per-asset key uses the raw param. This is harmless, because the account limiter bounds it. | None. |

### 4. Conditions and must-haves
**Owner-test (conditions of this PASS):**
- C-1: `LOCATION_CONSENT_ENFORCED=true` and `LOCATION_INGESTION_ENABLED=true` on Render whenever `REMOTE_LOCATE_ENABLED=true`. The mobile flag stays only in the `owner-test` profile, and the exception must not be widened.
- C-2: The fail-open audit (F-4) and the reused `protection_change` type (F-5) are accepted for owner-test only.
- C-3: Update the stage8-manifest entry for this surface by targeted splice, citing this review, as an owner-test scope verdict and not a real-user approval.

**Before any real user (blocking):** F-1 code-level gate, F-2, F-3 step-up, F-4 fail-closed audit, F-5 dedicated audit event plus outcome audit, F-6, F-7. ADR-0009 §20 ratified by cto. security-engineer and compliance-specialist concurrence (joint gate). A pentest or abuse-case test of the account-takeover → live-locate path (attack tree "attacker locates customer in real time").

## 2026-11-25: Remediation of the "Locate now" review (gps-integration-engineer, PR #51)

- **F-1 / C-1 fixed in code.** `gate()` in `backend/src/routes/locate-requests.ts` now calls `isRemoteLocateFullyEnabled(env)`. That function refuses with NOT_FOUND, the same response as switch-off, unless `REMOTE_LOCATE_ENABLED`, `LOCATION_INGESTION_ENABLED` and `LOCATION_CONSENT_ENFORCED` are all exactly `"true"`. `backend/src/index.ts` mounts the router only under the same condition. A `remote_request` report is refused with VALIDATION_ERROR unless `remoteLocateEnabled` and `locationConsentEnforced` are both on (ingestion is already checked first). `backend/src/config/env.ts` logs a startup warning when `REMOTE_LOCATE_ENABLED=true` but either of the other two is not. Tests: `backend/src/routes/locate-requests.test.ts` ("Stage 8 C-1 ...").
- **F-7 fixed.** A `remote_request` report must carry `capturedAt` no earlier than the open request's `createdAt` minus 2 minutes (allowance for phone clock skew, as §3 F-7 suggests). Otherwise it gets VALIDATION_ERROR, nothing is stored, and the request stays open. Tests: same file ("refuses a stale fix ...").
- **Still open before any real user (blocking):**
  1. Step-up on `POST locate-request` (F-3).
  2. Ignore the client `remoteContext` claim and require `background` scope for every `remote_request`, or base it on evidence the server can verify (F-2).
  3. Fail-closed audit with a dedicated event type and an outcome audit (F-4, F-5).
  4. Security email for each new requesting device or session, with dedupe set only after the send succeeds (F-6).
  5. ADR-0009 §20 ratified by `cto`.
  6. Joint gate sign-off (`security-engineer` + `compliance-specialist`).
  7. An account-takeover abuse test of the path from takeover to live locate.
  8. `compliance-specialist` note on the F-8 notice trade-off.

## 2026-11-25: Remediation of "Locate now" F-2 to F-6, backend (backend-engineer, branch `feat/locate-now-hardening`)

Appended; nothing above is changed. This covers items 1 to 4 of the "Still open" list in the
previous section. Backend only: no web or mobile code is touched. Items 5 to 8 stay open.

- **F-3 fixed (step-up).** `POST /v1/assets/:assetId/locate-request` now calls the existing
  `assertProtectionStepUp` (`backend/src/lib/step-up.ts`): a fresh MFA (`mfa_verified_at`) or
  password re-auth (`password_reauth_at`) on the current session, read live from `app.sessions`,
  within `PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS` (5 minutes). The check runs after the owner
  check and before anything else happens. Otherwise it returns 401 `STEP_UP_REQUIRED`, and no row,
  audit, push or email is created. It is listed as row G-4 in `CUSTOMER_PROTECTION_STEP_UP_ACTIONS`.
  There is a fail-closed, owner-test-only escape hatch, `REMOTE_LOCATE_STEP_UP_BYPASS`, modelled on
  `LOCATION_CONSENT_STEP_UP_ENFORCED`. Only the exact string `"true"` skips the step-up; unset or
  any other value keeps it enforced. It is declared in `render.yaml` with `sync: false`, and the
  backend logs a startup warning while it is on. A bypassed request is still audited, with method
  `bypass`. **The hatch must be unset before any real user.**
- **F-2 fixed.** `scopeForTrigger('remote_request')` always returns `background`. The
  `remoteContext` parameter is gone, so no client value can reach the consent decision. The body
  schema still accepts the field, so older apps do not get a 400, but the server ignores it.
  Request creation also checks for `background` scope. A bound phone that has only foreground
  consent is not woken, and its request is declined (`consent_required`) at once.
  Residual: a modified client with foreground consent can still send ordinary `foreground_open`
  reports. That is SDL-4's general client-honesty limit and is not specific to Locate now.
- **F-4 fixed (fail closed).** The `location_locate_requested` audit row is written before the
  `locate_requests` row exists, using a pre-allocated request id. If that write fails, the request
  is not created, the phone is not woken, no email is sent, and the caller gets 500
  `INTERNAL_ERROR`. The `remote_request` answer path does the same: the `answered` outcome is
  audited before the fix is stored. If that write fails, nothing is stored, the request stays
  open, and the phone gets 500. A failed audit of a decline also leaves the request open; it is
  audited later as `expired`. Residual: if the Mongo insert fails after the audit write succeeded,
  a `requested` row exists with no request behind it. This over-records, which is the safe
  direction.
- **F-5 fixed (dedicated types and outcome audit).** There are two new `app.audit_event_type`
  values in **`backend/migrations/043_feature008_locate_now_audit_event_types.sql`**: written,
  **not applied to any database**. Migrations live in `backend/migrations/`, not
  `supabase/migrations/`. Both values reuse `protection_detail`, which never holds coordinates:
  - `location_locate_requested`: `method|assetId|requestId`, where method is `mfa`, `password`
    or `bypass`.
  - `location_locate_answered`: `outcome|assetId|requestId`, where outcome is `answered`,
    `declined` or `expired`.

  Outcomes are audited one row per open request:
  - The actor of an answer or a decline is the phone's session.
  - A declined-at-creation request gets the `requested` row and then the `declined` row.
  - If the post-write consent re-check (the PR #44 F-1 undo) refuses a report, a `declined` row
    voids the earlier `answered` row (best effort).
  - `expired` is audited lazily, with no actor. This happens on the owner's next
    `GET .../locate-request/latest` and on the next request for the asset. A claim flag on the
    row (`expiryAuditedAt`) prevents duplicates, and a failed write is released and retried.
    Residual: a request nobody reads again before the 1 h purge gets no `expired` row. The
    `requested` row with no matching outcome still shows, durably, that it was not answered.

  **Deploy order: apply 043 before Render deploys this build.** Until it is applied, Postgres
  rejects the new values and Locate now fails closed: every request returns 500.
- **F-6 fixed.** The security email is now sent for the first request of the UTC day, AND for any
  request from a device that has not made a locate request before (keyed by session id when the
  session has no device id). The day key and the known-requester key (180 days) are set only after
  `dispatchProtectionNotice` reports success; that function now resolves `true` or `false`. A
  failed send sets no key, so the next request emails again. The send failure itself is still
  audited as `protection_change_notice_failed`. If the dedupe lookup fails, the email is sent.
  The email names the requesting device (session `deviceName`), as F-8 asks. Known-requester keys
  live in the KV store, so if that is in-memory, a restart forgets them and causes extra emails,
  which is the safe direction.
- **Tests.** `backend/src/routes/locate-requests.test.ts` has new "Stage 8 2026-11-25 F-3",
  "F-4/F-5" and "F-6" blocks, plus two F-2 tests that replace the old foreground-claim test.
  `backend/src/lib/location-consent.test.ts` and `backend/src/routes/protection-step-up.test.ts`
  are adjusted. Full backend suite: 112 files, 1505 tests passed. `npm run typecheck` is clean.
- **Now stale, owners to update by targeted edit:**
  - ADR-0009 §20 items 1 and 2 still describe the reused `protection_change` audit and the
    `remoteContext` relaxation.
  - The reason string of the `backend-remote-locate-requests` entry in
    `docs/organization/gates/stage8-manifest.json` says the same.
- **Still open before any real user (blocking):**
  1. ADR-0009 §20 ratified by `cto`.
  2. Joint gate sign-off (`security-engineer` + `compliance-specialist`), including a re-review of
     this remediation.
  3. An account-takeover abuse test of the path from takeover to live locate (now through
     step-up).
  4. `compliance-specialist` note on the F-8 notice trade-off.
  5. Client step-up UI for Locate now (web and mobile), then `REMOTE_LOCATE_STEP_UP_BYPASS` unset.
  6. Migration 043 applied by the owner.
