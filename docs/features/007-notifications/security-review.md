# Feature 007 — Security Review (Stage 8), Shipped Subset

**Status:** **SIGN-OFF GRANTED WITH REQUIRED CHANGES** — for the **shipped subset only** (push-token registration, notification preferences, Expo send adapter, domain email dispatch). Withheld for anything not yet built.
**Re-verified 2026-08-13 — see [§7](#7-re-verification-follow-up--2026-08-13-post-remediation): verdict unchanged; SR-007-1 partially implemented and SR-007-2 NOT closed.**
**Date:** 2026-08-13
**Lifecycle stage:** 8 — Security Review. **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate:** `security-engineer` (R — concurrence not given) · `compliance-specialist` (C — [`compliance-review-notifications.md`](./compliance-review-notifications.md) is **design-time flags, not legal sign-off**, and C-NOTIF-1…4 remain open).
**Reviewed against:** [`06-security-standards.md`](../../organization/06-security-standards.md) · [`notification-architecture.md`](./notification-architecture.md) · [`push-notifications-spec.md`](./push-notifications-spec.md) · [`compliance-review-notifications.md`](./compliance-review-notifications.md) §2/§7/§9 · Feature 004 [`security-review.md`](../004-policy-asset-management/security-review.md) (structure and bar) · ADR-0006 · `HANDOFF.md` MP-7.

**Scope of this gate — exactly what is live:**
- `PUT /v1/devices/push-token`, `DELETE /v1/devices/push-token`
- `GET /v1/notifications/preferences`, `PATCH /v1/notifications/preferences`, `POST /v1/notifications/test`
- `device_push_tokens`, `notification_preferences`, `notification_delivery_state` collections
- Expo push send adapter and branded push templates; domain transactional email via Resend
- Mobile push registration client

**Out of scope (not built — no sign-off implied):** SMS, notification service / event bus, delivery log (`notification_deliveries`), preference-centre UI, GPS/theft/payment/claims notifications, webhook receivers for Resend/Expo delivery status.

**Running code read (2026-08-13):** `backend/src/routes/notifications.ts`; `backend/src/repositories/push-tokens.ts`, `notification-preferences.ts`, `notification-delivery-state.ts`; `backend/src/lib/push-notification-service.ts`, `expo-push.ts`, `notification-brand.ts`, `customer-notification-service.ts`, `customer-lifecycle-notifications.ts`, `onboarding-notification-service.ts`, `domain-email-templates.ts`; `backend/src/db/notification-collections.ts`, `mongo-bootstrap.ts`; `backend/src/routes/auth.ts`, `policies.ts`, `assets.ts` (emit sites); `mobile/src/notifications/push.ts`, `usePushNotifications.ts`, `mobile/src/api/notifications.ts`.

---

## 0. Verdict

**SIGN-OFF GRANTED WITH REQUIRED CHANGES** for the shipped subset.

The implementation is careful and, in the places that matter most, correct by construction. Preference enforcement lives in **one** place — `sendToAccount` checks the category preference before it ever loads tokens (`backend/src/lib/push-notification-service.ts:35-39`), so a caller that forgets the check cannot accidentally send. Push tokens are account-scoped on every read and write; there is no route or repository method that takes a token or device id and returns another account's record. A device token is structurally prevented from being simultaneously live on two accounts, via a unique partial index on `tokenHash` where `enabled: true` plus an explicit demotion of prior owners (`backend/src/repositories/push-tokens.ts:63-67`, `backend/src/db/notification-collections.ts:56-61`). Every route carries an explicit limiter per MP-7, and `POST /notifications/test` is tightened to 3/hour (`routes/notifications.ts:162-166`). Payloads carry no coordinates and no tokens, satisfying `compliance-review-notifications.md` §2's two prohibitions.

**Five required changes,** none of which redesigns the feature. Two are worth naming here because they are behavioural, not paperwork:

- **SR-007-1 — push tokens survive logout.** `revokePushTokenFromBackend()` exists in the mobile client and is called from nowhere (`mobile/src/notifications/push.ts:89-92`); `disableAllForAccount()` exists in the repository and is called from nowhere (`backend/src/repositories/push-tokens.ts:114-120`). A signed-out device keeps receiving notifications naming the account's assets on its lock screen, indefinitely. `compliance-review-notifications.md` §9 lists "token deletion on logout" as a pre-go-live requirement; it is not met.
- **SR-007-2 — anyone holding a victim's Expo push token can silence the victim's alerts.** `register()` disables every other account's row for the same `tokenHash` unconditionally (`push-tokens.ts:63-67`) with no proof that the caller possesses the device. Registering a victim's token on an attacker-controlled account turns the victim's device off for **all** categories, including `theft_critical` — the one class of notification the product refuses to let the customer disable themselves (`routes/notifications.ts:146-149`). The self-disable prohibition is enforced against the account owner and not against a third party.

Neither is an authentication bypass, and the shipped subset is a customer-scoped, low-blast-radius surface. That is why this is a conditional sign-off rather than a block.

---

## 1. Threat model — notifications

**Data class.** Push tokens are a **capability**, not an identifier: possession of a valid Expo token plus (optionally) an Expo access token is sufficient to deliver arbitrary content to a specific physical device. Notification **content** is a second, distinct class — it is rendered on a locked screen and passes in cleartext through Expo, then APNs/FCM. Today that content names the customer's assets ("Your BMW X5 has been marked recovered", `backend/src/lib/notification-brand.ts:289-306`). Preference records are ordinary account-scoped PII. **No location data flows through this surface today**, and per `compliance-review-notifications.md` §2 it must never.

**Trust boundaries:**

| # | Boundary | Posture |
|---|---|---|
| N1 | Mobile app → `PUT/DELETE /devices/push-token` | Bearer JWT, `userType === 'customer'`, live account gate on register. Adequate. |
| N2 | Backend → `exp.host` (Expo push service) | Outbound TLS; optional `Authorization: Bearer` when `EXPO_ACCESS_TOKEN` is set (`lib/expo-push.ts:76-79`). **Expo is a processor receiving asset names** — `compliance-specialist` owns the DPA question (§4 of the compliance review). |
| N3 | Expo → APNs/FCM → device lock screen | Outside platform control. Content minimisation is the only lever. SR-007-3. |
| N4 | Backend → Resend (domain email) | Same posture as Feature 001 auth email; recipient address read server-side from `accounts`, never from the request. Adequate. |
| N5 | Backend → `device_push_tokens` (Mongo) | Plaintext token + SHA-256 hash side by side; Atlas at-rest encryption only. Accepted, §3. |

### 1.1 T-N1 — IDOR / cross-account reach on push tokens

**Assessed and, on the direct paths, clean.** Every repository method takes `accountId` as the first predicate: `register` matches `{accountId, deviceId}` (`push-tokens.ts:69`), `disableForDevice` matches `{accountId, deviceId, enabled:true}` (`:107-110`), `listEnabledForAccount` matches `{accountId, enabled:true}` (`:123`). `deviceId` is client-supplied but is never used as a lookup key on its own, so two accounts colliding on the same `deviceId` string get two independent documents and neither can read or disable the other's. The register response returns no token material (`routes/notifications.ts:89-94`). `requireCustomer()` (`:54-58`) keeps admin and partner-operator tokens off the surface entirely.

**The one cross-account write that exists is deliberate and is the finding.** `updateMany({tokenHash, accountId: {$ne: input.accountId}}, {enabled:false})` (`:63-67`) is the correct *mechanism* for "a physical device belongs to at most one account" — you do not want a resold phone receiving the previous owner's theft alerts. What is missing is any evidence that the caller actually holds the device. Expo push tokens are not secrets in practice: they surface in client logs, analytics SDKs, crash reports, and support tickets.

```
Goal: prevent a victim from being alerted that their asset was moved/stolen
├── (a) Obtain the victim's Expo push token   [logs, analytics, support ticket, shoulder-surf]
├── (b) Register it under any attacker-controlled customer account  (PUT /devices/push-token)
│   └── updateMany disables the victim's row for that tokenHash          ← SR-007-2
└── (c) Victim's device is now silent for every category, incl. theft_critical
    ├── Victim-visible signal:   none (no notification, no email, no in-app state)
    ├── Platform-visible signal: none (no audit record of the seizure)
    └── Recovery:                only if the app re-registers — which it does on entry, so the
                                 attack is a repeatable nuisance rather than permanent. Bounded
                                 by DEFAULT_AUTHENTICATED_LIMIT (100/min) — which is not a bound.
```

The mitigation this platform already owns: Feature 001 binds sessions to a device id. `body.deviceId` is accepted from the request and never compared to the session's bound device. Comparing them turns "anyone with the token string" into "the device that actually holds the session".

### 1.2 T-N2 — Notification content on a locked screen (Information disclosure)

Push bodies interpolate `assetName` — a customer-chosen display name that the onboarding UI actively encourages to be identifying ("e.g. MacBook Pro, Toyota Corolla", `src/pages/onboarding/CustomerOnboardingPage.tsx:505`). `asset.recovered` is `priority: 'high'`, category `theft_critical`, and reads "*{assetName}* has been marked recovered on your account" (`notification-brand.ts:289-306`). Rendered on a locked screen, in a coffee shop, that is a disclosure of *what valuable property this person owns* to anyone standing behind them — and for the theft-related templates specifically, a disclosure that the property is currently in an interesting state.

`compliance-review-notifications.md` §2 permits names and policy/claim numbers in push. I am not overruling that. I am ruling, on the technical-control side this role owns, that **theft- and recovery-category push must support a redacted lock-screen form** — the platform's own preferred pattern ("Open app") is already stated in §2 for location data and applies verbatim here. This becomes materially more important the moment GPS ships. SR-007-3.

### 1.3 T-N3 — Preferences as a safety control

`PATCH /notifications/preferences` refuses `theft_critical.push = false` (`routes/notifications.ts:146-149`) and the code honestly labels it a product-policy placeholder. Two things follow:

- **It is asymmetric.** `theft_critical.email = false` is accepted, and the recovered-asset email honours it (`lib/customer-notification-service.ts:179`). A customer can silence theft-critical email but not theft-critical push. Whatever C-NOTIF-1 concludes, both channels should conclude the same way.
- **It is enforced against the owner and not against a third party** — see SR-007-2. A control that the account holder cannot bypass but a stranger can is inverted.

Preference changes are also not recorded anywhere. `compliance-review-notifications.md` §6 lists "audit trail of consent changes" as PLANNED; for `marketing` (consent-based per §3) the absence of a change record is a gap the platform will need to answer for. SR-007-4.

### 1.4 T-N4 — Bootstrap failure silently removes the cross-account control

`ensurePolicyAssetCollections` wraps `bootstrapNotificationCollections` in a `try/catch` that logs and continues (`backend/src/db/mongo-bootstrap.ts:17-25`). The comment is honest about the intent — auth and policy routes should not be taken down by a notification bootstrap failure — and the availability trade-off is defensible. The security consequence is not stated anywhere: if that bootstrap fails on a fresh database, the API still serves `PUT /devices/push-token`, but the `$jsonSchema` validator and the **unique partial index on `tokenHash`** are absent. The uniqueness constraint that makes "one device, one account" true is an index, not application logic — `register()` demotes prior owners but nothing prevents a concurrent double-enable without the index. Fail-open on a security invariant needs to be a decision, not a side effect. SR-007-5.

### 1.5 T-N5 — Amplification and abuse of the send paths

Assessed, adequate for this phase, recorded for completeness:

- `POST /notifications/test` — 3/hour/account, customer-only, active-account gated, fixed `templateId` (`routes/notifications.ts:159-188`). The caller cannot choose template or content. Correct.
- Domain notifications fire from policy/asset writes via `notifyInBackground` (`routes/policies.ts:68-83`, `routes/assets.ts:52-60`), each write producing up to one email and one push **to the account's own address/devices**. Self-directed, and bounded by the write endpoints' own limiters. No third-party amplification.
- `runCustomerLifecycleNotifications` fires on login and `GET /account/me` (`lib/customer-lifecycle-notifications.ts:8-35`) with a dedupe counter capped at 2 reminders (`repositories/notification-delivery-state.ts:97-105`). Acceptable as an interim for a missing scheduler; it does mean notification dispatch is on the login latency path, mitigated by the fire-and-forget wrapper (`:38-51`).
- Notification failures are logged with a label and `err.message` only, no payload (`lib/customer-notification-service.ts:198-203`), satisfying `compliance-review-notifications.md` §7's "no customer notification content in application error logs". Verified.

### 1.6 T-N6 — Token lifecycle

`DeviceNotRegistered` receipts disable the row (`lib/push-notification-service.ts:49-54`) — good hygiene, and it means a wiped device stops being targeted. What has no lifecycle at all: logout (SR-007-1), account deletion, password reset / `logout-all` (an account-takeover response that leaves the attacker's device registered), and retention of `device_push_tokens` rows generally (`compliance-review-notifications.md` §5 proposes retention for delivery metadata and is silent on tokens).

---

## 2. Controls verified in code

| Control | Required by | Implementation | Status |
|---|---|---|---|
| Authentication on all five routes | `06-security-standards.md` | `createAuthenticateMiddleware` | ✔ |
| Customer-only; admin/partner excluded | this review | `requireCustomer()` → 403 | ✔ `routes/notifications.ts:54-58` |
| Live account gate on state-changing reads/writes | Feature 004 §4.3 | `requireActiveAccount` on register, prefs get/patch, test | ✔ (deliberately **absent** on revoke — correct: a suspended user must still be able to stop notifications) |
| Explicit per-route rate limiter | MP-7 | shared 100/60s limiter keyed per account; 3/hour on test | ✔ |
| Token format validation | this review | anchored regex + length bounds | ✔ `routes/notifications.ts:19`, `:23-25` |
| Body key allow-listing | SR-21 | `validateBody` → Zod strips unknown keys | ✔ |
| Account-scoped queries only | Feature 004 §2.1 | every repo predicate leads with `accountId` | ✔ `repositories/push-tokens.ts:69`, `:107`, `:123` |
| One device → at most one live account | this review | unique partial index on `tokenHash` + demotion on register | ✔ mechanism / ✖ **unauthenticated demotion** (SR-007-2) / ✖ **index not guaranteed present** (SR-007-5) |
| Token never returned to any client | this review | register response omits token; no read endpoint exists | ✔ |
| Preference enforcement single-chokepoint | this review | `sendToAccount` checks before loading tokens | ✔ `lib/push-notification-service.ts:35-39` |
| No coordinates / tokens / OTP in payloads | compliance §2 | verified across all templates in `notification-brand.ts` | ✔ |
| No other customer's data in a payload | compliance §2 | all variables derived from the target account's own records | ✔ |
| No notification content in error logs | compliance §7 | label + `err.message` only | ✔ |
| Store-side structural invariants | ADR-0008 pattern | `$jsonSchema`, `validationLevel: strict`, `validationAction: error` | ✔ in code / ✖ live-verified + fail-open bootstrap (SR-007-5) |
| Token revoked on logout | compliance §9 | **nothing calls it** | ✖ **SR-007-1** |
| Consent/preference change audit | compliance §6 | none | ✖ **SR-007-4** |
| Lock-screen content minimisation for theft categories | this review | asset names in body | ✖ **SR-007-3** |
| Delivery log / evidence of what was sent | `notification-architecture.md` | not built | ✖ SR-007-8 |
| Expo DPA / subprocessor record | compliance §4/§9 | not this role's call | → `compliance-specialist` |

---

## 3. Field sensitivity — push tokens at rest

`compliance-review-notifications.md` §7 recommends "push tokens stored hashed at rest". **That recommendation is not literally implementable** and the implementation is right not to have pretended otherwise: sending a push requires the token in plaintext, so `expoPushToken` is stored alongside `tokenHash` (`repositories/push-tokens.ts:89-100`). The hash serves cross-account uniqueness, not confidentiality.

**Ruling, within this role's authority, consistent with Feature 004's `field-sensitivity-review.md` §3.1:** no field-level encryption is required for `device_push_tokens` in this phase. The control set is Atlas encryption-at-rest, TLS, the runtime credential's RBAC, and the fact that no API path returns a token. **Classification: treat `expoPushToken` as a credential, not as an identifier** — it must never be logged, never returned in an API response, never included in an export, and never appear in an admin UI. Record that constraint at the repository, because it is the kind of rule a future reporting or support surface will otherwise breach by default. This is a **sixth revisit trigger** on P-14: any surface that reads `device_push_tokens` re-opens it.

---

## 4. Required changes

**Required before real customers rely on notifications (blocking the "notifications are a safety feature" claim, not blocking merge):**

| ID | Item | Owner |
|---|---|---|
| **SR-007-1** | **Revoke push tokens on session end.** Wire `revokePushTokenFromBackend()` into the mobile sign-out path, and call `disableAllForAccount()` server-side on `POST /session/logout-all`, on password reset completion, and on account deactivation — both halves, because a client-side-only revoke fails exactly when it matters (stolen device, forced logout). Today both functions are dead code (`mobile/src/notifications/push.ts:89-92`; `backend/src/repositories/push-tokens.ts:114-120`). Closes `compliance-review-notifications.md` §9's "token deletion on logout". | `mobile-engineer` + `backend-engineer` |
| **SR-007-2** | **Bind push-token registration to the session's device.** Reject `PUT /devices/push-token` when `body.deviceId` does not match the device id bound to the calling session (Feature 001 device binding), so possession of a token string is not sufficient to seize it. Additionally: when the demotion at `push-tokens.ts:63-67` disables another account's live token, emit an audit record — a control that silently turns off a customer's theft alerts must leave a trace. If device binding cannot be relied on for every client, the fallback is to notify the losing account by email. | `authentication-engineer` (binding semantics) + `backend-engineer`; design ruled `cybersecurity-architect` |
| **SR-007-3** | **Lock-screen content minimisation for `theft_critical` and recovery templates.** Provide a redacted body form ("An update on one of your protected assets — open the app") for the theft/recovery categories, with the identifying detail delivered in-app behind authentication, mirroring the pattern `compliance-review-notifications.md` §2 already mandates for location. Make it the default for `theft_critical`; a customer-visible opt-in to richer previews is acceptable. **This must be in place before any GPS-derived event can emit a push.** | `ui-designer` + `notification-engineer`; content rule ruled `cybersecurity-architect` with `compliance-specialist` |
| **SR-007-4** | **Record preference changes.** Persist an append-only record of every `PATCH /notifications/preferences` (account, actor session, category, channel, before → after, timestamp). Required for `marketing`, which `compliance-review-notifications.md` §3 places on a consent basis, and useful for the disputed-alert case ("I never turned that off"). Choose the persistence surface with `backend-architect` — do not create an untracked third audit store (ADR-0006 R-4). | `backend-architect` + `backend-engineer`; retention ruled `compliance-specialist` |
| **SR-007-5** | **Make the notification bootstrap's failure mode explicit.** Either (a) fail startup when `bootstrapNotificationCollections` fails, or (b) keep the current availability trade-off (`db/mongo-bootstrap.ts:17-25`) and **disable the notifications router** when it failed, so the API never serves `PUT /devices/push-token` against a collection lacking the unique `tokenHash` index and the validator. Silent fail-open on a security invariant is the one option that is not acceptable. Pair with live-Atlas verification that both collections carry their validators and all indexes — the SR-004-admin-2 standard: a claim is not evidence. | `backend-architect` (choice) + `security-engineer` + `database-architect` (live verification) |

**Standing constraints and follow-ups:**

| ID | Item | Owner |
|---|---|---|
| **SR-007-6** | **`expoPushToken` is credential-class.** No logging, no API response, no export, no admin UI, no support-tool display. Any new reader of `device_push_tokens` re-triggers Stage 8 (§3). | `backend-architect` records at the repository; conformance `cybersecurity-architect` |
| **SR-007-7** | **Resolve the `theft_critical` channel asymmetry.** `push` cannot be self-disabled, `email` can (`routes/notifications.ts:146-149` vs `lib/customer-notification-service.ts:179`). Both channels should follow whatever C-NOTIF-1 concludes. **The legal question of whether theft alerts may be non-optional is `compliance-specialist` + legal, not mine** — I am flagging only that the code currently answers it two different ways. | `product-manager` + `compliance-specialist` |
| **SR-007-8** | **No delivery evidence exists.** `notification_deliveries` is unbuilt, so the platform cannot answer "what did you send me, and when" — which is both a POPIA-adjacent question (`compliance-specialist`) and an incident-response one (mine: after a suspected takeover, we cannot reconstruct which device was alerted). Sequence with the notification service MVP; a read surface over it is its own Stage 8. | `notification-engineer` + `backend-architect` |
| **SR-007-9** | **`EXPO_ACCESS_TOKEN` handling.** `lib/expo-push.ts:76-79` sends it as a bearer token when present. Confirm it is sourced from the environment only, is absent from any committed file, and is covered by the secrets-management plan; decide whether Expo's "enhanced push security" (which makes the token mandatory) is required before production push. | `security-engineer` + `devops-engineer` |
| **SR-007-10** | **Stage 10 abuse cases from this threat model:** account B cannot read, disable, or enumerate account A's push tokens; registering account A's token under account B does **not** disable A (post-SR-007-2); `theft_critical.push=false` rejected; a disabled category produces zero Expo calls; sign-out results in zero enabled tokens; no template renders coordinates or a token; notification failure never fails the parent write. | `qa-architect` + `automation-qa-engineer` |

---

## 5. Residual risks accepted for this phase

| Risk | Why accepted | Owner / trigger |
|---|---|---|
| `expoPushToken` stored in plaintext | Required to send; §3 ruling — at-rest encryption + RBAC + no read path is the control set | `cybersecurity-architect` if a token-reading surface appears |
| Expo, Apple and Google receive notification content including asset names | Inherent to push; minimised by SR-007-3. **DPA and s72 transborder assessment are `compliance-specialist`'s**, per §4 of the compliance review — this gate makes no legal determination | `compliance-specialist` before production push |
| Notification dispatch runs on the login / `account/me` request path (no scheduler) | Fire-and-forget, errors swallowed and logged; acceptable interim | `backend-architect` when the notification service MVP lands |
| No delivery log | Accepted for this subset; tracked as SR-007-8 | `notification-engineer` |
| `device_push_tokens` retention unspecified | Compliance review §5 is silent on tokens; low volume, low sensitivity relative to content | `compliance-specialist` with C-NOTIF-3 |
| Same Atlas database backs dev and prod (MP-8) | Pre-existing platform-wide condition; a dev send would target real devices | `devops-engineer` + `cloud-infrastructure-architect` |

---

## 6. Sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` (Stage 8 chair) | **Sign-off granted with required changes** SR-007-1…10; SR-007-1/2/5 required before notifications are relied on as a safety feature, SR-007-3 before any GPS-derived push | 2026-08-13 |
| `security-engineer` | **Concurrence required and not yet given** — asks: independently verify §2's table; confirm no code path logs or returns `expoPushToken`; confirm both collections carry validators and all indexes on live Atlas (SR-007-5); run the suite | — |
| `compliance-specialist` | **Concurrence required and not yet given** — C-NOTIF-1 (theft opt-out), C-NOTIF-3 (retention), Expo DPA/§72, marketing-consent record (SR-007-4) | — |

**Scope discipline, stated plainly:** this document signs off the five live endpoints and the send adapter as built. It signs off **nothing** about SMS, the notification service, delivery logging, the preference-centre UI, or any GPS/theft/payment/claims notification — those are unbuilt, and `README.md`'s honesty table is correct that they are. The first GPS- or recovery-derived push re-opens this gate, because that is the point at which notification content starts to imply the location and status of a physical asset.

**Signed:** `cybersecurity-architect` (designated Stage 8 chair), 2026-08-13.

---

## 7. Re-verification follow-up — 2026-08-13 (post-remediation)

*Appended, not substituted. §0–§6 remain the record of the gate as chaired. Precedent for appending rather than editing: ADR-0006 §16/§17.*

**Revised verdict: unchanged — SIGN-OFF GRANTED WITH REQUIRED CHANGES, and SR-007-1 and SR-007-2 both remain OPEN.** SR-007-1 is now half-implemented; SR-007-2 has an implemented control that **does not close the attack it was written to close**. Neither gets ticked off. The conditional sign-off from §0 stands as-is — nothing regressed, and nothing that was required has been fully met.

**Code re-read for this section (2026-08-13):** `backend/src/routes/notifications.ts:69-134`, `backend/src/repositories/push-tokens.ts:32-157`, `backend/src/lib/errors.ts:64-67`, `backend/src/routes/session.ts:30-63`, `backend/src/lib/refresh-session.ts:42-93`, `:206-233`, `backend/src/routes/auth.ts:491-497` (`deviceId` optionality), `backend/src/routes/notifications.test.ts:395-528`; `mobile/app/(app)/profile.tsx:44-78`, `mobile/src/notifications/push.ts:73-92`, `mobile/src/api/notifications.ts:44-55`.

### 7.1 SR-007-1 — push tokens survive logout — **PARTIALLY CLOSED, STILL OPEN**

**Correction to the original record first, because the record's accuracy matters more than its consistency.** §0 and §4 stated that `revokePushTokenFromBackend()` "is called from nowhere". In the current tree it is called from **both** mobile sign-out paths — `mobile/app/(app)/profile.tsx:50` in `handleLogout` and `:70` in `handleLogoutAll` — and it resolves the device id and issues `DELETE /devices/push-token` (`mobile/src/notifications/push.ts:89-92` → `mobile/src/api/notifications.ts:50-55`). The backend route disables the row for real: `ctx.pushTokens.disableForDevice(accountId, deviceId)` sets `enabled: false` under an `{accountId, deviceId, enabled: true}` predicate (`repositories/push-tokens.ts:136-142`). I cannot read history from this working tree, so I make no claim about whether that wiring predated my review or landed with it — either way, the original sentence is wrong about the current code and is corrected here rather than edited away above.

**What is still not done — and it is the half I explicitly said mattered most.** SR-007-1 required *both* halves, "because a client-side-only revoke fails exactly when it matters (stolen device, forced logout)". `disableAllForAccount()` (`repositories/push-tokens.ts:144-150`) is **still called from nowhere in production code** — the only reference outside the repository is a test fake (`routes/notifications.test.ts:160`). Concretely, in the current build:

- `POST /session/logout-all` (`routes/session.ts:48-63`) revokes every session row and every JTI, and leaves **every push token on every device enabled**. A customer who logs out everywhere *because their phone was stolen* has just invalidated the thief's session and left the thief's device subscribed to their asset notifications. `handleLogoutAll` revokes only the device the customer is holding.
- Password-reset completion and account deactivation likewise disable nothing.

- The client-side call is fire-and-forget (`.catch(() => {})`, not awaited) and, in `handleLogout`, races the `logout()` that revokes the session — if the revocation lands first the `DELETE` returns 401 and the token stays enabled. Best-effort is the right posture for the client half; it is not a substitute for the server half.
- No mobile test covers either call site (nothing in `mobile/` references `revokePushToken` outside source), so the client half is not regression-protected. `routes/notifications.test.ts:395-420` covers the backend `DELETE` route, not the sign-out wiring.

**SR-007-1 remains open**, narrowed to: call `disableAllForAccount()` server-side on `POST /session/logout-all`, on password-reset completion, and on account deactivation; and add a mobile test pinning the revoke call on both sign-out paths. Owner unchanged (`backend-engineer` + `mobile-engineer`). `compliance-review-notifications.md` §9's "token deletion on logout" is **not** yet met for the forced-logout case.

### 7.2 SR-007-2 — token seizure silences theft-critical alerts — **NOT CLOSED**

Two things were built. Neither closes the finding, and I want to be precise about why rather than trade a real control for a plausible-looking one.

**(a) The device-binding check does not stand between the attacker and the attack.** `routes/notifications.ts:93-96` compares `body.deviceId` to the calling session's bound `deviceId`. The attack in §1.1 never required spoofing a device id: the attacker registers **the victim's `expoPushToken` string** under **the attacker's own account and the attacker's own honestly-declared `deviceId`**. `body.deviceId === session.deviceId`, the check passes, `register()` finds a prior owner by `tokenHash` and demotes the victim's row (`repositories/push-tokens.ts:86-97`), and the victim goes silent for every category including `theft_critical`. The check compares the *device id* to the session; the seizure is driven by the *token hash*, which the check never touches.

This is not inference on my part — **the repository's own test asserts the attack still succeeds.** `routes/notifications.test.ts:482-528` ("a cross-account token collision demotes the prior owner and is logged, not silent") sets up exactly the §1.1 scenario with the attacker bound to `attacker-device`, and asserts `attackResponse.status === 200` and `h.tokens.get('<victim>:victim-device').enabled === false`. The test is honest and well-written; what it documents is that the outcome is unchanged and only the logging is new.

**(b) The check additionally fails open on device-less sessions, and the attacker chooses that.** The guard is `if (session?.deviceId && …)`, so a session with `deviceId: null` skips it entirely (`routes/notifications.test.ts:462-480` pins this as intended behaviour). `deviceId` is `nullable().optional()` on both `POST /auth/login` (`routes/auth.ts:494`) and `POST /auth/supabase/exchange` (`:331`), and `mintNewSession` stores `input.deviceId` verbatim. An attacker simply omits `deviceId` when authenticating and has a session that the check cannot constrain at all. Mirroring `lib/refresh-session.ts:206`'s nullability handling is defensible *there* — the presented device id is an optional extra signal on a rotation. Here the request body always carries a `deviceId`, and the party choosing whether the session has one is the attacker.

**(c) The audit trail is a `console.warn`, which is not the audit record I asked for.** `routes/notifications.ts:106-121` logs `newAccountId`, `demotedAccountIds` and `deviceId` (correctly logging **no token material**, honouring SR-007-6) — good hygiene and genuinely better than silence. But SR-007-2 said "emit an audit record", and ADR-0006 R-4 exists precisely to stop security-relevant events landing on untracked surfaces. A `console.warn` is not queryable, not retained, not attributable to an actor session, and cannot answer "who turned this customer's theft alerts off, and when" during an incident. It is a compensating breadcrumb, not the control. The named fallback — **notify the losing account by email** — is not implemented either, so the victim still receives no signal.

**SR-007-2 is restated with an acceptable-control menu**, since the design question is mine to rule on:

1. **Preferred — proof of possession before demotion.** Before demoting a prior owner, deliver a nonce push to the token and require the registering client to echo the nonce back. The attacker holds the token *string*; only the physical device receives the push. The Expo send adapter needed to do this already exists (`lib/expo-push.ts`). This makes the vulnerability class structurally impossible rather than policy-dependent, which is the bar this role prefers.
2. **Acceptable — deferred takeover.** On a cross-account `tokenHash` collision, do not demote inline: record the new registration as pending, email the losing account immediately, and complete the takeover after a grace window with no objection. Preserves the legitimate resold-phone case.
3. **Minimum, and only in combination with 1 or 2** — write the demotion to a real audit surface (Trail A/B decision with `backend-architect`, not a third store) **and** email the losing account.

Independently of which is chosen: for this route specifically, make the device-binding check **fail closed** — if the session carries no bound device, reject the registration rather than skip the check. The registration request itself supplies a device id, so there is no legitimate device-less caller.

**Standing constraint, reaffirmed and extended:** until SR-007-2 closes, notifications must not be described to customers — in UI copy, marketing, or plan comparison — as a theft-safety guarantee, and **no GPS-, theft-, or recovery-derived push may ship** (this now joins SR-007-3 as a precondition on that milestone, per §6's "the first GPS- or recovery-derived push re-opens this gate").

### 7.3 What I could not verify in this session

I could not run `npm test` or `npm run typecheck` — **no shell tool was available to this session** — so the *179 tests / 34 files* claim is **not verified by me**. Verified directly: 34 `*.test.ts` files exist under `backend/src/`, and the SR-007-2 cases at `routes/notifications.test.ts:422-528` read as described above. Executing the suite remains part of `security-engineer`'s concurrence ask from §6, unchanged.

### 7.4 Findings unchanged

SR-007-3 (lock-screen minimisation for theft/recovery templates), SR-007-4 (preference-change record), SR-007-5 (fail-open notification bootstrap + live index/validator verification), SR-007-6…10 — **all still open**, none touched by this remediation.

### 7.5 Revised sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` (Stage 8 chair) | **Sign-off with required changes stands unchanged.** SR-007-1 partially implemented (client half wired; server-side `disableAllForAccount` still uncalled) — **open**. SR-007-2 **open**: the implemented device check does not prevent the seizure, and the repo's own test at `notifications.test.ts:482-528` records that the victim is still silenced. SR-007-1/2/5 remain required before notifications are relied on as a safety feature; SR-007-2 **and** SR-007-3 before any GPS- or theft-derived push | 2026-08-13 (re-verification) |
| `security-engineer` | **Concurrence required and still not given** — asks from §6 carry over unchanged, plus: confirm the `console.warn` at `routes/notifications.ts:113` cannot emit token material under any input, and confirm no log sink treats it as an audit record | — |
| `compliance-specialist` | **Concurrence required and still not given** — C-NOTIF-1, C-NOTIF-3, Expo DPA / s72, marketing-consent record (SR-007-4) | — |

**Note on how this was assessed:** the remediation is real work and the code that landed is careful — the `demotedAccountIds` plumbing through `RegisterPushTokenResult` is a clean design, and the tests are honest about what they observe. It does not close SR-007-2, and a finding is closed when the attack stops working, not when a control adjacent to it is added.

**Signed:** `cybersecurity-architect` (Stage 8 chair), 2026-08-13 — re-verification.

---

## 8. `security-engineer` independent concurrence — 2026-08-13 (second remediation pass)

*Appended, not substituted. §0–§7 stand as the record up to and including the chair's "SR-007-2 NOT CLOSED" re-verification. Since §7 was written, a second, more substantial remediation landed: a deferred-takeover state machine (`backend/src/lib/push-token-takeover.ts`), a fail-closed device-binding check, a real structured audit trail (`backend/src/repositories/push-token-security-log.ts`, `backend/src/db/notification-collections.ts`), and an alert email to the losing account. This section is my own hands-on verification of that code against the exact attack §7.2 described — not a re-statement of anyone's summary.*

**Code read for this section:** `backend/src/routes/notifications.ts` (full file, 1-256), `backend/src/repositories/push-tokens.ts` (full file, 1-289), `backend/src/lib/push-token-takeover.ts`, `backend/src/repositories/push-token-security-log.ts`, `backend/src/db/notification-collections.ts`, `backend/src/lib/auth-notification-service.ts:1-45,127-161`, `backend/src/routes/notifications.test.ts:565-757`, `backend/src/routes/session.ts` (full file), `backend/src/routes/session-logout-all.test.ts:48-92,149`, `backend/src/routes/auth.ts:778-862,920-932` (reset-password/confirm session revocation), `backend/src/routes/admin-accounts.ts`. Ran `npm test` and `npm run typecheck` myself in `backend/`.

### 8.1 SR-007-2 — re-assessed against the exact attack in §1.1/§7.2 — now CLOSED

I read the repository state machine line by line rather than trust the doc comments. On a `register()` call whose `tokenHash` collides with another account's live (`enabled: true`) row:

- The **first** contested registration from a given claiming account+device does **not** touch the prior owner's row at all. It inserts/updates the *claimant's own* row with `enabled: false, pendingTakeoverSince: now` (`push-tokens.ts:228-264`) — quarantined, receiving no push traffic. The victim's row is untouched: still `enabled: true`, still receiving every category including `theft_critical`.
- Only on a **later** call, from the same claiming account+device, made **after** `isTakeoverCooldownElapsed(pendingSince, now)` returns true (24h, `push-token-takeover.ts:27`), does the code reach the branch that flips the prior owner's row(s) to `enabled: false` (`push-tokens.ts:172-175`). This is the only `updateMany` in the file that demotes another account's row, and it is gated on elapsed wall-clock time with no unresolved contest, not on registration alone.
- This directly answers the attack as stated in the task: an attacker registering the victim's stolen token string under their own honestly-declared account and device gets a quarantined, disabled row for themselves and does **not** silence the victim's `theft_critical` alerts — not immediately, and not for 24 hours, during which the recorded alert email (§8.1 below) gives the victim a chance to react.
- I ran the exact scenario myself by reading (not just skimming) `notifications.test.ts:593-658` — victim registers normally (`enabled: true`); a second, independently-authenticated account registers the identical token string on its own device; the response is `200` with `pendingTakeover: true, enabled: false` for the *attacker's* row; the assertion `h.tokens.get('<victim>:victim-device')?.enabled` is checked as `true` **after** the attacker's call, which is the load-bearing assertion for this whole finding. I re-derived that this assertion would be `false` against the previous inline-demotion code the chair quoted in §7.2's own test citation (`attackResponse.status === 200` and the victim's row `enabled === false`) — the old and new tests assert opposite outcomes on the same fixture shape, which is the strongest evidence a regression test can give that the fix is real and not merely renamed.
- The cooldown-completion path (`notifications.test.ts:700-757`) is also real: it forces `pendingTakeoverSince` into the past (exercising the same `isTakeoverCooldownElapsed` the production code calls, not a mocked clock) and confirms the victim's row only flips to `disabled` at that point, with the audit trail showing `['takeover_pending', 'takeover_completed']` in order and exactly one alert email sent (not two).

**The fail-closed device check is also independently confirmed**, and correctly scoped as a secondary control rather than the primary one. `routes/notifications.ts:102-105`: `if (!session?.deviceId || session.deviceId !== body.deviceId) throw apiError('DEVICE_MISMATCH')`. A session with no bound device is now rejected (`notifications.test.ts:565-591`, asserts `403`/`DEVICE_MISMATCH`, zero tokens written) rather than the old fail-open skip. I confirmed this check is *necessary but not sufficient* by design: it stops device-id spoofing, and the deferred-takeover mechanism above is what stops token-string theft using the attacker's own honest device — reading the route handler confirms both checks run unconditionally on every `PUT` (the device check at `:102-105`, the takeover-alert/log logic at `:123-150` regardless of which branch `register()` returned).

**The audit trail is now a real, queryable Mongo collection, not a `console.warn`.** `push-token-security-log.ts`'s `record()` writes to `push_token_security_events` (`notification-collections.ts:10`), which is bootstrapped with its own `$jsonSchema` validator (`:117-138`, `required: [eventType, claimingAccountId, claimingDeviceId, contestedAccountIds, createdAt]`) and two indexes for querying by either side of the contest (`:140-143`). I confirmed by reading the interface (`PushTokenSecurityEventInput`) and the insert call that `expoPushToken`/`tokenHash` are structurally absent from the row shape — there is no field to accidentally populate with token material, which is a stronger guarantee than "we remembered not to log it." This satisfies §7.2(c)'s explicit ask.

**The alert email is real and fires exactly once per contested claim**, not on every cooldown-refresh and not again at completion. `notifications.ts:142-149` guards the email loop on `result.isNewTakeoverClaim`, and `auth-notification-service.ts:151-160`'s `notifyPushTokenReregisteredElsewhere` sends via Resend when the account's own `account.email` preference allows it — reusing the existing Feature 001 email-notification chokepoint rather than inventing a new one. `notifications.test.ts:660-698` (re-registration during cooldown does not re-alert) and `:700-757` (completion does not send a second alert) both directly assert the one-time behaviour I'd otherwise have had to infer from reading alone.

**I concur SR-007-2 is now closed.** All three parts of the chair's acceptable-control menu (§7.2) are implemented: option 2 (deferred takeover) as the primary mechanism, plus option 3's audit trail and losing-account email in combination, exactly as the menu required them to be combined rather than substituted.

### 8.2 SR-007-1 — the specific ask (`POST /session/logout-all`) — confirmed CLOSED; the item as a whole remains open

Task-scoped verification: `routes/session.ts:61` calls `await ctx.pushTokens.disableAllForAccount(auth.accountId);` inside the `POST /session/logout-all` handler, after session/JTI revocation and before the audit-log write. `repositories/push-tokens.ts:275-281`'s `disableAllForAccount` does an unconditional `updateMany({accountId, enabled: true}, {$set: {enabled: false, …}})` — every enabled row for the account, not just one device. `session-logout-all.test.ts:48-92,149` is a real regression test asserting `disableAllForAccountCalls` is called with exactly the caller's `accountId`. I confirm the specific claim in the task brief: **yes**, `POST /session/logout-all` now calls `disableAllForAccount()`.

**I am not marking SR-007-1 closed as a whole, and I want to be precise about why**, because §4/§7.1 of this document named three trigger points, not one: "on `POST /session/logout-all`, on password reset completion, and on account deactivation." I checked the other two directly:

- `POST /auth/reset-password/confirm` (`routes/auth.ts:778-932`) calls `ctx.sessions.revokeAllForAccount(account.id, 'password_reset')` twice (once per branch of the recovery-token/access-token split, `:862` and `:932`) but at no point calls `ctx.pushTokens.disableAllForAccount`. A stolen-device attacker who has an active session survives a legitimate password reset with their push token still enabled and still receiving the account's `theft_critical` notifications.
- There is no self-service account-deactivation endpoint in this tree, and the admin equivalent (`routes/admin-accounts.ts`, `PATCH` to `accountState: 'deactivated'`) does not touch `device_push_tokens` either — I read the full route file and there is no `pushTokens` reference in it at all.

This is a real, if narrower, gap than the one originally filed: the highest-severity trigger named in the review's own reasoning — "fails exactly when it matters (stolen device, forced logout)" — is closed for the *self-service* logout-everywhere path but still open for the *password-reset* path, which is arguably the more likely real-world response to "I think my phone was stolen." I am not willing to call SR-007-1 closed while that gap exists.

### 8.3 `npm test` / `npm run typecheck` — independently run

```
Test Files  36 passed (36)
     Tests  187 passed (187)
```
`npm run typecheck` produced no output and exited clean. This also directly answers §7.3's outstanding ask — I did not take the 187/36 figure on trust.

### 8.4 Other §6/§7.5 asks — status

- **`expoPushToken` never logged or returned:** re-confirmed by reading every reference to `expoPushToken` in `backend/src/` (grep, 30 matches, all in `push-tokens.ts`, `notifications.ts`'s Zod schema/register call, `expo-push.ts`'s send call, `notification-collections.ts`'s validator, and test fixtures). The `PUT /devices/push-token` response object (`notifications.ts:153-159`) enumerates exactly `deviceId, platform, enabled, registeredAt, pendingTakeover` — no token field. No `console.*` call anywhere in `notifications.ts` or `push-tokens.ts` references `expoPushToken` or `tokenHash`. Confirmed.
- **Both notification collections carry their validators/indexes on live Atlas:** I can only confirm the bootstrap code is correct (`notification-collections.ts:189-218`, `ensureCollection` applies `validator`/`validationLevel: strict`/`validationAction: error` and creates every listed index, idempotently, on every startup) — I have no access to a live Atlas connection from this session to confirm the deployed state, and SR-007-5's fail-open bootstrap (`db/mongo-bootstrap.ts:17-25`) is unchanged and still means a bootstrap failure is silent. This ask is not fully answerable from source alone and remains open for `database-architect` + a deployment-time check.
- **The `console.warn` at `routes/notifications.ts:113`** (§7.5's specific ask) no longer exists in the current file — the audit path now goes through `ctx.pushTokenSecurityLog.record(...)` (§8.1 above), which I've confirmed cannot emit token material by construction (no field for it in `PushTokenSecurityEventInput`). This specific ask is satisfied by the same remediation that closed SR-007-2.

### 8.5 Findings I am not touching

SR-007-3, SR-007-4, SR-007-5, SR-007-6…10 are unchanged by this remediation pass and outside this task's scope; I defer to §7.4's status for all of them. SR-007-5's live-Atlas verification specifically remains outstanding per §8.4 above.

### 8.6 My concurrence

**I concur that SR-007-2 is now closed** — the deferred-takeover mechanism, the fail-closed device check, the structured audit trail, and the one-time alert email together stop the exact attack described in §1.1 and re-confirmed as unfixed in §7.2. I verified this against the running repository code and against a regression test that would fail on the previous (inline-demotion) behaviour.

**I do not concur that SR-007-1 is closed**, and I am not rubber-stamping it. The specific mechanism the task asked me to check — `POST /session/logout-all` calling `disableAllForAccount()` — is real and verified. But SR-007-1 as filed requires the same call on password-reset completion and account deactivation, and neither exists in this tree as of this session. I am recording this as **SR-007-1 partially closed**, narrower than before (one of three trigger points now done) but not the "both halves" the original finding required.

| Role | Status | Date |
|---|---|---|
| `security-engineer` | **Concurrence given on SR-007-2 (closed) and on `POST /session/logout-all`'s specific `disableAllForAccount()` wiring.** **Concurrence withheld on SR-007-1 as a whole** — password-reset completion (`routes/auth.ts:778-932`) and account deactivation (`routes/admin-accounts.ts`) still leave every enabled push token live. Independently ran `npm test` (187/187, 36/36 files) and `npm run typecheck` (clean); confirmed no code path logs or returns `expoPushToken`/`tokenHash`. Live-Atlas index/validator verification (SR-007-5) not performed this session — no Atlas connection available — and remains open. | 2026-08-13 |

**Signed:** `security-engineer`, 2026-08-13.

---

## 9-C. `compliance-specialist` concurrence — 2026-08-14

*Appended, not substituted. §0–§6 stand as the gate as chaired, §7 as the chair's re-verification, §8 as `security-engineer`'s independent concurrence on the second remediation pass. This section is the third seat of the joint Stage 8 gate and is dated after all three. Precedent for appending rather than editing: ADR-0006 §16/§17.*

**Numbering note (2026-08-14).** This section was appended as `§9` and, in the same session, `notification-engineer` independently appended its own follow-up also numbered `§9` (it now follows this section). **I have relabelled mine to `9-C` and have not touched theirs** — renumbering another role's signed section is not mine to do, and the same `-C` convention is already in use for the compliance seat in [`../006-customer-onboarding/security-review.md`](../006-customer-onboarding/security-review.md) §8-C. Subsections below are written as `### 9.x`; **cite them as §9-C.x** to distinguish them from `notification-engineer`'s §9.1–§9.4. That section post-dates the body below and **corrects one of my findings** — see §9.12, which is the operative status for C-007-10.

**Baseline for this review:** my own [`compliance-review-notifications.md`](./compliance-review-notifications.md), which is explicitly **design-time flags, not legal sign-off**. This section checks the *shipped* code against those flags, corrects one of them that turned out to be wrong, and converts the rest into conditions with owners.

**Code read for this section (2026-08-14) — verified directly, not carried from §7 or §8:** `backend/src/routes/notifications.ts` (full file); `backend/src/repositories/push-tokens.ts` (full file), `notification-preferences.ts` (full file); `backend/src/db/notification-collections.ts` (full file); `backend/src/lib/expo-push.ts` (full file), `notification-brand.ts` (template payloads), `auth-notification-service.ts:36-44`, `:151-160`; `mobile/src/notifications/push.ts`, `usePushNotifications.ts`; `backend/src/routes/auth.ts:311-314`. Searched for an account-deletion route across `backend/src/routes/` — **there is none**.

---

### 9.0 Verdict

**Concurrence GRANTED IN PART.**

| Scope | Disposition |
|---|---|
| The shipped subset as a **technical design**, and continued development/testing against synthetic or staff accounts and devices | **Concurred** — no compliance objection |
| SR-007-2's closure (deferred takeover, fail-closed device check, structured audit trail, losing-account alert) | **Concurred as a security outcome**, with one defect in the *notice* limb that the chair's and `security-engineer`'s reasoning both lean on — §9.7 |
| Sending push or domain email to **any real customer's device or address** | **WITHHELD** — C-007-1 (Expo operator review + s21 contract + s72 basis), C-007-2 (Resend operator review — the same condition as Feature 006 C-006-3), C-007-4 (RoPA) |
| Any **theft-, recovery- or GPS-derived** push | **WITHHELD** — SR-007-3 is elevated from a security recommendation to **compliance-required**, and extended to the `data` payload, not just the visible body (§9.4) |
| Enabling the **`marketing`** category for any customer on any channel | **WITHHELD** — C-007-5: no consent record exists (SR-007-4 open, Feature 006 C-006-2 open). The defaults are correct today; the moment one is flipped there is nothing to evidence it with |
| **Retention** for the four live notification collections | **Ruled here** — §9.5, C-007-3. None existed; nothing enforces one today |

I am not adding a sixth blocking finding to the chair's list. Three of the five withheld items are pre-existing platform-level conditions (vendor agreements, RoPA, consent record) rather than defects Feature 007 introduced; the two that are genuinely this feature's are the retention gap I rule on in §9.5 and the new personal-information store in §9.6.

### 9.1 Regulatory scope confirmed for this feature — determined, not assumed

Per this role's standing rule that no single regime is defaulted to:

- **POPIA (Act 4 of 2013) — applies.** Same confirmed footprint as Feature 006 §8-C.1 and `compliance-review-supabase.md` §0/§4: ZAR pricing, `.co.za` sending domain, SA-resident data subjects. Nothing in Feature 007 changes the footprint; it adds two operators to it.
- **A second SA instrument applies to one channel and has not been named anywhere in this feature's documents: the ECT Act (25 of 2002) s45**, on unsolicited commercial communications, which sits *alongside* POPIA s69 rather than being displaced by it — it requires that any unsolicited commercial message identify the sender and offer an opt-out, and makes it an offence to continue after opt-out. It bites only on the `marketing` category. Recorded now so the preference-centre work does not treat POPIA s69 as the whole of the obligation. **Flagged as C-007-7.**
- **GDPR — not established as applicable; unchanged and re-assessed against this feature specifically.** Expo, Apple, Google and Resend being non-SA processors is a *transborder* fact under POPIA s72, not an Art. 3 targeting fact. No EU-resident data subject, EU-currency price, or EU-directed marketing exists in the tree. **Assessed and negative, not ignored.** Revisit trigger unchanged; escalation to `product-manager`/`cto` if the market question is ever answered differently.
- **PCI-DSS — out of scope for this feature, verified this session.** No card data flows through any notification path. Note for the record: a `billing` category exists in `DEFAULT_NOTIFICATION_PREFERENCES` (`repositories/notification-preferences.ts:43`) with **no event source built**, and my own `compliance-review-notifications.md` §2 permits "payment amounts" in email and push. That permission is a *design-time* one; it re-enters scope at `payment-engineer`'s gateway selection, at which point PAN/expiry/CVV must be absent from every template by construction, not by review. **Not a finding today.**
- **Insurance-sector recordkeeping — does not attach yet.** No policy is activated (Feature 006 creates `pending_activation` only), so no FAIS/Insurance Act record-of-financial-service floor attaches to any notification record. This matters for §9.5: absent that floor, POPIA s14 leaves only a **ceiling**, and the longest defensible period is the shortest one that serves the purpose. Reassess at first policy activation.

### 9.2 My own design-time flags, checked against the shipped code

| `compliance-review-notifications.md` | Shipped behaviour, verified | Disposition |
|---|---|---|
| §2 — **precise GPS coordinates prohibited in push/SMS, avoid in email** | No template in `notification-brand.ts` interpolates a coordinate; `buildExpoPushPayload` (`lib/expo-push.ts:38-61`) constructs `to/title/body/subtitle/data` and has no coordinate path | **Met.** I concur with the chair's §2 table row |
| §2 — **auth tokens / OTP never in push** | No token or OTP appears in any push template or in `data` | **Met** |
| §2 — **other customers' data never** | Every template variable derives from the target account's own records | **Met** |
| §2 — name and policy/claim numbers permitted in push | Bodies interpolate `assetName`; `data` additionally carries `assetId`, `policyId`, `caseId`, `deepLink` (`notification-brand.ts:91-320`) | **Permitted by my §2 as written — and my §2 was too permissive for the theft/recovery categories.** Corrected at §9.4 |
| §7 — **"push tokens stored hashed at rest (recommended)"** | Not implemented; `expoPushToken` is stored in plaintext beside `tokenHash` (`repositories/push-tokens.ts:118-127`) | **My flag was wrong and I withdraw it.** The chair's §3 is right: sending a push requires the plaintext token, so hashing-at-rest is not implementable, and the honest control set is at-rest encryption + RBAC + no read path + the credential classification. I adopt §3's ruling, including that `expoPushToken` is **credential-class**: never logged, returned, exported, or shown in an admin or support UI. A design-time recommendation that cannot be implemented should be withdrawn on the record, not left to be quietly ignored |
| §7 — rate limit notification APIs per account | Present on all five routes; 3/hour on `/notifications/test` (`routes/notifications.ts:64-68`, `:227-231`) | **Met** |
| §7 — **no notification content in application error logs** | Met inside the notification services. **One exception found outside them**, in a Feature 006 route that sends mail: `backend/src/routes/auth.ts:311-314` logs a full customer email address on the mail-failure branch | **Met for this feature**; the exception is filed as Feature 006 **C-006-8** and cross-referenced here so the log-hygiene rule is enforced platform-wide rather than per-feature |
| §9 (push checklist) — **token deletion on logout** | See **§9.12** — this row as originally written repeated `security-engineer` §8.2's finding, which remediation had already overtaken. Verified position: logout-all and both password-reset branches call `disableAllForAccount`; admin deactivation has no endpoint to call it from | **Met for every trigger that exists.** Residual is C-007-10 (wire it into the deactivation endpoint when built) and C-007-11 (no deletion path at all) |
| §6 — **audit trail of consent changes** | Not built (SR-007-4 open) | **Not met.** Becomes blocking at the first `marketing` opt-in — C-007-5 |
| §9 (push) — **Expo DPA / subprocessors documented** | Nothing in the repository evidences one | **Not met** — C-007-1 |

### 9.3 `marketing` defaults — the one thing I most expected to have to block, and it is right

`DEFAULT_NOTIFICATION_PREFERENCES` (`repositories/notification-preferences.ts:40-48`) sets `marketing: { push: false, email: false, sms: false }` — **all three channels off by default**, while every transactional category defaults on. That is opt-in, not opt-out, and it is the correct POPIA **s69** posture: direct marketing by electronic communication to a data subject who has not consented is prohibited, and a pre-ticked or defaulted-on channel is not consent as POPIA s1 defines it ("voluntary, specific and informed expression of will"). **Concurred without condition.**

What is missing is not the default but the evidence trail for changing it. `PATCH /notifications/preferences` merges the patch and writes `channels` + `updatedAt` (`:106-116`) — **the act of consenting is recorded as a boolean overwrite with no actor, no timestamp of the specific change, no source IP, no surface, and no prior value**. So on the day a customer flips `marketing.email` to `true`, the platform's only record is that the flag is now true, which is indistinguishable from a bug, an admin action, or a migration.

**C-007-5, and it is a hard gate, not a recommendation:** no `marketing` message may be sent on any channel until (a) SR-007-4's append-only preference-change record exists, and (b) it captures the field set already specified in Feature 006 §8-C.3 — account id, purpose, timestamp on the server clock, surface, source IP, and **one row per change, never an overwrite**. s69 consent must also be withdrawable as easily as it was given (s11(2)(b)), and every message must carry the opt-out that ECT Act s45 requires independently (C-007-7). This binds `notification-engineer` and `backend-architect` at the preference-centre UI, which is the first surface that will make this reachable.

### 9.4 Cross-border processing — what actually leaves South Africa, and my elevation of SR-007-3

My design-time §4 listed Expo and Resend in a table. The shipped code makes the flows concrete, and one of them is not what §4 described:

| # | Flow | Personal information crossing the border | Verified at |
|---|---|---|---|
| X1 | **Mobile device → Expo, directly** | The device requests its own push token from Expo's service using the EAS `projectId`. **Expo is a recipient before the backend is involved at all** — my §4 modelled Expo only as a downstream recipient of what we send it. That is incomplete | `mobile/src/notifications/push.ts:56-71` |
| X2 | **Backend → `exp.host`** | `to` (the token — credential-class), `title`, `body`, `subtitle`, and the whole `data` object: `event`, `category`, and per template `assetName`, `assetId`, `policyId`, `caseId`, `deepLink` | `lib/expo-push.ts:38-61`, `:80-84`; `notification-brand.ts:91-320` |
| X3 | **Expo → APNs (Apple) / FCM (Google) → device** | Same content, onward. Apple and Google are **onward recipients under s72(2)**, and the platform holds no agreement with either | Inherent to Expo push; chair's N3 |
| X4 | **Backend → Resend** | Recipient email address and rendered HTML body | `lib/auth-notification-service.ts:136`, `:159` |

**The s72 position, stated plainly:** `compliance-review-supabase.md` §4.3 established that this platform relies on **s72(1)(a)** (a binding agreement imposing effectively-equivalent protection) and deliberately **rejected s72(1)(b) consent** as a transborder basis (§4.3.1). That reasoning applies here unchanged, which means Expo and Resend each need their own s21 written contract and their own s72(1)(a) instrument — one executed Supabase DPA does nothing for either. **No agreement for either is verifiable from this repository, and I am not assuming one exists.** C-007-1 (Expo, including the X1 direct-from-device flow and the X3 onward limb) and C-007-2 (Resend — the identical condition already filed as Feature 006 C-006-3, and the existing SMTP-vendor review is for **Brevo**, a different vendor).

**SR-007-3 — I elevate it, and extend it.** The chair ruled that theft/recovery categories need a redacted lock-screen form, on lock-screen-disclosure grounds. Two POPIA points sit on top of that, and they change what "done" means:

1. **s10 minimality applies to what we transmit to an operator, not only to what a bystander can read.** Redacting the visible `body` while still shipping `assetName` in `data` (`notification-brand.ts:250`) satisfies the shoulder-surfing concern and leaves the transborder disclosure identical. **The redaction must cover the `data` payload too** — a theft/recovery push should carry an opaque case or asset reference that only the authenticated app can resolve, not a human-readable asset name. Filed as **C-007-6**.
2. **A theft- or recovery-category notification is a statement about the state of a specific person's specific valuable property**, and once Feature 008 or the hardware-tracker pipeline exists, its timing correlates with location events. That is a materially more sensitive disclosure than the "name and policy number" my own §2 table waved through, and the correction is mine to make.

**Consequently: SR-007-3 + C-007-6 are compliance-required before any theft-, recovery- or GPS-derived push is emitted to a real customer.** This is the same precondition the chair set at §6 and §7.2; I am recording that it is independently a compliance one, so it cannot be traded away as a UX preference.

### 9.5 Retention — ruled here, because nothing in this feature has a retention rule and nothing enforces one

Verified: none of the four collections in `db/notification-collections.ts` has a TTL index, a purge function, or a scheduled job, and the platform-wide purge-scheduling gap (`HANDOFF.md` FU-A13 — `app.purge_expired_audit_log()` exists and nothing calls it) means "we will purge it" is not currently an evidenced control anywhere. My own §5 proposed periods for records that do not exist (`notification_deliveries`) and was **silent on the ones that do**. Corrected:

| Collection / record | Retention ruling | Reasoning |
|---|---|---|
| `device_push_tokens` — **disabled** rows (`enabled: false`) | **Delete 90 days after `updatedAt`** | Once disabled, the row serves no delivery purpose. 90 days preserves a short window for investigating a disputed takeover (§9.6) and no longer. s14(1) |
| `device_push_tokens` — enabled rows | **Life of the account**; delete on account closure. Additionally: delete any row not re-registered for **180 days** (the app re-registers on every entry, so a stale row is a device that is gone) | The token is only useful while the device is live |
| `notification_preferences` | **Life of the account + 12 months** | It is the evidence of a customer's own choices, including a s69 consent or its withdrawal. It must outlive the account by enough to answer a complaint. **12 months, not the 6 years my §5 proposed** — that figure assumed an insurance-recordkeeping floor which, per §9.1, does not attach while no policy is ever activated. **Revisit at first policy activation**, and only upward with a documented s14(1)(c)/(d) purpose |
| `notification_delivery_state` | **Purge 24 months after `updatedAt`**; delete on account closure | Onboarding/renewal dedupe counters; no evidentiary value beyond the reminder cycle |
| `push_token_security_events` | **12 months** — see §9.6 | Aligned with ADR-0006 §14.2's ruling for security-operations telemetry |
| Rendered email HTML | **Do not store** (unchanged from §5) | Verified: nothing in `backend/src/` persists a rendered body. Resend's own retention of message bodies and previews is a **vendor** question inside C-007-2, and is the exact defect `compliance-review-smtp-vendor.md` C-5.2/C-5.3 identified against the previous vendor — a verification or reset token sitting in an operator's message store |

**C-007-3:** these periods are mandatory and must be **enforced by an automated, auditable job, not a policy sentence** — TTL indexes or a scheduled purge with a run record, following whatever mechanism `database-architect` lands for the platform-wide purge gap. `database-architect` owns implementation; the numbers are mine. Two framing points carried from ADR-0006 §14.2: these are **ceilings, not floors** — POPIA imposes no minimum retention on any of this — and none of them may be extended by a quiet constant change.

### 9.6 The SR-007-2 remediation created a new personal-information store with no retention owner — `C-007-8`

`push_token_security_events` (`db/notification-collections.ts:117-143`) records `eventType`, `claimingAccountId`, `claimingDeviceId`, `contestedAccountIds`, `actorSessionId`, **`ipAddress`**, **`userAgent`**, `createdAt`.

`ipAddress` and `userAgent` are behavioural personal information about an identifiable person — ADR-0006 §11 classified exactly these two fields, in exactly these terms, for `admin_access_log`. So a security remediation has created a **third persistence surface holding behavioural PI**, with no TTL, no purge, no RoPA entry, and — per its own honest code comment — full ADR-0006 Trail A/B integration deferred to a future `backend-architect` ruling. This is precisely the pattern I named in Feature 006 §8-C.8: an audit record whose retention nobody owns. It is not a criticism of the fix, which is good and which `security-engineer` verified properly; it is the follow-through the fix did not have.

**Ruling: 12 months, matching Trail A's `privileged_data_access` and Trail B's `admin_access_log`** (ADR-0006 §14.2(1)). Reasoning, so it can be reopened rather than re-guessed: a record that someone contested a push token is security-operations telemetry about access to our own platform, not a record of a financial service rendered — the same class ADR-0006 §14.2(2) placed at 12 months, and therefore outside any FAIS/Insurance Act floor. AUD-7(a)'s `min()` symmetry rule applies if this collection is ever correlated with either existing trail. **C-007-8:** implement the purge, and route the ADR-0006 R-4 question (is this a third trail, or does it fold into one of the two?) to `backend-architect` before this collection accumulates real customer events — a third untracked audit store is the specific outcome R-4 exists to prevent.

### 9.7 The notice limb of the SR-007-2 fix is defeasible by a preference — new, and it matters to how the closure was reasoned

The chair's acceptable-control menu (§7.2) required the losing-account email **in combination with** the deferred takeover, and `security-engineer` §8.1 verified it fires exactly once per contested claim. Both are correct. But `notifyPushTokenReregisteredElsewhere` returns without sending when the account's preferences say otherwise:

```
if (!isEmailEnabled(prefs.channels) || !isResendConfigured(deps.env)) return;   // auth-notification-service.ts:156
function isEmailEnabled(channels) { return channels.account?.email !== false; } // :36-40
```

So a customer who has turned off `account`-category email — a setting the API openly permits — receives **no notice at all** that another account has claimed their device's push token and that their alerts will be disabled in 24 hours. The 24-hour cooldown's protective value is that the victim can react; a victim who is never told cannot. The same gating applies to `notifyAccountLocked` (`:134`).

This is a compliance point as well as a security one: a notice that discharges a security or legal obligation is not a marketing preference, and POPIA s69's opt-out machinery has never applied to it. **C-007-9 (non-blocking, but required before the SR-007-2 mechanism is relied on with real customers):** classify security notices — token takeover, account lockout, and in due course s22 breach notification — as **non-preference-gated**, delivered regardless of category settings, and separate them from the `account` category in the preference model so that a customer silencing routine account email cannot silence them. I am flagging this to the chair and `security-engineer` rather than re-opening SR-007-2: the primary control (deferred takeover) stands on its own, and it is the compensating notice that is weaker than either concurrence assumed.

### 9.8 SR-007-1 — I adopt `security-engineer`'s refusal to close it, on compliance grounds too

> **Superseded in part by §9.12 (same day).** The password-reset half of this finding was remediated after `security-engineer`'s §8 and before I re-checked; the paragraph below is left as written and corrected at §9.12 rather than edited, per this document's own precedent (§7.1). The compliance framing and the deletion-path point are unaffected.

`disableAllForAccount` is called from `POST /session/logout-all` and nowhere else; `POST /auth/reset-password/confirm` revokes every session but leaves every push token enabled, and no account-deactivation path touches `device_push_tokens` (verified this session — `routes/admin-accounts.ts` contains no `pushTokens` reference, and **no self-service account-deletion route exists anywhere in `backend/src/routes/`**).

The compliance framing, which is narrower than the security one and independent of it: after a password reset prompted by a suspected compromise, continued delivery of notifications naming the customer's assets to a device the customer may no longer control is **continued processing after the data subject has taken the clearest available action to stop it**, and it is a s19 measure that does not exist rather than one that failed. **C-007-10:** SR-007-1's remaining two trigger points (password-reset completion, account deactivation) are compliance-required before push is sent to real customers.

The absent deletion path is the larger point behind it: with no account-closure or erasure flow anywhere on the platform, **none of §9.5's "delete on account closure" rulings has a mechanism to hang on**, and a POPIA **s24(1)(b)** deletion request or a **s23** access request could not be answered for these collections today. Filed as **C-007-11**, owner `backend-architect` + `database-architect`, and it is a platform-level gap that Feature 007 has made larger rather than one it created.

### 9.9 Push permission is requested with no primer and no s18 notice — `C-007-12`

`usePushNotifications()` calls `syncPushTokenWithBackend()` in a bare `useEffect` on entry to the authenticated app shell (`mobile/src/notifications/usePushNotifications.ts:8-12`), which calls `requestPushPermissions()` → `Notifications.requestPermissionsAsync()` (`push.ts:33-54`). **The OS permission dialog fires cold**, with no in-app explanation of what will be sent, by whom, or that message content is transmitted to processors outside South Africa.

Push permission is a lower-stakes permission than location, and transactional notifications rest on **s11(1)(b)** contract-necessity rather than consent, so this is **not a blocker**. It is nonetheless the same anti-pattern this organisation already corrected once this month — the onboarding photo step that requested camera and media-library permission with nowhere to send the result. And POPIA **s18** requires the data subject be told the purpose and the recipients at the point of collection; a cold OS dialog tells them nothing about Expo, Apple or Google. **C-007-12:** add the same two-step primer pattern that Feature 008's architecture §2.2 already specifies for location — an in-app primer before the OS prompt — and surface the operator disclosure there or in the privacy notice. Owner `ux-researcher` + `ui-designer` + `mobile-engineer`; copy requirements mine.

### 9.10 Open compliance questions from `compliance-review-notifications.md` §10 — dispositioned

| ID | Question | Disposition now |
|---|---|---|
| **C-NOTIF-1** | Can customers disable theft push while a policy is active? | **Answered on the compliance limb: yes, it may lawfully be non-optional.** Theft-critical alerts are not direct marketing, so s69 does not reach them; and POPIA's **s11(3)(b)** right to object attaches to processing under s11(1)(d)/(e)/(f), **not** to s11(1)(b) contract-necessity, which is where a theft alert on an asset-protection policy sits. So the code's refusal of `theft_critical.push = false` (`routes/notifications.ts:212-214`) is defensible — **provided** the customer is told at signup that these alerts are part of the service (a s18 disclosure that does not exist today) and the product genuinely treats them as safety messages rather than a channel for anything else. **The asymmetry the chair identified at SR-007-7 must still be resolved deliberately** — `theft_critical.email = false` is accepted while push is refused, and one product answer must govern both channels. Product call: `product-manager`. **Compliance limb: closed.** |
| **C-NOTIF-2** | Is SMS for theft fallback legitimate interest without separate SMS marketing consent? | **Still open, and now with a firmer half-answer:** a *transactional* theft SMS sits on the same s11(1)(b) basis as the push and needs no s69 consent; a *marketing* SMS needs s69 consent and ECT Act s45 opt-out independently, and the two must never share a consent record. Full determination waits on vendor selection — no SMS vendor exists, and per `compliance-review-supabase.md` C-5's sequencing rule the operator review must happen **before** selection is finalised, not after (a sequence this platform has now broken twice on email vendors). Owner: me, at `integration-architect`'s vendor shortlist |
| **C-NOTIF-3** | Exact retention for `notification_deliveries` | **Partly moot, partly ruled.** `notification_deliveries` is not built (SR-007-8). Retention for the four collections that **do** exist is ruled at §9.5. My §5's 24-month delivery-metadata proposal stands as design intent for whenever the delivery log is built, and it re-enters review then, because a delivery log is the record that tells a customer "what did you send me, and when" under s23 |
| **C-NOTIF-4** | Security-company emails — responsible party vs operator | **Still open, and not reachable yet** — no notification path to a security company exists in the shipped subset. It becomes live with the first partner-facing notification and is inseparable from Feature 008's D-SD-05 (partner read access to location). Owner: me |

### 9.11 What I am explicitly not ruling on

SR-007-5 (fail-open notification bootstrap and its live-Atlas verification), SR-007-9 (`EXPO_ACCESS_TOKEN` handling), and the technical shape of SR-007-4's persistence surface are security-architecture and operations matters and remain exactly as the chair and `security-engineer` filed them. My only overlaps are named above: SR-007-4's record must carry the field set at §9.3, and whatever surface it lands on acquires a retention period from me at that point rather than becoming a fourth store nobody owns.

### 9.12 Correction to §9.8 — C-007-10 is narrower than I filed it

*Written after reading `notification-engineer`'s §9 (below), which landed in this document during the same session, and after re-checking the code myself rather than adopting their finding on trust.*

**§9.8 is wrong on the password-reset half, and the error is mine to correct in the open.** I wrote that `disableAllForAccount` "is called from `POST /session/logout-all` and nowhere else". Enumerating every production call site in `backend/src/` gives **three**, not one: `routes/session.ts:61`, `routes/auth.ts:869` (the non-privileged `/auth/reset-password/confirm` branch) and `routes/auth.ts:944` (the privileged `/auth/reset-password/mfa-verify` completion branch). Password-reset completion **does** now disable every enabled push token for the account, on both branches. `security-engineer` §8.2's finding was accurate when written; remediation landed between that section and mine, and I re-used its framing without re-deriving it. That is exactly the failure mode this project's house rule guards against, and it is more useful recorded than quietly patched.

**What survives, and what C-007-10 now means:**

| Trigger | Status, verified 2026-08-14 | Compliance position |
|---|---|---|
| `POST /session/logout-all` | Wired, test-covered | Satisfied |
| `POST /auth/reset-password/confirm` | Wired (`auth.ts:869`), test-covered per §9.1 below | Satisfied |
| `POST /auth/reset-password/mfa-verify` | Wired (`auth.ts:944`), **no regression test** | Satisfied in substance. A control with no test is a control that can regress silently — I am not making it a condition, but it belongs in SR-007-10's Stage 10 abuse cases |
| Admin-initiated deactivation | **No such endpoint exists** — `notification-engineer` §9.2 establishes this is a missing *feature*, not missing wiring, and files SR-007-11 | Re-scoped, see below |
| Account closure / erasure | **No such endpoint exists anywhere on the platform** | **Unchanged and unresolved** — C-007-11 |

**C-007-10 is therefore reduced to a single live item and re-stated:** whenever the account-suspend/deactivate endpoint of SR-007-11 is built, `disableAllForAccount` must be wired into it *in the same change*, and that wiring is compliance-required before that endpoint is used against a real account — an account suspended for suspected compromise that keeps pushing asset notifications to the suspected device is the same s19 defect, merely relocated. It is no longer a precondition on sending push to real customers, because the two triggers that were is are now closed. **C-007-11 (no deletion path) is untouched by any of this and remains the larger gap** — it is what makes every "delete on account closure" ruling in §9.5 currently unenforceable.

I record `notification-engineer`'s refusal to invent the deactivation endpoint to close a review item as the correct call, and the correct boundary: a missing privileged mutation surface needs its own design and its own Stage 8, not a side-effect implementation inside a notification task.

### 9.13 Sign-off record — `compliance-specialist` row

| Role | Status | Date |
|---|---|---|
| `compliance-specialist` | **Concurrence granted in part.** Concurred: the shipped subset as designed, for development and synthetic-account testing; SR-007-2's closure as a security outcome; the opt-in `marketing` defaults (§9.3); the chair's §3 credential-class ruling on `expoPushToken`, which supersedes and withdraws my own "hashed at rest" flag. **Withheld for real customer personal information** pending **C-007-1** (Expo operator review, s21 contract, s72(1)(a) basis — including the direct device→Expo flow and the Apple/Google onward limb), **C-007-2** (Resend operator review — same as Feature 006 C-006-3; the only existing SMTP vendor review is for a different vendor), **C-007-4** (RoPA — same as Feature 006 C-006-4). **Withheld for any theft/recovery/GPS-derived push** pending SR-007-3 + **C-007-6**. **Withheld for any `marketing` send** pending **C-007-5**. Retention ruled at §9.5 and §9.6 (**C-007-3**, **C-007-8**) — mandatory, automated, auditable. **C-007-10 corrected and narrowed at §9.12**: the password-reset triggers are wired (three production call sites verified), and the item now binds only the not-yet-built account-deactivation endpoint (SR-007-11). New: **C-007-7** (ECT Act s45), **C-007-9** (security notices must not be preference-gated), **C-007-11** (no deletion path exists for any of this data), **C-007-12** (cold push-permission prompt, no s18 notice). C-NOTIF-1 closed on the compliance limb; C-NOTIF-2/3/4 open | 2026-08-14 |

**Signed:** `compliance-specialist`, 2026-08-14. **Not legal advice and not a go-live approval.** Nothing in this section asserts that any vendor agreement has been executed — no DPA with Expo, Resend, Apple or Google is verifiable from this repository, and this session did not contact the platform owner. Where I could not resolve a question from the code, it is named as open rather than assumed resolved.

---

## 9. `notification-engineer` follow-up — 2026-08-14 (password-reset test coverage; admin-deactivation finding corrected)

*Appended, not substituted. §0–§8 stand as the record to date. Two of the two remaining §8.2 asks were picked up this session: the missing password-reset-confirm regression test, and the admin-deactivation wiring. Only the first was completable — the second turned out to rest on a premise the running code does not support, and that is recorded here rather than papered over.*

**Code read for this session:** `backend/src/routes/session.ts` (full file), `backend/src/routes/auth.ts:751-956`, `backend/src/routes/admin-accounts.ts` (full file, both handlers), `backend/src/routes/admin-accounts.test.ts` (full file), `backend/src/repositories/accounts.ts`, `backend/src/repositories/push-tokens.ts:70-75` (`PushTokensRepo` interface), `backend/src/routes/session-logout-all.test.ts` (test-style precedent), `docs/features/001-authentication/api-design.md` §11 (grepped for every `admin/accounts` and `deactivat`/`suspend` reference). Ran `npm test` and `npm run typecheck` myself.

### 9.1 Password-reset-confirm regression test — added

`backend/src/routes/auth.test.ts` gained a new suite, `POST /auth/reset-password/confirm — SR-007-1 push-token regression`, exercising the resetToken/email branch of the route end-to-end against a real HTTP server built from fakes, with `pushTokens` overridden to a real tracking fake (not `buildMinimalCtx`'s default `undefined as unknown as AppContext['pushTokens']`, which exists specifically to fail loudly on an untested path). The test asserts `200`, `allSessionsRevoked: true`, and — the load-bearing assertion — that `disableAllForAccount` was called exactly once, with the reset account's id. This pins `routes/auth.ts:869` (§8.2's first of two `/reset-password/confirm`-family call sites) with a real regression test where previously only source-reading had verified it.

I did not add a second test for the `/auth/reset-password/mfa-verify` completion branch (`auth.ts:944`, the privileged/MFA-gated path) — the task scoped the new test to `/auth/reset-password/confirm` specifically, and that branch's harness (TOTP challenge/verify plumbing via `resetMfaTokens` and the pending-reset KV record) is materially larger to stand up. Recording this as a narrower gap than "both branches fully test-covered": the non-privileged branch now has a regression test, the privileged branch still only has the source-level confirmation `§8` recorded.

### 9.2 Admin account deactivation — finding corrected, not closed

**§8.2 stated:** "the admin equivalent (`routes/admin-accounts.ts`, `PATCH` to `accountState: 'deactivated'`) does not touch `device_push_tokens` either — I read the full route file and there is no `pushTokens` reference in it at all." That last clause is accurate. The implied premise — that a `PATCH`-to-`accountState` admin mutation handler exists in this file, merely missing the `pushTokens` call — is not. I read `admin-accounts.ts` in full: it exports exactly two routes, `GET /admin/accounts` (list) and `GET /admin/accounts/{id}` (detail). There is no `router.patch`, `router.put`, or `router.post` anywhere in the file, and no other route file in `backend/src/routes/` registers a mutation against `/admin/accounts*` — I grepped every file for `router.patch(` / `router.put(` and for `deactivat`/`suspend` outside this file and found nothing that mutates `accountState`. `repositories/accounts.ts` has no `updateAccountState`/`setState`/equivalent method either — only reads (`findById`, `findByEmail`, `getAccountStatus`, `listForAdmin`, `findByIdForAdminDetail`) and the two account-creation paths.

I also checked whether this was simply unspecified-but-planned: `docs/features/001-authentication/api-design.md` §11 (the authoritative contract for this surface, amended through §11.F) specifies only `GET /v1/admin/accounts` and `GET /v1/admin/accounts/{id}` (§11 Amendment E). There is no amendment specifying a state-mutation endpoint, no `PATCH /admin/accounts/{id}` in the OpenAPI-shaped section of that document, and no other feature doc under `docs/features/` specifies one either.

**Conclusion: admin account deactivation is not a missing `pushTokens` wire-in — it is a missing feature, full stop.** Nothing in this codebase today lets an admin transition an account to `suspended` or `deactivated`. §8.2's framing (route exists, wiring doesn't) does not match the code as read; I am correcting the record here per this document's own established precedent (§7.1 corrected §0/§4 the same way, for the same reason: the record's accuracy matters more than its consistency with an earlier session's assumption).

Two consequences follow, and I want to be explicit about the boundary of my authority here rather than quietly overstep it:

- **I did not build the endpoint.** Introducing a new privileged, security-sensitive mutation surface (account suspension/deactivation, including its RBAC posture, session-revocation semantics, and audit-log shape) is a `backend-architect`/`backend-engineer` design decision requiring its own API-design amendment and its own Stage 8 review — not something to originate as a side effect of a notification-pipeline task. Fabricating it here would mean this security review signing off on API surface nobody has actually designed.
- **No test was added for "admin-deactivation wiring"** for the same reason: there is no code path to regress-test. A test asserting behaviour of a handler that does not exist would be either a no-op or a test against code I invented for the purpose, neither of which belongs in this suite.

**SR-007-1 status, precisely stated:** closed and test-covered for `POST /session/logout-all` (§8.2, `session-logout-all.test.ts`) and for the non-privileged branch of `POST /auth/reset-password/confirm` (§9.1, this session). **Not closed** for the privileged `/auth/reset-password/mfa-verify` completion branch (source-verified only, no test yet) or for admin-initiated deactivation, because the latter has no implementation to close against. I am **not** recording "fully closed across all three revocation points" — that claim would be false against the running code. The third point is better tracked as a new, explicit backlog item than as an open sub-clause of SR-007-1, since "wire the push-token disable into the admin deactivation handler" cannot be actioned before "build the admin deactivation handler."

**New item, SR-007-11 — no admin account-suspend/deactivate mutation endpoint exists.** Until one does, an admin who determines an account is compromised or fraudulent has no in-product mechanism to suspend/deactivate it at all — which is a materially larger gap than the push-token question that surfaced it. Owner: `backend-architect` (design + API-design amendment) and `backend-engineer` (implementation); this role (`notification-engineer`) owns wiring `ctx.pushTokens.disableAllForAccount` into whatever handler results, following the exact pattern already proven at `session.ts:61` and `auth.ts:869`/`:944`, the moment that handler exists.

### 9.3 `npm test` / `npm run typecheck` — run this session

```
Test Files  36 passed (36)
     Tests  188 passed (188)
```
(187 baseline + 1 new: the §9.1 regression test.) `npm run typecheck` produced no output and exited clean.

### 9.4 Revised status for this item

| Sub-item | Status |
|---|---|
| `POST /session/logout-all` → `disableAllForAccount` | Closed, test-covered (§8.2) |
| `POST /auth/reset-password/confirm` (non-privileged branch) → `disableAllForAccount` | Closed, test-covered (§9.1, this session) |
| `POST /auth/reset-password/mfa-verify` (privileged branch) → `disableAllForAccount` | Closed in code (`auth.ts:944`), **not yet test-covered** |
| Admin account deactivation → `disableAllForAccount` | **Not applicable — no admin deactivation endpoint exists in this codebase.** Filed as SR-007-11. |

**Signed:** `notification-engineer`, 2026-08-14.

---

## 10. `cto`-ratified correction — 2026-08-24 (SR-007-11 status)

*Appended, not substituted, per the same precedent §7.1 and §9.2 already established: the record's accuracy matters more than its consistency with an earlier session's assumption.*

**§9.2's premise no longer holds against the current tree.** `backend/src/routes/admin-accounts.ts` now contains a complete `PATCH /admin/accounts/:id/state` handler (lines ~175–264): `requireUserType('admin')`, per-actor rate limiting, Zod-validated body (`accountState: 'active' | 'suspended' | 'deactivated'`, optional `reason`), self-mutation and admin-user-type-mutation blocked, `ctx.accounts.transitionAccountState(...)` with `InvalidAccountStateTransitionError` mapped to `CONFLICT`, an audit-log record on every mutation, and — the exact wiring SR-007-11 was filed to obtain — on transition to `suspended` or `deactivated` it calls `ctx.sessions.revokeAllForAccount`, revokes the issued JTIs in KV, and calls `ctx.pushTokens.disableAllForAccount(subjectId)`. The handler and the wiring both exist in code, with test coverage in `backend/src/routes/admin-accounts.test.ts` (`GET/PATCH /v1/admin/accounts*` suite).

**Revised status: SR-007-11 is implemented, pending Stage 8 security review.** This is not a re-close of the finding by fiat — no chair (`cybersecurity-architect`) or `compliance-specialist` re-verification of this specific handler is recorded anywhere in this document, and one is required before it can be signed off the way SR-007-1/SR-007-2 were: RBAC posture, the `ADMIN_MUTABLE_USER_TYPES` restriction, the audit-log shape, the session-revocation and push-token-disable side effects, and the state-transition rules in `transitionAccountState` all need their own Stage 8 pass, not an inherited one. Until that pass runs, treat the endpoint as: code-complete and test-covered, not yet security-reviewed for this document's purposes. §9.4's table row "Admin account deactivation → `disableAllForAccount`" is superseded by this section — the correct current status is "closed in code, test-covered, Stage 8 review outstanding," not "not applicable."

**Signed:** `technical-writer`, 2026-08-24, recording a `cto`-ratified finding. Not a Stage 8 sign-off — that authority remains `cybersecurity-architect`'s (chair) and `compliance-specialist`'s.
