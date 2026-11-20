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
