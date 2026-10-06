# Feature 009 — Offline-Tolerance Manual Device QA Checklist

**Owner:** `manual-qa-engineer`
**Scope:** Mid-request network-drop behavior for theft reporting, asset-location consent, and
security-operator case actions — the offline-tolerance work shipped in commits `d8ed4b1`,
`e4d8f66`, `4a4e599`, `c7ba6dd` (now on `origin/main`).
**Status:** Ready for on-device execution — not yet run.
**Gate:** Required by `cto` as a Stage 10 (QA) condition for this work. Code review and automated
tests (mocked network failures) do not satisfy this gate — the scenarios below depend on a real
mid-request network drop, which simulators cannot reliably reproduce because they share the
host machine's network stack.
**Related:** [`07-tracking-provider-architecture.md`](./07-tracking-provider-architecture.md) ·
[`08-qa-security-accessibility.md`](./08-qa-security-accessibility.md) ·
[`mobile-qa-checklist.md`](./mobile-qa-checklist.md)

Screens under test (`mobile/src/screens/`):
- `recovery/ReportTheftConfirmScreen.tsx`
- `assets/AssetDetailScreen.tsx`
- `security/SecurityCaseDetailScreen.tsx`

---

## Prerequisites

- [ ] One physical **Android device** (minimum requirement). iOS physical device optional but
      preferred if available — repeat the applicable scenarios on both if so.
- [ ] A proxy tool capable of killing/aborting a request mid-flight: **Charles Proxy**
      (Breakpoints → Abort) or **mitmproxy** (`addons/block.py` style breakpoint, or
      `mitmdump` with a script that drops the connection after matching a request path) installed
      on the same network as the device, with the device's HTTP(S) proxy pointed at it and the
      mitm/Charles root CA trusted on the device (required for HTTPS interception).
  - Fallback if no proxy tool is available: a throttled Wi-Fi link (use a travel router or OS
    network-link conditioner upstream) plus manual **airplane-mode toggling** timed by eye —
    less precise, note in results if this fallback was used instead of a proxy breakpoint.
- [ ] Backend running and reachable from the device's network, with request logging visible
      (`backend` terminal/log tail) so the tester can confirm server-side state independent of
      what the UI claims.
- [ ] One **customer test account**, verified/active, with at least one registered asset that
      supports location tracking (for consent scenarios).
- [ ] One **security-company operator test account** with at least one open/unclaimed case
      assigned to its company (for claim/status scenarios) — coordinate with
      `backend-engineer`/fixtures owner to seed this if none exists.
- [ ] Direct DB/API access (or a teammate who has it) to check for duplicate case rows in Mongo
      after Scenario 3, and to confirm claim status in Scenario 4.
- [ ] Record device OS + version, app build/commit hash, and proxy tool used at the top of the
      results table before starting.

---

## How to drop a connection "mid-request" with a proxy

1. Set a breakpoint/intercept rule in Charles or mitmproxy matching the specific endpoint under
   test (e.g. `POST */v1/recovery/cases`, `PATCH */v1/assets/*/location-consent`,
   `POST */v1/security-cases/*/claim`).
2. Trigger the action in the app.
3. When the proxy tool pauses the request (pre-send) or shows it in flight (post-send), choose
   **Abort connection** / close the connection with no response, at the point specified by each
   scenario below:
   - "Before the request leaves the device" = abort or deny at the breakpoint before forwarding
     to the server (simulates airplane mode / no connectivity at tap time).
   - "After the request is sent, before any response" = let the request forward to the server,
     then abort the connection on the response leg so the device never receives a reply (this is
     the "ambiguous outcome" case — the server may have processed it).
4. Release any remaining breakpoints so the app isn't stuck in a false limbo for the rest of the
   test.

---

## 1. Offline pre-check blocking (airplane mode or proxy deny-all, before request leaves device)

| # | Steps | Expected | Pass/Fail |
|---|---|---|---|
| 1.1 | Enable airplane mode on device. Navigate to Report Theft flow for a registered asset, fill in details, tap confirm/submit on `ReportTheftConfirmScreen` | Blocked locally with definite "has not been sent" wording (expected string: *"You're offline. Your report has not been sent. Reconnect and try again."*); no network call appears in backend logs | |
| 1.2 | Still offline, open `AssetDetailScreen` for a trackable asset, toggle location tracking consent on (or off if currently on) | Blocked with a definite "has not been saved/sent" message; no `PATCH`/consent-grant request reaches backend logs | |
| 1.3 | Still offline, as the operator account on `SecurityCaseDetailScreen`, tap **Claim** on an unclaimed case | Blocked with definite "has not been saved" wording (expected string pattern: *"You're offline. This status change has not been saved — reconnect and try again."*); no claim request in backend logs | |
| 1.4 | Still offline, on the same screen attempt a status-change action (not claim) | Same definite-blocked behavior, no backend call | |
| 1.5 | Disable airplane mode, confirm each of the above now succeeds normally | Baseline sanity check — rules out a stuck error state | |

---

## 2. Ambiguous post-send failure messaging (proxy abort after send, before response)

For each row: set a breakpoint matching the endpoint, trigger the action, let the request leave
the device, then abort the connection before any response reaches the device.

| # | Steps | Expected | Pass/Fail |
|---|---|---|---|
| 2.1 | Submit a new theft report on `ReportTheftConfirmScreen`; abort after send | Message uses "couldn't confirm" wording (expected: *"We couldn't confirm your report was received. Check your connection and try again — retrying won't create a duplicate report."*) — **not** a definite "failed" or "success" claim | |
| 2.2 | Grant location-tracking consent on `AssetDetailScreen`; abort after send | "Couldn't confirm" wording (expected: *"We couldn't confirm this reached the server. Check your connection — if tracking doesn't start, turn it off and on again."*) — not definite success/failure | |
| 2.3 | Withdraw location-tracking consent (tracking currently on) on `AssetDetailScreen`; abort after send | "Couldn't confirm" wording (expected: *"We couldn't confirm tracking was turned off. Please check your connection and try again."*) — not definite success/failure | |
| 2.4 | As operator, change a case status on `SecurityCaseDetailScreen`; abort after send | "Couldn't confirm" wording (expected: *"We couldn't confirm this status change was saved. Check your connection and try again."*) | |
| 2.5 | As operator, claim an unclaimed case on `SecurityCaseDetailScreen`; abort after send | "Couldn't confirm" wording referencing refresh-before-retry (expected: *"We couldn't confirm this claim was received. Check your connection, then refresh before retrying — retrying a claim that already succeeded will show as unavailable, not as success."*) | |

---

## 3. Theft-report retry reuses idempotency key — no duplicate case

| # | Steps | Expected | Pass/Fail |
|---|---|---|---|
| 3.1 | Repeat 2.1 (abort after send on theft-report submission), note the exact asset/time/description entered | Ambiguous-failure message shown per 2.1 | |
| 3.2 | Without force-closing the app, tap submit/retry again on the same confirm screen (same unsent request) | Request succeeds (no further interception this time) | |
| 3.3 | Inspect backend logs for the `POST /v1/recovery/cases` calls across both attempts | Both attempts carry the **same** `Idempotency-Key` header value | |
| 3.4 | Query the recovery-cases collection (Mongo) for this asset/time window | **Exactly one** case document exists — no duplicate row from the aborted first attempt | |
| 3.5 | Force-close and relaunch the app, repeat steps 3.1–3.2 as a fresh submission from a cleared screen | A **new** idempotency key is generated for this new report (don't expect key reuse across unrelated reports — only within retries of the same unsent submission) | |

---

## 4. Case-claim retry after ambiguous failure where the claim actually succeeded server-side

| # | Steps | Expected | Pass/Fail |
|---|---|---|---|
| 4.1 | As operator, set a breakpoint on `POST */v1/security-cases/*/claim` for an unclaimed case | — | |
| 4.2 | Tap **Claim**; let the request reach the server and allow the **server to fully process it** (claim succeeds server-side), then abort the response before it reaches the device | Ambiguous "couldn't confirm" message per 2.5 shown on device | |
| 4.3 | Confirm server-side via backend logs or direct query that the case is now claimed by this operator | Case shows claimed, assigned to this operator account | |
| 4.4 | On the device, tap **Claim** again (retry) on the same case | App performs its 404/refetch-recovery path and resolves to an "already claimed" / success-equivalent state — **not** a generic error | |
| 4.5 | Confirm no duplicate claim attempt or error toast implying failure | UI settles into a state consistent with "this case is already claimed by you," no misleading failure messaging | |

---

## 5. Consent-grant failure reverts to "tracking off" (not stuck on "on")

| # | Steps | Expected | Pass/Fail |
|---|---|---|---|
| 5.1 | On `AssetDetailScreen` for an asset with tracking currently **off**, set a breakpoint on the consent-grant request, tap to turn tracking **on** | UI may optimistically show "on" briefly | |
| 5.2 | Abort the connection after the request is sent, before any response | Ambiguous message per 2.2 shown | |
| 5.3 | Wait for the screen to settle (no further action) | UI reverts local state back to **"tracking off"** / "Enable tracking" affordance — does **not** remain stuck showing "on" | |
| 5.4 | Confirm server-side that consent was in fact not granted (no grant record / asset still shows no active consent) | Server state matches the reverted UI state — no state mismatch | |

---

## 6. POPIA-critical: tracking-withdrawal failure must never falsely show "tracking off"

This is the highest-severity scenario in this checklist — a false "off" state after a failed
withdrawal would let a customer believe location sharing has stopped when it has not.

| # | Steps | Expected | Pass/Fail |
|---|---|---|---|
| 6.1 | On `AssetDetailScreen` for an asset with tracking currently **on**, set a breakpoint on the consent-withdrawal request, tap to turn tracking **off** | — | |
| 6.2 | Abort the connection after the request is sent, before any response | Ambiguous message per 2.3 shown | |
| 6.3 | Wait for the screen to settle (no further action) | UI **still shows tracking as ON** — toggle/affordance reads **"Turn off tracking"**, not **"Enable tracking"** | |
| 6.4 | Confirm server-side that the consent record is still active (withdrawal did not apply) | Server state matches — consent still active, no silent/false revocation on either side | |
| 6.5 | With the breakpoint cleared, tap "Turn off tracking" again | Request completes normally this time; UI now correctly shows "Enable tracking" / tracking off | |
| 6.6 | Confirm server-side that consent is now actually withdrawn | Server state matches final UI state | |
| 6.7 | **Explicit failure condition — flag as Critical immediately if seen:** at any point in 6.1–6.4, the UI shows "Enable tracking" (implying tracking is off) while the server-side consent record is still active | Must not occur. If it does, this is a POPIA-relevant data-exposure/compliance risk — escalate directly to `compliance-specialist` and `authentication-engineer` per standing practice, do not batch into a routine report | |

---

## Results summary

| Scenario | Device/OS | Proxy tool used | Result | Defect ID (if any) |
|---|---|---|---|---|
| 1. Offline pre-check (1.1–1.5) | | | | |
| 2. Ambiguous post-send messaging (2.1–2.5) | | | | |
| 3. Theft-report retry / no duplicate (3.1–3.5) | | | | |
| 4. Case-claim retry / already-claimed recovery (4.1–4.5) | | | | |
| 5. Consent-grant revert (5.1–5.4) | | | | |
| 6. Tracking-withdrawal never-false-off (6.1–6.7) | | | | |

---

## Sign-off

| Role | Name | Date | Pass/Fail |
|---|---|---|---|
| `manual-qa-engineer` | | | |
| `qa-architect` | | | |
| `authentication-engineer` (for §5–6) | | | |

**Release gate:** All six scenarios must pass on at least one physical Android device before this
offline-tolerance work can be considered Stage 10-complete. Any failure in §6 (tracking-withdrawal
false-off) blocks release outright regardless of other results, pending `compliance-specialist`
and `cto` review.
