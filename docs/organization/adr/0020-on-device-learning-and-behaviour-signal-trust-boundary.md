# ADR-0020: On-device learning and the trust boundary for behaviour signals

Status: **Proposed** — author `cto` (orchestrating), 2026-11-17. Security-architecture requirements are for `cybersecurity-architect` to confirm or amend; no concurrence has been filed. **Not a Stage 8 sign-off, not a compliance ruling, and not authority to enable location ingestion.**
Date: 2026-11-17
Deciders (to confirm): `cybersecurity-architect`, `solution-architect`, `mobile-architect`, `authentication-engineer`, `compliance-specialist`.
Context document: [`docs/features/021-theft-protection-signals/00-design-note.md`](../../features/021-theft-protection-signals/00-design-note.md).
Numbering note: **0019** is already used by *Partner visibility of all devices and background phone tracking* (Proposed, on the `spike/gt06-ingest-pilot` branch), so this ADR takes **0020**. Numbers are not recycled (ADR-0006 §16.7, R-4).

---

## 1. Context

ADR-0009 settled that a location asserted by a customer-controlled phone is a **claim**, not an observation, and that a claim may not on its own cause a real-world or third-party consequence (SDL-2). It also locked self-device tracking to `smartphone` assets, foreground/on-demand only, enforced server-side (SDL-11).

Feature 021 adds *more* customer-controlled assertions: where the phone's "usual places" are, whether movement looks unusual, whether the SIM was removed, whether location was switched off. It also adds a decision aid (a score) and a human process (customer check, then staff). Three questions are new and are not answered by ADR-0009, ADR-0012 or ADR-0006:

1. Where may a "known place" be learned and stored, and what may the server see?
2. What may a behaviour score be used for?
3. How strong must a re-authentication be before protection is switched off, given ADR-0012 covers privileged accounts and MFA?

## 2. Decisions

### D1 — Known places are learned and stored on the phone. The server receives only a label, a coarse zone and a flag.

- On-device learning produces candidate places (home, work, regular). The customer names, edits, deletes and pauses them.
- Per place the server may store: customer-chosen **label**, **coarse zone** (geohash cell; default precision 5, about 5 km; final precision set by `compliance-specialist` with `business-analyst`), `paused` boolean, and timestamps.
- The server must **never** receive or store: raw coordinates of a known place, visit history, dwell times, or the model/state the phone used to learn.
- Deleting a place on the phone deletes the server copy. Delete-my-data (Feature 015) deletes all of it.
- This is a data-minimisation control, not a security boundary: a compromised phone can lie about its places. That is accepted because of D2.

### D2 — A behaviour score is advice to a human. It never acts. (Extends ADR-0009 SDL-2.)

- The score is an integer with a **list of machine-readable reasons** (for example `far_from_known_zones`, `odd_hour`, `fast_travel`, `sim_removed`, `location_off_while_moving`). A score without reasons is not stored.
- A score may: raise an alert for **customer check** (D3); order a staff queue; be shown to staff with its reasons.
- A score may **not**: dispatch or task a partner, disclose location to a partner as an instruction, change policy or billing, or adjudicate a claim. Those need a documented human decision step (SDL-2) and, for partner handoff, ADR-0017.
- No decision with legal or similarly significant effect is taken solely on a score (POPIA s71). Staff review is mandatory before any outward action.
- Scoring rules live in versioned configuration, not in the client. Sensitivity levels (low/standard/high) and quiet hours change thresholds, never the rule that a human decides.
- Outcome records (false alarm / stolen / recovered) are audit and tuning data. Using them to train a model is a separate decision needing compliance review.

### D3 — "Was this you?" comes before staff, and its reply is itself a claim.

- On a score above the customer's threshold, push a short-timer "Was this you?" with "Yes, it was me" and "No, this was not me".
- A reply needs the D4 step-up. A "yes" from a stolen unlocked phone is the expected attack; so: silence past the timer **escalates**, "no" escalates, and (later entry) a **duress PIN** answers "yes" while silently escalating.
- In parallel, a high score may notify the customer's **trusted contact** (needs its own compliance ruling: a third party who is not a user).
- Staff are engaged only on "no", on no reply within the timer, or on a duress signal.

### D4 — Protection changes need a server-checked step-up; the on-device biometric is a convenience layer.

Switching protection off, removing a device, and changing emergency contacts require:

1. a **fresh server-verified credential** (password re-entry, or MFA if enrolled) producing a step-up window on the session, enforced server-side exactly as ADR-0012 does for invitations (`mfaVerifiedAt`-style window read from the live session, never from a token claim); and
2. optionally, an **on-device biometric or device-credential prompt** before the app even asks.

Reason: the server cannot verify a local biometric result. A claim "the biometric passed" is self-asserted. Only a server-checked credential is a control. A later hardening (a device-bound key released by biometric) is possible but is not assumed.

This **extends ADR-0012 to customer protection-change actions**. `authentication-engineer` and `cybersecurity-architect` must confirm that extension, including the window length and the out-of-band notification (SDL-9 pattern) on each change.

### D5 — Phone-only signals are best effort, platform-limited, and never load-bearing.

- Last-gasp on shutdown, SIM-removed and flight-mode signals exist only where the OS exposes them, mostly **Android**. iOS does not expose them to a normal app. The server must treat their absence as "unknown", never as "safe".
- No detection logic may depend on a phone signal arriving. Went-dark detection (server side) is the backstop.
- **There is no power-off blocker.** Android and iOS do not allow a normal app to intercept or block the power-off menu. No UI, copy, notification or marketing may claim or imply one.

### D6 — Background phone sensing is not decided here.

Items needing the phone to sense or report in the background are blocked behind ADR-0019 (owner decision), closure of INC-001 (server-side consent enforcement, A-7) and the Play background-location declaration. SDL-11's server-side scope lock stays in force. Nothing in this ADR relaxes it.

## 3. Alternatives considered

| Alternative | Why rejected |
|---|---|
| Learn and store known places on the server from raw location history | Concentrates the most revealing data we could hold (home, work, routine) on our servers; larger POPIA exposure; larger leak impact. |
| Trust the on-device biometric as the guard | The server cannot verify it; a modified client or a thief with the unlocked phone defeats it. Kept only as a convenience layer. |
| Let a high score auto-dispatch a partner | Violates SDL-2 and POPIA s71, and a forged signal would send people to a physical location. |
| Skip the customer check and go straight to staff | Floods staff with false alarms and treats a customer's own movement as an incident. |
| Promise to detect or prevent power-off | Not technically possible for a normal app on either platform; would be a false claim to customers. |

## 4. Consequences

- A small server model: `known_zones` (label, zone, paused), `behaviour_alerts` (score, reasons, state, timestamps, outcome), `protection_change_events` (audit). `database-architect` designs the schema; all are covered by delete-my-data and retention limits.
- Re-use: ADR-0012's step-up enforcement shape; ADR-0006's third trail for staff views; Feature 011 (SAPS number), Feature 019 (timeline), ADR-0017 (partner handoff) for the staff console.
- New work is mostly mobile-side (learning, prompts) and server-side rules, plus a staff queue.
- A thief with the unlocked phone can still do harm in the seconds before protections react. The design reduces and records that; it does not remove it. The honest-wording rules in the design note §7 exist so the product does not claim otherwise.

## 5. Residual risks accepted (for review)

1. A compromised phone can lie about places and signals (bounded by D2).
2. Coarse zones of home and work are still personal information (bounded by D1 minimisation, consent, deletion and retention).
3. A customer who is coerced may answer "Was this you?" with "yes" (bounded by the duress-PIN entry, which has its own safety review).
4. Phone signals are missing on iOS and when the OS kills the app (bounded by D5).

## 6. What this ADR does not authorize

- Not authority to enable `LOCATION_INGESTION_ENABLED` or any `EXPO_PUBLIC_FEATURE_*` flag. Release Gate A is not widened.
- Not a Stage 8 disposition, QA sign-off, compliance ruling or `product-manager` approval.
- Not an API contract or schema approval, and not an instruction to add `expo-location`, a background task, a native module or a permission string.
- Not a decision on background tracking (ADR-0019) or on partner location sharing (ADR-0017).

## 7. Follow-ups

`compliance-specialist`: see the routing request. `authentication-engineer`: D4 window length and the notification on each change. `database-architect`: schema and retention. `mobile-architect`: on-device learning storage and the platform signal matrix. `ai-solutions-architect`: scoring limits and the rule against automated action. `cto`: ratify or amend after concurrences.

---

## 8. Addendum (2026-11-17, second owner brief) — decisions D7–D10

Appended by `cto`. Sections 1–7 are unchanged and stay Proposed.

### D7 — The independent hardware tracker is the strongest layer and stays vendor-agnostic

It keeps reporting after the phone is off, so it is the only layer that does not depend on the phone. It is built behind `HardwareProvider` and the existing `capabilities` shape. No vendor-specific field may enter `tracking-profile.ts`, `tracking-device-types.ts` or the `tracking-devices` repository before the vendor ADR (scorecard §6). Went-dark detection (server side) is the primary consumer of its heartbeat. ADR-0018's U907 pilot is a pilot only.

### D8 — Network and charger signals are hashed on the phone; the server sees an opaque identifier and a reason

A Wi-Fi network or charger counts as "new" when the **phone** has not seen its salted hash before. The server receives at most an opaque identifier and the reason code (`new_wifi`, `new_charger`), never an SSID, BSSID or location derived from one. Staff see the reason in plain words. Like all phone signals this is a claim (D5): absence is "unknown", never "safe".

### D9 — No covert camera or microphone capture; the selfie is a gated exception

No feature may capture camera or microphone content without the user's knowledge. Lost-mode plays an audible alarm and shows a lock-screen message; it records nothing and has no remote camera. The Android "thief selfie" after repeated wrong unlocks is **opt-in, clearly disclosed, behind a feature flag, and blocked until legal and Google Play policy review pass** (TP-17). Not available on iOS. Ratifying this ADR does not approve it.

### D10 — The theft-hardening score is a self-attested checklist, not verification

The app usually cannot read whether quick settings are off, the passcode is long, a SIM PIN is set, or the platform's theft features are on (iOS exposes almost none of it). The score therefore counts what the customer **confirms**, links to the correct settings screen, and states that it is unverified. It must never claim the phone is "protected". Feature names are verified against each platform's own documentation before any copy is written.

### What this addendum still does not authorize

Same as §6: no flag, no ingestion, no code, no native module, no permission string, no Stage 8 or compliance conclusion. Next-of-kin sharing is a separate trust boundary and is in ADR-0021.

---

## 9. cybersecurity-architect review of D4 (2026-11-17)

Appended by `cybersecurity-architect`. Sections 1–8 are unchanged. This covers **D4 only**. It is not a review of D1–D3 or D5–D10, not a Stage 8 sign-off, and not a compliance ruling. It authorizes no flag. `LOCATION_INGESTION_ENABLED` stays off and Release Gate A is not widened.

### 9.1 Verdict: **concur with amendments**

The core of D4 is right, and I concur with it: a protection change needs a credential the **server** checks, read live from the session row (ADR-0012 INV-3), and the on-device biometric is only a UX layer, because the server cannot verify it. Stage (b) engineering may start against [`03-stage-b-step-up-spec.md`](../../features/021-theft-protection-signals/03-stage-b-step-up-spec.md). **Nothing from stage (b) merges to `main` until `cto` ratifies this ADR with the amendments below and the stage passes its own Stage 8.**

### 9.2 What I checked in code (2026-11-17, branch `feat/mobile-assets-redesign`)

- `backend/src/lib/step-up.ts`: `requireStepUp` reads `ctx.sessions.findById` live, fails closed on a revoked or missing session, and checks only `mfaVerifiedAt`. `STEP_UP_ACTIONS` has five admin rows and no customer rows.
- `backend/src/routes/step-up.ts`: the TOTP challenge/verify flow is generic. Nothing in it is admin-only, so customers who have enrolled MFA can reuse it as it stands. With no factor it returns `MFA_NOT_ENROLLED`. It does not fall back to a password.
- `backend/src/lib/policy.ts:200`: `INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS = 15 * 60` is the only window defined.
- Customers authenticate with a password through Supabase (`ctx.supabase.verifyPassword`, `routes/auth.ts:729`). MFA is optional for them (`mfaRequired` is set only for privileged types). `supabase/config.toml` enables no external OAuth provider.
- Routes D4 touches: `DELETE /v1/assets/:assetId` exists and has no step-up. Emergency contact is a field on `PATCH /v1/account/profile` and has no step-up. `DELETE /v1/assets/:assetId/location` is the **POPIA s18 consent-withdrawal and history-purge** route (INC-002 §9.6 C-5). **There is no tracker-unlink route** and no "protection off" toggle route.
- `auth-notification-service.ts`: security emails respect `channels.account.email`, which the customer can switch off through `PATCH /v1/notifications/preferences`. That route has no step-up.

### 9.3 Amendments (A-1 to A-3 block merge; A-4 to A-8 are conditions)

**A-1 (blocking): D4 conflicts with ratified ADR-0012, so the password path is an explicit, scoped exception.** ADR-0012 §3 (Tier A-reserved note), §4.3 and §8.4 say password re-entry is not an acceptable step-up, and that applies to customer Tier A actions too. I wrote that rule for a different threat: remote session theft or credential compromise against privileged accounts. Here the main threat is a thief who has the unlocked phone and its live session but usually not the password, and against that threat a fresh password check adds real protection. I therefore accept password re-entry **only** for the D4 protection-change class, **only** for customer accounts with no verified TOTP factor, and only under all of these constraints:
- (a) A password check **never writes `mfa_verified_at`**, because that would break ADR-0012 INV-1. It writes a separate session column, `password_reauth_at`. Neither ADR-0012 Tier A actions nor ADR-0012 Tier A-reserved actions may ever accept it.
- (b) If the account has a verified TOTP factor, the password path is refused. This prevents a downgrade.
- (c) Its window is short (A-4).
- (d) It carries residual risk RR-D4-1 (§9.4).

Upon ratification, `cto` must add a cross-reference section to ADR-0012 recording this exception, so the two ADRs do not contradict each other in the tree.

**A-2 (blocking): stage (b) must not gate `DELETE /v1/assets/:assetId/location`.** That route is the customer's POPIA s18 withdrawal right, and INC-002 C-5 requires withdrawal to always succeed. Adding friction to it is a compliance decision, not mine. My proposal to `compliance-specialist`:
- Stopping collection stays immediate and ungated, as it is today. Gating it would gain nothing anyway, because a thief can simply switch location off on the phone.
- Only the **irreversible history purge** gets protection. It needs a fresh re-authentication, or else it is deferred and the customer is told, and it is held while an open recovery case references the asset (possible evidence-preservation ground).

Until `compliance-specialist` rules, the route stays exactly as it is.

**A-3 (blocking): protection-change notices cannot be suppressed.** Otherwise a thief switches off account email first and then makes changes unseen. The notice for each change goes by email through Resend regardless of `channels.account.email`, following the SDL-9 pattern. Production Resend delivery is still owner-pending. That is a launch dependency, not a reason to skip the notice.

**A-4: window.** `PROTECTION_CHANGE_STEP_UP_WINDOW_SECONDS = 5 * 60`, for both the MFA and the password path, defined in `policy.ts`. 15 minutes is too long a ride-along budget for a snatch theft that happens while the app is open.

**A-5: D3 correction.** Only a **"Yes, it was me"** reply needs step-up, because only "yes" lowers protection. "No", and silence, must never need step-up. Escalating should cost nothing, and a false "no" costs only a staff look.

**A-6: structural guard.** Removing an asset, and any future tracker unlink, is refused while an open recovery case or claim references that asset, whatever the step-up state. A thief must not be able to make a reported-stolen asset disappear.

**A-7: the biometric limits in spec §8 are binding.** No request field may carry a biometric result. The client may not store the password behind a biometric. Adding `expo-local-authentication` is `mobile-architect`'s decision, and this ADR does not authorize it (§6).

**A-8: merge constraint (same as ADR-0012 §9.5).** Server-side enforcement ships together with the mobile and web `STEP_UP_REQUIRED` interstitials, because Render deploys `main` directly.

### 9.4 Residual risks (for `cto` acceptance; none is accepted silently)

| ID | Risk | Bounded by | Owner |
|---|---|---|---|
| RR-D4-1 | Thief knows the phone passcode and gets the password through password-manager autofill, or resets it from the mail app on the same phone | 5-min window, notices that cannot be suppressed, A-6, lockout that revokes the session (spec §7) | `cybersecurity-architect` |
| RR-D4-2 | A TOTP authenticator on the same stolen phone gives the thief the "MFA" factor too | Same as RR-D4-1; MFA here proves possession of the phone, not a second device | `cybersecurity-architect` |
| RR-D4-3 | The thief acts in the seconds before any protection reacts; the notice is after the fact | Audit plus notice; D4 records and limits this, it does not prevent it | `cybersecurity-architect` |
| RR-D4-4 | No power-off blocker exists; switching the phone off defeats every phone-side layer | D5, D7 (hardware tracker), honest wording | `product-manager` (copy) |

### 9.5 Revisit triggers

Revisit if any of these happen:
- an ATO incident shows the password path was defeated;
- an email-change or password-change-while-signed-in route is added (each must be gated and must notify the old address);
- passkeys or a device-bound key released by biometric are adopted, which would let the biometric become a real control under a new ADR;
- a customer Tier A action from ADR-0012 ships.


---

## 10. `cto` ratification (2026-11-17) — conditional

Appended by `cto`, acting under the owner's instruction to act as `cto` on this feature. Sections 1–9 are unchanged.

**Ratified, as amended by §9:** D4 (server-checked step-up for protection changes, with the narrow password re-authentication exception for customers without a TOTP factor), D2 (a score advises a human and never acts), D3 (the "Was this you?" reply needs the same step-up; only a "yes" needs it), D5 (phone signals are best effort and never load-bearing; there is no power-off blocker), D9 (no covert camera or microphone), D10 (the theft-hardening score is self-attested). The four residual risks RR-D4-1 to RR-D4-4 in §9 are **accepted** by `cto`.

**Ratified as direction only, not yet buildable:** D1 (known places learned on the phone), D6 (background sensing is not decided here), D7 (hardware tracker stays vendor-agnostic) and D8 (hashed network and charger signals). Each still needs the compliance rulings listed in the routing request and, for anything that touches location, closure of INC-001.

**Conditions on this ratification (none reopens the decision):**
1. **Not a Stage 8 sign-off, QA sign-off or compliance ruling.** Stage 8 and Stage 10 remain hard gates for every stage. `compliance-specialist`'s concurrence is still outstanding and is a condition on D1, D2 and D8, not discharged here.
2. **Server and client ship together.** The server guard (backend PR) and the mobile re-authentication prompts must be deployed in the same release; Render deploys `main` directly, so the guard must not reach production alone.
3. **Production Resend delivery must be live before release.** Protection-change notices are a launch dependency, and the sender is still an owner action.
4. **Migration 041** (`password_reauth_at`, `protection_detail`, new audit event types) needs `database-architect` review before it is applied anywhere.
5. **`authentication-engineer`** must confirm that the GoTrue session created by the password check is handled as at login, and that exhausting the lockout revokes only the current session.
6. **`cybersecurity-architect`** to confirm the amendments recorded in §9 (A-1 to A-4) are implemented as written, at Stage 8.
7. The consent-withdrawal route (`DELETE /assets/:id/location`) stays ungated until `compliance-specialist` rules on the s18 point in §9.
8. Ratification does not widen Release Gate A, enable `LOCATION_INGESTION_ENABLED`, or authorise any flag change.

The owner remains free to overrule any part of this ratification.
