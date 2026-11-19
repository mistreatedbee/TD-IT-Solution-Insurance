# Feature 021 stage (b): protection-change step-up spec

**Author:** `cybersecurity-architect`. **Date:** 2026-11-17. **For:** `authentication-engineer` (A), `backend-engineer`, `mobile-engineer`, `frontend-engineer`, `automation-qa-engineer`.
**Governing:** ADR-0020 D4 as amended by its §9 (A-1 to A-8); ADR-0012 (INV-1 to INV-3, §2.2, §9.5); ADR-0009 SDL-9.
**Status:** Implementable spec. **Not** a Stage 8 sign-off. Nothing merges to `main` until `cto` ratifies ADR-0020 §9 and this stage passes Stage 8 (`cybersecurity-architect` + `security-engineer` + `compliance-specialist`) and Stage 10.
**Does not touch:** `LOCATION_INGESTION_ENABLED`, any `EXPO_PUBLIC_FEATURE_*` flag, `eas.json`, Render env. Release Gate A is not widened. Nothing here ingests, reads or enables location.

Code verified on branch `feat/mobile-assets-redesign`, 2026-11-17. Re-verify line numbers before editing.

---

## 1. Guarded actions and the routes that perform them

| # | Action | Route today | Stage (b) disposition |
|---|---|---|---|
| G-1 | Remove an asset | `DELETE /v1/assets/:assetId` (`backend/src/routes/assets.ts:520`) | **Guard.** Add `requireProtectionStepUp` after the rate limiter and before any read. Also refuse with `409 CONFLICT` if a non-terminal claim exists (`ctx.claims.findNonTerminalByAssetForAccount`, `repositories/claims.ts:238`) or an open recovery case references the asset (**no such repo method exists today**: `backend-engineer` adds `findOpenByAssetForAccount` to `recovery-cases.ts`). Refuse whatever the step-up state is (ADR-0020 §9 A-6). |
| G-2 | Change emergency contact | Field `emergencyContact` on `PATCH /v1/account/profile` (`customer-profile.ts:76`, handler line 119) | **Guard at field level.** If `body.emergencyContact` is present and differs from the stored value, call `assertProtectionStepUp(ctx, req)` **before any write in the handler**, including `updatePhone` at line 105. Edits to other fields stay ungated. The schema cannot clear the contact (`customer-profile-validation.ts:36`); keep it that way. |
| G-3 | Unlink a tracker from an asset | **No route exists.** `tracking-devices.ts` has only `register` and `link`. | Not built in stage (b). Any future unlink, re-link or deactivate route must be built with the guard and A-6 from the start. Add a `status: 'reserved'` row to the policy table (§3). |
| G-4 | Switch tracking off / withdraw location consent | `DELETE /v1/assets/:assetId/location` (`assets.ts:244`): POPIA s18 withdrawal **plus immediate history purge** | **Do not modify** (ADR-0020 §9 A-2). Pending `compliance-specialist` ruling on gating only the purge. Stopping collection stays immediate and ungated. |
| G-5 | "Switch protection off" as a product toggle | **No route exists.** | Out of scope until a route is designed. It is born guarded when it is. |
| G-6 | "Was this you?" reply | Not built (stage e). | "Yes" needs this step-up. "No", and silence, never do (A-5). |
| G-7 | Add or upgrade a next-of-kin contact | Not built (ADR-0021, stage e). | Inherits this step-up plus PIN or code word. |

Not guarded, deliberately: `POST /assets/:assetId/tracking-devices/link` (it adds protection), `POST /session/logout-all` and `DELETE /devices/push-token` (defensive or harmless), and `PATCH /notifications/preferences` (made harmless by §5's rule that notices cannot be suppressed).

## 2. Mechanism

### 2.1 Customers WITH a verified TOTP factor

Reuse `POST /v1/auth/mfa/step-up/challenge` and `/verify` (`routes/step-up.ts`) unchanged. They write `mfa_verified_at` (INV-1). The response's `stepUpExpiresAt` reflects the 15-minute admin window, and the client must not use it to decide protection-change freshness. Optionally add a `windows` map later; it is not required.

### 2.2 Customers WITHOUT a verified TOTP factor: password re-authentication (scoped exception, ADR-0020 §9 A-1)

```
POST /v1/auth/reauth/password     Authorization: Bearer <access token>
  body: { password }                  (.strict(); no email, no accountId, no biometric field)
  200 → { reauthAt, reauthExpiresAt } // NO tokens, NO session rotation
  401 → INVALID_CREDENTIALS { attemptsRemaining }
  409 → MFA_STEP_UP_REQUIRED          // new code: account has a verified TOTP factor (anti-downgrade)
  401 → UNAUTHORIZED                  // session revoked/missing (live read)
```

Server steps, in order:
1. Read the session live (`ctx.sessions.findById`). Refuse if it is missing or revoked.
2. Check the rate limits (§7).
3. Load the account. The email comes **from the account row only**. Customer `userType` only: privileged types get `403 FORBIDDEN`.
4. `ctx.supabase.verifyPassword(account.email, password)`.
5. On success, check `findVerifiedTotpFactor(userAccessToken)`. If a factor exists, return 409 `MFA_STEP_UP_REQUIRED` and write nothing.
6. Discard the transient `userAccessToken` and do not store it anywhere. `authentication-engineer` confirms whether the GoTrue session that `verifyPassword` creates should be signed out. Login already creates one, so this is not a new class of artefact, but say so in the PR.
7. `ctx.sessions.touchPasswordReauthAt(sessionId, now)`. **This is the only write.**

Invariants (binding; extend ADR-0012 INV-1 to INV-3):
- **P-INV-1:** `password_reauth_at` is written only by step 7. A password check **never** writes `mfa_verified_at`.
- **P-INV-2:** refresh copies `password_reauth_at` forward and never renews it, mirroring `refresh-session.ts:237`. Add a regression test.
- **P-INV-3:** the check reads the session row live per request. No JWT claim, no cache, no client field.
- **P-INV-4:** `touchPasswordReauthAt` updates one column, `WHERE id = $1 AND revoked_at IS NULL`. It never touches `expires_at` or `absolute_expires_at`.

Schema: new nullable column `app.sessions.password_reauth_at timestamptz`, through a migration designed by `database-architect`, with a column comment citing ADR-0020 §9 A-1. Also an audit-event-type migration (§6), following the pattern of `035_adr0012_step_up_audit_event_types.sql`.

### 2.3 Enforcement helper (`backend/src/lib/step-up.ts`)

Add `requireProtectionStepUp(ctx)` (middleware) and `assertProtectionStepUp(ctx, req)` (in-handler, for G-2). The check passes if the live session is not revoked **and** either:
- `mfaVerifiedAt` is within `STEP_UP_WINDOW_SECONDS.protectionChange`, or
- `passwordReauthAt` is within the same window.

Otherwise it raises `STEP_UP_REQUIRED`. Passing on `passwordReauthAt` when the account has enrolled MFA after the reauth is a race of at most 5 minutes, and is accepted. **`requireStepUp` (the admin check) must never read `passwordReauthAt`.** Write a test for this.

Add a separate `CUSTOMER_PROTECTION_STEP_UP_ACTIONS` table (G-1 and G-2 `enforced`, G-3 `reserved`). Do not add these rows to `STEP_UP_ACTIONS`, because `routes/step-up.test.ts` asserts every row there is `enforced` admin Tier A.

## 3. Freshness window (`backend/src/lib/policy.ts`)

```ts
/** ADR-0020 D4 / §9 A-4: customer protection-change step-up freshness.
 * Applies to both mfa_verified_at and password_reauth_at. Shorter than the
 * 15-min admin window: the main threat is a snatch theft with the app open. */
export const PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS = 5 * 60;
```

Place it directly after `INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS` (line 200), and re-export it as `STEP_UP_WINDOW_SECONDS.protectionChange` in `step-up.ts`. Loosening it needs `cybersecurity-architect` counter-signature, per the header governance in `policy.ts`.

## 4. Error behaviour

- Stale or absent proof on a guarded action: **reuse `STEP_UP_REQUIRED` (401)**. No new code.
- `MFA_STEP_UP_REQUIRED` (409) is the only new code. It tells the client to switch to the TOTP flow, and is added to `lib/errors.ts` and both `user-facing-errors.ts` maps.
- Clients handle `STEP_UP_REQUIRED` with an in-place interstitial, never a logout (ADR-0012 §2.4):
  1. Choose TOTP or password: try `step-up/challenge`. If it returns `MFA_NOT_ENROLLED`, show the password sheet. If the password route returns `MFA_STEP_UP_REQUIRED`, show the TOTP sheet.
  2. Re-authenticate.
  3. Retry the original request once.

  A blocked request never reaches the handler, so a plain re-send is safe (ADR-0012 §9.2).
- `409 CONFLICT` for A-6 carries copy telling the customer to contact support while a case or claim is open. It must not say which kind of record exists.

## 5. Out-of-band notification on each change (SDL-9 pattern; ADR-0020 §9 A-3)

- Add `notifyProtectionChanged({ accountId, action, assetDisplayName?, deviceName, at })` to `AuthNotificationService`. Send email through `sendResendEmail` **regardless of `channels.account.email`**: it is a security notice and cannot be suppressed. Push may also go out under the template `auth.protection.changed`.
- Fire it after the change commits, through `notifyInBackground`. A notification failure does not roll the change back, but it is audited (§6).
- Content: what changed, when, the session's device name, and a "Not you? Reset your password and contact support" line. **Never** include coordinates, an address, the emergency contact's phone number (mask all but the last 3 digits), or any secret.
- Also send it when re-authentication is exhausted (§7).
- Launch dependency: production Resend delivery (owner action). `isResendConfigured === false` in production blocks Stage 8 for this stage. It is not a silent skip.

## 6. Audit events (`app.audit_log`, Trail A; new types via migration)

| Event | When | Fields |
|---|---|---|
| `protection_reauth_verified` | password reauth success | accountId, actorSessionId, ip, auditRequestId |
| `protection_reauth_failed` | wrong password | same |
| `protection_reauth_exhausted` | limit hit; session revoked | same |
| `protection_change` | G-1 or G-2 committed | same + `action` (`asset_removed` / `emergency_contact_changed`), `method` (`mfa` / `password`), target assetId when relevant |
| `protection_change_notice_failed` | notification dispatch error | accountId, action |

The existing `mfa_step_up_verified` / `_failed` events cover the TOTP path. Never log the password, TOTP code, challenge token, contact name or phone, or any location. `security-engineer` adds a detection rule on bursts of `protection_reauth_failed`, alongside ADR-0012 C-4. `compliance-specialist` confirms that the fields are minimal (as in ADR-0012 C-5).

## 7. Rate limits and lockout

- New `PROTECTION_REAUTH_LIMIT = { attempts: 5, windowSeconds: 15 * 60 }` in `policy.ts`, keyed on **both** account and session. Per-IP ceiling: reuse `LOGIN_LOCKOUT.perIpAttempts` / `perIpWindowSeconds`.
- Separate counter from `LOGIN_LOCKOUT` per identifier. Failed reauth must not lock the owner out of logging in on another device.
- **On exhaustion, revoke the current session only**, then audit `protection_reauth_exhausted` and send the §5 notice. This deliberately departs from ADR-0012 §2.2.4. There, the attacker is remote and revoking would deny service to the admin. Here the main threat shares the one physical session, so revoking removes the thief's foothold, and the owner signs in again on their own device. The account itself is not locked.
- The TOTP path keeps ADR-0012's existing limits and non-revoking behaviour unchanged.

## 8. Optional on-device biometric: a UX gate only

- It may be shown **before** the server re-authentication sheet, to make casual misuse slower. It is never instead of that sheet.
- The client **may not**:
  - send any field asserting a biometric result (server schemas are `.strict()`; a test proves such a field is rejected);
  - skip or shorten the server step on a biometric pass;
  - keep the password or a TOTP secret in SecureStore or Keychain to be released by biometric (that would make the biometric the credential);
  - word any copy to say the change was "verified by Face ID / fingerprint" or that the account is "secured".
- The client **may** say: "Confirm it's you" and "For your security we'll ask for your password."
- Adding `expo-local-authentication` is a native-module decision for `mobile-architect`. This spec does not authorize it.
- A device-bound key released by biometric would need its own ADR (key registration, attestation, revocation). It is not assumed.

## 9. Tests engineering must write

Backend:
1. G-1 and G-2: no proof → 401 `STEP_UP_REQUIRED`, **no mutation and no audit row**. Fresh MFA proof → 200. Fresh password proof → 200. Proof older than 300 s → 401. Boundary at exactly 300 s passes.
2. G-2: editing only `firstName` with no proof → 200. Changing `emergencyContact` with no proof → 401, and `phone` in the same body is not written.
3. G-1 with an open claim, or an open recovery case → 409, even with fresh proof.
4. Revoked session with a fresh `passwordReauthAt` → `STEP_UP_REQUIRED`.
5. P-INV-1: a password reauth leaves `mfa_verified_at` unchanged. **`requireStepUp` (admin) rejects a session with only a fresh `passwordReauthAt`.**
6. P-INV-2: refresh copies `password_reauth_at` and does not renew it.
7. P-INV-4: `expires_at` and `absolute_expires_at` are unchanged after reauth. The response carries no tokens.
8. Account with a verified TOTP factor → password route 409 `MFA_STEP_UP_REQUIRED`, nothing written.
9. Body containing `email`, `accountId` or `biometricVerified` → 400.
10. The 5th failure revokes only the current session. Other sessions survive. The login lockout counter is untouched.
11. Privileged `userType` on the password route → 403.
12. The notice is sent when `channels.account.email === false`. The payload contains no coordinates and no full contact phone. A notice failure leaves the change committed and audits `protection_change_notice_failed`.
13. Audit rows for each event in §6. Grep-assert that no password, code or token appears in the logs.
14. The existing ADR-0012 suites (`step-up.test.ts`, `routes/step-up.test.ts`, the admin route tests) stay green and unmodified.

Mobile and web: the interstitial picks the correct path from the error code, the retry happens once, and there is no logout.

## 10. Explicitly out of scope

- `DELETE /v1/assets/:assetId/location` (A-2, pending compliance), and any location read, ingestion or flag.
- Tracker unlink, protection toggle, "Was this you?", next-of-kin and duress PIN (later stages).
- Action-bound step-up (ADR-0012 §4.2), passkeys, device attestation.
- Notifying the old emergency contact (a third party, so a compliance question).
- Gating `phone` changes on the profile. Flagged: if phone becomes an alert or OTP channel, it joins G-2.
- Email-change and in-session password-change routes (neither exists; each must be guarded and notify the old address when built).

## 11. Honest limits (binding on copy)

- **There is no power-off blocker.** Switching the phone off defeats every phone-side layer. Copy says: "TD IT cannot stop someone switching your phone off."
- **No covert capture.** This stage captures no camera, microphone or location data.
- A thief who knows the passcode may get the password through autofill, or a TOTP code from an authenticator on the same phone (RR-D4-1, RR-D4-2). The guard slows and records a thief; it does not make the phone theft-proof. Never claim that it does.
